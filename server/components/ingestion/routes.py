"""Data extraction / ingestion endpoints.

  POST /api/ingest/upload               upload a file → extract fields via external API
  POST /api/ingest/validate             check extracted fields against mandatory schema
  POST /api/ingest/complete             accept user-corrected fields, mark complete
  GET  /api/ingest/history              list all tracked uploads
  POST /api/ingest/extract-json         insert into structured policy table
  POST /api/ingest/claims-json          insert into structured claims table
  GET  /api/ingest/claims-json/rows     query structured claims rows
"""

import base64
import email
import json
import os
import sys
import uuid

import requests
from flask import Blueprint, jsonify, request

import config

from . import azure_csv_store, extraction_store, claims_extraction_store, image_store, schema, store

bp = Blueprint('ingestion', __name__)


def on_startup():
    """Pre-create Azure Blob CSV files (with headers) for all policy + claims tables."""
    result = azure_csv_store.ensure_blobs()
    if result:
        created = [k for k, v in result.items() if v]
        if created:
            print(f'Azure CSV blobs created: {", ".join(created)}', file=sys.stderr)
        else:
            print('Azure CSV blobs: all already exist.', file=sys.stderr)
    else:
        print('Azure CSV blobs: skipped (no Azure credentials configured).', file=sys.stderr)


# ---- Helpers ----------------------------------------------------------------

def _file_type(filename: str) -> str:
    ext = (filename.rsplit('.', 1)[-1] if '.' in filename else '').lower()
    return {
        'pdf': 'PDF', 'xlsx': 'Excel', 'xls': 'Excel', 'csv': 'CSV',
        'docx': 'Word', 'doc': 'Word', 'eml': 'Email', 'msg': 'Email',
    }.get(ext, 'File')


def _save_raw(file, doc_id: str) -> str:
    """Save the uploaded file under UPLOAD_TEMP_DIR/{doc_id}/."""
    dest_dir = os.path.join(config.UPLOAD_TEMP_DIR, doc_id)
    os.makedirs(dest_dir, exist_ok=True)
    dest = os.path.join(dest_dir, file.filename)
    file.save(dest)
    return dest


def _call_extraction_api(file_path: str, content_type: str) -> dict:
    """POST the file to the external extraction service and return its JSON."""
    if not config.EXTRACTION_API_URL:
        raise RuntimeError('EXTRACTION_API_URL is not configured in .env')

    headers = {}
    if config.EXTRACTION_API_KEY:
        headers['Authorization'] = f'Bearer {config.EXTRACTION_API_KEY}'

    with open(file_path, 'rb') as f:
        resp = requests.post(
            config.EXTRACTION_API_URL,
            files={'document': (os.path.basename(file_path), f, content_type)},
            headers=headers,
            timeout=config.EXTRACTION_API_TIMEOUT,
        )
    resp.raise_for_status()
    return resp.json()


def _extract_images_from_eml(file_path: str) -> list[dict]:
    """Parse a .eml file and extract image attachments as base64."""
    images = []
    try:
        with open(file_path, 'rb') as f:
            msg = email.message_from_binary_file(f)
        for part in msg.walk():
            ct = part.get_content_type() or ''
            if ct.startswith('image/'):
                payload = part.get_payload(decode=True)
                if payload:
                    images.append({
                        'data': base64.b64encode(payload).decode('ascii'),
                        'content_type': ct,
                        'filename': part.get_filename(),
                    })
    except Exception as e:
        print(f'Image extraction from eml failed: {e}', file=sys.stderr)
    return images


def _error(route: str, e: Exception):
    print(f'{route} failed: {e}', file=sys.stderr)
    return jsonify({'error': str(e)}), 500


# ---- Routes -----------------------------------------------------------------

@bp.route('/api/ingest/upload', methods=['POST'])
def upload_document():
    """Accept a file upload, run extraction, validate against structured schema.

    Returns the extraction result + validation info. If missing_required is
    empty the row was auto-inserted into the structured table. Otherwise the
    frontend should show a modal for the user to fill missing fields and then
    POST to /api/ingest/extract-json with the original json_blob + extra_fields.
    """
    file = request.files.get('document')
    if not file or not file.filename:
        return jsonify({'error': 'No file provided'}), 400

    if file.content_length and file.content_length > config.MAX_UPLOAD_BYTES:
        return jsonify({'error': f'File exceeds {config.MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit'}), 400

    doc_id = str(uuid.uuid4())
    filename = file.filename
    content_type = file.content_type or 'application/octet-stream'
    ftype = _file_type(filename)

    try:
        store.create(doc_id, filename, ftype, content_type)

        raw_path = _save_raw(file, doc_id)
        store.update_status(doc_id, 'EXTRACTING')

        extracted = _call_extraction_api(raw_path, content_type)

        # The API may return fields under 'extracted_fields' or 'fields'.
        raw_fields = extracted.get('extracted_fields') or extracted.get('fields') or {}

        # Classification may be a dict or nested in fields.
        classification_obj = extracted.get('classification', {})
        if isinstance(classification_obj, dict):
            classification = classification_obj.get('subcategory') or classification_obj.get('value')
            lob = classification_obj.get('lob')
            category = classification_obj.get('category')
            subcategory = classification_obj.get('subcategory', '')
        else:
            classification = str(classification_obj) if classification_obj else None
            lob = extracted.get('lob')
            category = None
            subcategory = classification or ''

        # Store images: from the extraction API, or parsed from .eml attachments.
        image_ids: list[str] = []
        raw_images = extracted.get('images') or []
        if not raw_images and ftype == 'Email':
            raw_images = _extract_images_from_eml(raw_path)
        for img in raw_images:
            img_data = img.get('data') or img.get('base64') or ''
            img_ct = img.get('content_type') or img.get('mime_type') or 'image/png'
            img_fn = img.get('filename')
            if img_data:
                iid = image_store.insert_image(
                    doc_id=doc_id,
                    image_data=img_data,
                    content_type=img_ct,
                    lob=lob,
                    filename=img_fn,
                )
                image_ids.append(iid)

        store.update_status(
            doc_id, 'VALIDATION',
            extracted_fields=raw_fields,
            lob=lob,
            classification=classification,
            image_ids=image_ids or None,
        )

        # Build the json_blob in the shape the store expects.
        is_claims = category and category.lower().startswith('claim')
        json_blob = {
            'classification': {
                'category': category or 'policy',
                'subcategory': subcategory,
                'lob': lob or '',
            },
            'extracted_fields': raw_fields,
        }
        if image_ids:
            json_blob['image_ids'] = image_ids

        # Pick the right store based on category.
        active_store = claims_extraction_store if is_claims else extraction_store
        insert_route = '/api/ingest/claims-json' if is_claims else '/api/ingest/extract-json'

        # Validate against the structured schema.
        try:
            validation = active_store.validate_json(json_blob)
        except KeyError:
            # Unknown subcategory — no structured insert, mark as completed.
            store.update_status(doc_id, 'COMPLETED', final_fields=raw_fields, lob=lob, classification=classification, image_ids=image_ids or None)
            return jsonify({
                'docId': doc_id,
                'filename': filename,
                'extracted': raw_fields,
                'classification': classification_obj,
                'lob': lob,
                'json_blob': json_blob,
                'structured': False,
                'image_ids': image_ids,
            }), 201

        # Always return validation for frontend preview — no auto-insert.
        return jsonify({
            'docId': doc_id,
            'filename': filename,
            'extracted': raw_fields,
            'classification': classification_obj,
            'lob': lob,
            'json_blob': json_blob,
            'structured': True,
            'auto_inserted': False,
            'table': validation['table'],
            'subcategory': validation['subcategory'],
            'row': validation['row'],
            'missing_required': validation['missing_required'],
            'missing_recommended': validation.get('missing_recommended', []),
            'insert_route': insert_route,
            'image_ids': image_ids,
        }), 201

    except Exception as e:
        store.update_status(doc_id, 'FAILED', error=str(e))
        return _error('POST /api/ingest/upload', e)


@bp.route('/api/ingest/upload-thread', methods=['POST'])
def upload_email_thread():
    """Accept multiple .eml files as a single email thread.

    All files are sent to the extraction API individually, then the results
    are merged into ONE document entry. The thread_name form field is used
    as the display filename.
    """
    files = request.files.getlist('documents')
    thread_name = request.form.get('thread_name', '').strip()

    if not files:
        return jsonify({'error': 'No files provided'}), 400

    doc_id = str(uuid.uuid4())
    display_name = thread_name or f'Email thread ({len(files)} messages)'
    ftype = 'Email'

    try:
        store.create(doc_id, display_name, ftype, 'message/rfc822')
        store.update_status(doc_id, 'EXTRACTING')

        # Extract each .eml file and collect results
        extractions: list[dict] = []
        merged_images: list[dict] = []

        for file in files:
            raw_path = _save_raw(file, doc_id)
            ct = file.content_type or 'message/rfc822'
            try:
                extracted = _call_extraction_api(raw_path, ct)
            except Exception as e:
                print(f'Extraction failed for {file.filename}: {e}', file=sys.stderr)
                continue

            file_fields = extracted.get('extracted_fields') or extracted.get('fields') or {}
            cls = extracted.get('classification', {})
            extractions.append({'fields': file_fields, 'classification': cls})

            # Collect images: from API response, or parse from .eml attachments
            api_images = extracted.get('images') or []
            if not api_images:
                api_images = _extract_images_from_eml(raw_path)
            for img in api_images:
                merged_images.append(img)

        # Determine the "first" email by content date (earliest date wins).
        _DATE_KEYS = ('DATE_OF_INTIMATION', 'POL_EFF_DATE', 'POL_ISSUE_DATE',
                      'DATE_OF_LOSS', 'TXN_DATE', 'date', 'sent_date')

        def _earliest_date(fields: dict) -> str:
            for key in _DATE_KEYS:
                val = fields.get(key)
                if isinstance(val, dict):
                    val = val.get('value')
                if val and isinstance(val, str):
                    return val
            return '\xff'

        extractions.sort(key=lambda e: _earliest_date(e['fields']))

        # Classification comes from the first (earliest) email
        classification_obj: dict = {}
        lob = None
        category = None
        subcategory = ''
        for ext in extractions:
            cls = ext['classification']
            print(f'[thread] email classification: {cls}', file=sys.stderr)
            if isinstance(cls, dict) and cls.get('subcategory'):
                classification_obj = cls
                lob = cls.get('lob')
                category = cls.get('category')
                subcategory = cls.get('subcategory', '')
                break

        if not classification_obj:
            classification_obj = {}

        print(f'[thread] resolved: category={category}, subcategory={subcategory}, lob={lob}', file=sys.stderr)

        # Merge fields: later emails add context, earlier values take priority
        merged_fields: dict = {}
        for ext in reversed(extractions):
            for k, v in ext['fields'].items():
                if v is not None and v != '':
                    merged_fields[k] = v
        # First email's fields override (it's the reference)
        if extractions:
            for k, v in extractions[0]['fields'].items():
                if v is not None and v != '':
                    merged_fields[k] = v

        classification = subcategory or classification_obj.get('value')

        # Store images
        image_ids: list[str] = []
        for img in merged_images:
            img_data = img.get('data') or img.get('base64') or ''
            img_ct = img.get('content_type') or img.get('mime_type') or 'image/png'
            img_fn = img.get('filename')
            if img_data:
                iid = image_store.insert_image(
                    doc_id=doc_id,
                    image_data=img_data,
                    content_type=img_ct,
                    lob=lob,
                    filename=img_fn,
                )
                image_ids.append(iid)

        store.update_status(
            doc_id, 'VALIDATION',
            extracted_fields=merged_fields,
            lob=lob,
            classification=classification,
            image_ids=image_ids or None,
        )

        # Build json_blob
        is_claims = category and category.lower().startswith('claim')
        json_blob = {
            'classification': {
                'category': category or 'policy',
                'subcategory': subcategory,
                'lob': lob or '',
            },
            'extracted_fields': merged_fields,
        }
        if image_ids:
            json_blob['image_ids'] = image_ids

        active_store = claims_extraction_store if is_claims else extraction_store
        insert_route = '/api/ingest/claims-json' if is_claims else '/api/ingest/extract-json'

        print(f'[thread] is_claims={is_claims}, active_store={active_store.__name__}, image_ids={image_ids}', file=sys.stderr)

        # Validate and insert
        try:
            validation = active_store.validate_json(json_blob)
            print(f'[thread] validation OK: table={validation["table"]}, missing_required={validation["missing_required"]}', file=sys.stderr)
        except KeyError as ke:
            print(f'[thread] KeyError during validate: {ke} — subcategory "{subcategory}" not in tables', file=sys.stderr)
            store.update_status(doc_id, 'COMPLETED', final_fields=merged_fields, lob=lob, classification=classification, image_ids=image_ids or None)
            return jsonify({
                'docId': doc_id,
                'filename': display_name,
                'extracted': merged_fields,
                'classification': classification_obj,
                'lob': lob,
                'json_blob': json_blob,
                'structured': False,
                'image_ids': image_ids,
            }), 201

        # Always return validation for frontend preview — no auto-insert.
        return jsonify({
            'docId': doc_id,
            'filename': display_name,
            'extracted': merged_fields,
            'classification': classification_obj,
            'lob': lob,
            'json_blob': json_blob,
            'structured': True,
            'auto_inserted': False,
            'table': validation['table'],
            'subcategory': validation['subcategory'],
            'row': validation['row'],
            'missing_required': validation['missing_required'],
            'missing_recommended': validation.get('missing_recommended', []),
            'insert_route': insert_route,
            'image_ids': image_ids,
        }), 201

    except Exception as e:
        store.update_status(doc_id, 'FAILED', error=str(e))
        return _error('POST /api/ingest/upload-thread', e)


@bp.route('/api/ingest/validate', methods=['POST'])
def validate_extraction():
    """Check extracted fields against the mandatory schema."""
    body = request.get_json(silent=True) or {}
    doc_id = body.get('docId', '')
    fields = body.get('fields', {})
    classification = body.get('classification')

    if not doc_id:
        return jsonify({'error': 'docId is required'}), 400

    missing, low_confidence = schema.validate(fields, classification)

    return jsonify({
        'docId': doc_id,
        'complete': len(missing) == 0,
        'missingFields': missing,
        'lowConfidenceFields': low_confidence,
        'fields': fields,
    })


@bp.route('/api/ingest/complete', methods=['POST'])
def complete_extraction():
    """Accept user-corrected fields and mark the document as complete."""
    body = request.get_json(silent=True) or {}
    doc_id = body.get('docId', '').strip()
    final_fields = body.get('fields', {})
    classification = body.get('classification')
    lob = body.get('lob')

    if not doc_id:
        return jsonify({'error': 'docId is required'}), 400

    doc = store.get(doc_id)
    if not doc:
        return jsonify({'error': 'Document not found'}), 404

    # Re-validate server-side.
    required = schema.get_required(classification)
    still_missing = [f for f in required if not final_fields.get(f)]
    if still_missing:
        return jsonify({'error': 'Missing required fields', 'fields': still_missing}), 400

    try:
        store.update_status(
            doc_id, 'COMPLETED',
            final_fields=final_fields,
            lob=lob,
            classification=classification,
        )

        store.save_final_records(doc_id, final_fields, classification=classification, lob=lob)

        # Trigger the Fabric ingestion notebook if configured.
        if config.FABRIC_INGESTION_NOTEBOOK_ID and config.FABRIC_WORKSPACE_ID:
            try:
                from core import fabric_api
                fabric_api.run_notebook(
                    config.FABRIC_INGESTION_NOTEBOOK_ID,
                    {'doc_id': doc_id, 'classification': classification or '', 'lob': lob or ''},
                )
            except Exception as e:
                print(f'Ingestion notebook trigger failed: {e}', file=sys.stderr)

        return jsonify(store.get(doc_id))
    except Exception as e:
        store.update_status(doc_id, 'FAILED', error=str(e))
        return _error('POST /api/ingest/complete', e)


@bp.route('/api/ingest/history')
def ingest_history():
    """All tracked uploads, newest first. Optional ?doc_id= for single record."""
    try:
        doc_id = request.args.get('doc_id')
        if doc_id:
            doc = store.get(doc_id)
            return jsonify([doc] if doc else [])
        limit = request.args.get('limit', 100, type=int)
        return jsonify(store.list_all(limit))
    except Exception as e:
        return _error('GET /api/ingest/history', e)


@bp.route('/api/ingest/records')
def ingest_records():
    """Extracted field records, row-per-field. Optional ?doc_id= or ?classification= filter."""
    try:
        doc_id = request.args.get('doc_id')
        if doc_id:
            return jsonify(store.get_records(doc_id))
        classification = request.args.get('classification')
        limit = request.args.get('limit', 500, type=int)
        return jsonify(store.list_records(limit, classification))
    except Exception as e:
        return _error('GET /api/ingest/records', e)


# ---- Structured extraction tables -------------------------------------------

@bp.route('/api/ingest/extract-json/validate', methods=['POST'])
def extract_json_validate():
    """Map and validate extraction JSON without inserting. Returns mapped row + missing fields."""
    body = request.get_json(silent=True)
    if not body:
        return jsonify({'error': 'Request body must be JSON'}), 400

    classification = body.get('classification', {})
    subcategory = classification.get('subcategory', '')
    if not subcategory:
        return jsonify({'error': 'classification.subcategory is required'}), 400

    try:
        result = extraction_store.validate_json(body)
        return jsonify(result)
    except KeyError:
        valid = list(extraction_store.es.SUBCATEGORY_TABLES.keys())
        return jsonify({'error': f'Unknown subcategory "{subcategory}". Valid: {valid}'}), 400
    except Exception as e:
        return _error('POST /api/ingest/extract-json/validate', e)


@bp.route('/api/ingest/extract-json', methods=['POST'])
def extract_json():
    """Insert into structured table. Accepts original JSON + optional extra_fields from the user."""
    body = request.get_json(silent=True)
    if not body:
        return jsonify({'error': 'Request body must be JSON'}), 400

    json_blob = body.get('json_blob') or body
    extra_fields = body.get('extra_fields', {})

    classification = (json_blob.get('classification') or {})
    subcategory = classification.get('subcategory', '')
    if not subcategory:
        return jsonify({'error': 'classification.subcategory is required'}), 400

    try:
        result = extraction_store.insert_from_json(json_blob, extra_fields or None)

        upload_doc_id = body.get('upload_doc_id')
        if upload_doc_id:
            store.update_status(upload_doc_id, 'COMPLETED')

        return jsonify(result), 201
    except KeyError:
        valid = list(extraction_store.es.SUBCATEGORY_TABLES.keys())
        return jsonify({'error': f'Unknown subcategory "{subcategory}". Valid: {valid}'}), 400
    except Exception as e:
        return _error('POST /api/ingest/extract-json', e)


@bp.route('/api/ingest/extract-json/rows')
def extract_json_rows():
    """Query structured extraction rows. ?subcategory= required, optional ?doc_id=."""
    subcategory = request.args.get('subcategory', '').strip()
    if not subcategory:
        return jsonify({'error': 'subcategory query param is required'}), 400

    try:
        doc_id = request.args.get('doc_id')
        if doc_id:
            row = extraction_store.get_row(doc_id, subcategory)
            return jsonify(row if row else {'error': 'Not found'}), 200 if row else 404
        limit = request.args.get('limit', 100, type=int)
        return jsonify(extraction_store.list_rows(subcategory, limit))
    except KeyError:
        return jsonify({'error': f'Unknown subcategory "{subcategory}"'}), 400
    except Exception as e:
        return _error('GET /api/ingest/extract-json/rows', e)


# ---- Structured claims tables ------------------------------------------------

@bp.route('/api/ingest/claims-json/validate', methods=['POST'])
def claims_json_validate():
    """Map and validate claims JSON without inserting."""
    body = request.get_json(silent=True)
    if not body:
        return jsonify({'error': 'Request body must be JSON'}), 400

    classification = body.get('classification', {})
    subcategory = classification.get('subcategory', '')
    if not subcategory:
        return jsonify({'error': 'classification.subcategory is required'}), 400

    try:
        result = claims_extraction_store.validate_json(body)
        return jsonify(result)
    except KeyError:
        from . import claims_extraction_schema as cs
        valid = list(cs.SUBCATEGORY_TABLES.keys())
        return jsonify({'error': f'Unknown claims subcategory "{subcategory}". Valid: {valid}'}), 400
    except Exception as e:
        return _error('POST /api/ingest/claims-json/validate', e)


@bp.route('/api/ingest/claims-json', methods=['POST'])
def claims_json():
    """Insert into structured claims table. Accepts original JSON + optional extra_fields."""
    body = request.get_json(silent=True)
    if not body:
        return jsonify({'error': 'Request body must be JSON'}), 400

    json_blob = body.get('json_blob') or body
    extra_fields = body.get('extra_fields', {})

    classification = (json_blob.get('classification') or {})
    subcategory = classification.get('subcategory', '')
    if not subcategory:
        return jsonify({'error': 'classification.subcategory is required'}), 400

    try:
        result = claims_extraction_store.insert_from_json(json_blob, extra_fields or None)

        upload_doc_id = body.get('upload_doc_id')
        if upload_doc_id:
            store.update_status(upload_doc_id, 'COMPLETED')

        return jsonify(result), 201
    except KeyError:
        from . import claims_extraction_schema as cs
        valid = list(cs.SUBCATEGORY_TABLES.keys())
        return jsonify({'error': f'Unknown claims subcategory "{subcategory}". Valid: {valid}'}), 400
    except Exception as e:
        return _error('POST /api/ingest/claims-json', e)


@bp.route('/api/ingest/claims-json/rows')
def claims_json_rows():
    """Query structured claims rows. ?subcategory= required, optional ?doc_id=."""
    subcategory = request.args.get('subcategory', '').strip()
    if not subcategory:
        return jsonify({'error': 'subcategory query param is required'}), 400

    try:
        doc_id = request.args.get('doc_id')
        if doc_id:
            row = claims_extraction_store.get_row(doc_id, subcategory)
            return jsonify(row if row else {'error': 'Not found'}), 200 if row else 404
        limit = request.args.get('limit', 100, type=int)
        return jsonify(claims_extraction_store.list_rows(subcategory, limit))
    except KeyError:
        return jsonify({'error': f'Unknown claims subcategory "{subcategory}"'}), 400
    except Exception as e:
        return _error('GET /api/ingest/claims-json/rows', e)


# ---- Image endpoints ---------------------------------------------------------

@bp.route('/api/ingest/debug-extract', methods=['POST'])
def debug_extract():
    """Debug: show raw extraction API response for a single file."""
    file = request.files.get('document')
    if not file or not file.filename:
        return jsonify({'error': 'No file provided'}), 400

    doc_id = f'debug-{uuid.uuid4()}'
    try:
        raw_path = _save_raw(file, doc_id)
        ct = file.content_type or 'application/octet-stream'
        extracted = _call_extraction_api(raw_path, ct)
        return jsonify({
            'raw_response_keys': list(extracted.keys()),
            'classification': extracted.get('classification'),
            'extracted_fields_keys': list((extracted.get('extracted_fields') or extracted.get('fields') or {}).keys()),
            'images_count': len(extracted.get('images') or []),
            'images_sample': [
                {k: v for k, v in img.items() if k != 'data' and k != 'base64'}
                for img in (extracted.get('images') or [])[:3]
            ],
            'full_classification': extracted.get('classification'),
            'raw_fields_sample': {k: (v if not isinstance(v, str) or len(v) < 200 else v[:200] + '...') for k, v in list((extracted.get('extracted_fields') or extracted.get('fields') or {}).items())[:20]},
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/ingest/images/<image_id>')
def get_image(image_id):
    """Return a single image's base64 data + metadata."""
    img = image_store.get_image(image_id)
    if not img:
        return jsonify({'error': 'Image not found'}), 404
    return jsonify({
        'image_id': img['IMAGE_ID'],
        'doc_id': img['DOC_ID'],
        'lob': img['LOB'],
        'content_type': img['CONTENT_TYPE'],
        'filename': img['FILENAME'],
        'data': img['IMAGE_DATA'],
        'created_at': img['CREATED_AT'],
    })


@bp.route('/api/ingest/images/doc/<doc_id>')
def get_images_for_doc(doc_id):
    """Return metadata (without raw data) for all images linked to a document."""
    images = image_store.get_images_for_doc(doc_id)
    return jsonify([{
        'image_id': img['IMAGE_ID'],
        'doc_id': img['DOC_ID'],
        'lob': img['LOB'],
        'content_type': img['CONTENT_TYPE'],
        'filename': img['FILENAME'],
        'created_at': img['CREATED_AT'],
    } for img in images])
