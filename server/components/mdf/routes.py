"""MDF (Metadata-Driven Framework) endpoints.

  GET  /api/mdf/ingestion-objects   list objects from the Fabric Warehouse
                                    (OBJECT_NAME + IS_ACTIVE)
  POST /api/mdf/ingestion-objects   insert a new object into the Warehouse
  PUT  /api/mdf/ingestion-objects   update IS_ACTIVE directly in the Warehouse
  GET  /api/mdf/sources             list available sources from SOURCE_CONFIG
  GET  /api/mdf/execution-history   audit logs from PIPELINE_AUDIT_LOG
  POST /api/mdf/execute-pipeline   trigger DA_Orch_PL_Parent pipeline
  GET  /api/mdf/source-configs     list all source config records
  POST /api/mdf/source-config      insert a new source config record
  GET  /api/mdf/pipeline-configs   list all pipeline config records
  POST /api/mdf/pipeline-config    insert a new pipeline config record
"""

import re
import sys
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

import config
from core import fabric_api, fabric_sql

bp = Blueprint('mdf', __name__)

_IDENTIFIER = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*$')


def _s(body: dict, key: str) -> str:
    return str(body.get(key) or '').strip()


def _bracketed(table_setting: str) -> str:
    parts = table_setting.split('.')
    if not 1 <= len(parts) <= 2 or not all(_IDENTIFIER.match(p) for p in parts):
        raise ValueError(f'Table must look like schema.table, not {table_setting!r}')
    if len(parts) == 1:
        parts.insert(0, 'dbo')
    return '.'.join(f'[{p}]' for p in parts)


def _mdf_table_name() -> str:
    return _bracketed(config.MDF_TABLE)


def _source_table_name() -> str:
    return _bracketed(config.MDF_SOURCE_TABLE)


def _audit_table_name() -> str:
    return _bracketed(config.MDF_AUDIT_TABLE)


def _pipeline_config_table_name() -> str:
    return _bracketed(config.MDF_PIPELINE_CONFIG_TABLE)


@bp.route('/api/mdf/ingestion-objects')
def ingestion_objects():
    try:
        columns, rows = fabric_sql.run_query_with_columns(
            f'SELECT TOP ({int(config.MDF_MAX_ROWS)}) * FROM {_mdf_table_name()}',
            database=config.MDF_DATABASE,
        )
        objects = []
        for row in rows:
            name = (row.get('OBJECT_NAME') or row.get('object_name')
                    or row.get('Object_Name'))
            raw_status = (row.get('IS_ACTIVE') or row.get('is_active')
                          or row.get('Is_Active'))
            if name is None:
                continue
            status_str = str(raw_status).strip().upper() if raw_status is not None else 'N'
            if status_str in ('Y', 'YES', 'TRUE', '1', 'ENABLED'):
                status_str = 'Y'
            else:
                status_str = 'N'
            objects.append({
                'object_name': str(name).strip(),
                'status': status_str,
            })
        return jsonify({
            'source': f'{config.MDF_DATABASE}.{config.MDF_TABLE}',
            'objects': objects,
        })
    except Exception as e:
        print(f'GET /api/mdf/ingestion-objects failed: {e}', file=sys.stderr)
        return jsonify({'error': str(e)}), 500


@bp.route('/api/mdf/ingestion-objects', methods=['POST'])
def add_ingestion_object():
    body = request.get_json(silent=True) or {}
    object_id = str(body.get('object_id') or '').strip()
    source_id = str(body.get('source_id') or '').strip()
    pipeline_id = str(body.get('pipeline_id') or '').strip()
    object_name = str(body.get('object_name') or '').strip()
    connection_detail = str(body.get('connection_detail') or '').strip()
    schedule_priority = body.get('schedule_priority')
    raw_lake_path = str(body.get('raw_lake_path') or '').strip()
    is_active = str(body.get('is_active') or 'Y').strip().upper()
    cdr_concept = str(body.get('cdr_concept') or '').strip()

    if not object_id or not source_id or not pipeline_id or not object_name:
        return jsonify({'error': 'object_id, source_id, pipeline_id and object_name are required'}), 400

    try:
        table = _mdf_table_name()
        fabric_sql.execute(
            f'INSERT INTO {table} '
            '([OBJECT_ID], [SOURCE_ID], [PIPELINE_ID], [OBJECT_NAME], '
            '[CONNECTION_DETAILS_JSON], [SCHEDULE_PRIORITY], [RAW_LAKE_PATH], '
            '[IS_ACTIVE], [CDR_CONCEPT]) '
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            (
                object_id,
                source_id,
                pipeline_id,
                object_name,
                connection_detail or None,
                int(schedule_priority) if schedule_priority is not None else None,
                raw_lake_path or None,
                is_active if is_active in ('Y', 'N') else 'Y',
                cdr_concept or None,
            ),
            database=config.MDF_DATABASE,
        )
        return jsonify({'message': f'{object_name} added successfully.'}), 201
    except Exception as e:
        print(f'POST /api/mdf/ingestion-objects failed: {e}', file=sys.stderr)
        return jsonify({'error': str(e)}), 500


@bp.route('/api/mdf/ingestion-objects', methods=['PUT'])
def update_ingestion_objects():
    body = request.get_json(silent=True) or {}
    updates = body.get('objects')
    if not updates or not isinstance(updates, list):
        return jsonify({'error': 'objects list is required'}), 400

    try:
        table = _mdf_table_name()
        updated = 0
        for item in updates:
            name = str(item.get('object_name', '')).strip()
            status = str(item.get('status', '')).strip().upper()
            if not name or status not in ('Y', 'N'):
                continue
            fabric_sql.execute(
                f'UPDATE {table} SET [IS_ACTIVE] = ? WHERE [OBJECT_NAME] = ?',
                (status, name),
                database=config.MDF_DATABASE,
            )
            updated += 1
        return jsonify({'updated': updated})
    except Exception as e:
        print(f'PUT /api/mdf/ingestion-objects failed: {e}', file=sys.stderr)
        return jsonify({'error': str(e)}), 500


@bp.route('/api/mdf/source-config', methods=['POST'])
def add_source_config():
    body = request.get_json(silent=True) or {}
    source_id = _s(body, 'source_id')
    source_name = _s(body, 'source_name')
    if not source_id or not source_name:
        return jsonify({'error': 'source_id and source_name are required'}), 400

    now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
    try:
        table = _source_table_name()
        fabric_sql.execute(
            f'INSERT INTO {table} '
            '([SOURCE_ID], [SOURCE_NAME], [SOURCE_TYPE], [CONNECTION_DETAILS_JSON], '
            '[LOAD_TYPE], [CONNECTION_KV], [MAX_RETRY_ATTEMPTS_SOURCE], [IS_ACTIVE], '
            '[CREATED_DATE], [MODIFIED_DATE], [OWNED_BY_TEAM]) '
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            (
                source_id,
                source_name,
                _s(body, 'source_type') or None,
                _s(body, 'connection_details_json') or None,
                _s(body, 'load_type') or None,
                _s(body, 'connection_kv') or None,
                int(body['max_retry_attempts_source']) if body.get('max_retry_attempts_source') else None,
                _s(body, 'is_active') or 'Y',
                now,
                now,
                _s(body, 'owned_by_team') or 'data engineering',
            ),
            database=config.MDF_DATABASE,
        )
        return jsonify({'message': f'{source_name} added successfully.'}), 201
    except Exception as e:
        print(f'POST /api/mdf/source-config failed: {e}', file=sys.stderr)
        return jsonify({'error': str(e)}), 500


@bp.route('/api/mdf/sources')
def sources():
    try:
        _columns, rows = fabric_sql.run_query_with_columns(
            f'SELECT [SOURCE_ID], [SOURCE_NAME] FROM {_source_table_name()}',
            database=config.MDF_DATABASE,
        )
        sources_list = []
        for row in rows:
            sid = row.get('SOURCE_ID') or row.get('source_id')
            sname = row.get('SOURCE_NAME') or row.get('source_name')
            if sid is not None:
                sources_list.append({
                    'source_id': str(sid).strip(),
                    'source_name': str(sname).strip() if sname else str(sid).strip(),
                })
        return jsonify({'sources': sources_list})
    except Exception as e:
        print(f'GET /api/mdf/sources failed: {e}', file=sys.stderr)
        return jsonify({'error': str(e)}), 500


@bp.route('/api/mdf/source-configs')
def source_configs():
    try:
        _columns, rows = fabric_sql.run_query_with_columns(
            f'SELECT TOP ({int(config.MDF_MAX_ROWS)}) * FROM {_source_table_name()}',
            database=config.MDF_DATABASE,
        )
        return jsonify({'records': rows})
    except Exception as e:
        print(f'GET /api/mdf/source-configs failed: {e}', file=sys.stderr)
        return jsonify({'error': str(e)}), 500


@bp.route('/api/mdf/pipeline-configs')
def pipeline_configs():
    try:
        _columns, rows = fabric_sql.run_query_with_columns(
            f'SELECT TOP ({int(config.MDF_MAX_ROWS)}) * FROM {_pipeline_config_table_name()}',
            database=config.MDF_DATABASE,
        )
        return jsonify({'records': rows})
    except Exception as e:
        print(f'GET /api/mdf/pipeline-configs failed: {e}', file=sys.stderr)
        return jsonify({'error': str(e)}), 500


@bp.route('/api/mdf/execution-history')
def execution_history():
    try:
        columns, rows = fabric_sql.run_query_with_columns(
            f'SELECT TOP ({int(config.MDF_MAX_ROWS)}) * '
            f'FROM {_audit_table_name()} ORDER BY [start_time] DESC',
            database=config.MDF_DATABASE,
        )
        return jsonify({
            'source': f'{config.MDF_DATABASE}.{config.MDF_AUDIT_TABLE}',
            'columns': columns,
            'records': rows,
        })
    except Exception as e:
        print(f'GET /api/mdf/execution-history failed: {e}', file=sys.stderr)
        return jsonify({'error': str(e)}), 500


@bp.route('/api/mdf/execute-pipeline', methods=['POST'])
def execute_pipeline():
    if not config.MDF_PIPELINE_ID:
        return jsonify({'error': 'MDF_PIPELINE_ID is not configured in .env'}), 500
    body = request.get_json(silent=True) or {}
    params = {
        'pipeline_id': body.get('pipeline_id', 'PL_Full_Load'),
        'pipeline_retry': int(body.get('pipeline_retry', 3)),
    }
    try:
        job_url = fabric_api.run_pipeline(config.MDF_PIPELINE_ID, parameters=params)
        return jsonify({
            'message': 'Pipeline DA_Orch_PL_Parent triggered successfully.',
            'job_url': job_url,
        })
    except Exception as e:
        print(f'POST /api/mdf/execute-pipeline failed: {e}', file=sys.stderr)
        return jsonify({'error': str(e)}), 500


@bp.route('/api/mdf/pipeline-config', methods=['POST'])
def add_pipeline_config():
    body = request.get_json(silent=True) or {}
    pipeline_id = _s(body, 'pipeline_id')
    pipeline_name = _s(body, 'pipeline_name')
    if not pipeline_id or not pipeline_name:
        return jsonify({'error': 'pipeline_id and pipeline_name are required'}), 400

    now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
    try:
        table = _pipeline_config_table_name()
        fabric_sql.execute(
            f'INSERT INTO {table} '
            '([PIPELINE_ID], [PIPELINE_NAME], [MAX_CONCURRENT_RUNS], '
            '[ACTIVE_FLAG], [NOTIFICATION_EMAIL], [ALERT_ON_EMPTY], '
            '[ITERATE_OVER_ALL_OBJECTS], [CREATED_DATE], [LAST_MODIFIED]) '
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            (
                pipeline_id,
                pipeline_name,
                int(body['max_concurrent_runs']) if body.get('max_concurrent_runs') else None,
                _s(body, 'active_flag') or 'Y',
                _s(body, 'notification_email') or None,
                _s(body, 'alert_on_empty') or 'N',
                _s(body, 'iterate_over_all_objects') or 'N',
                now,
                now,
            ),
            database=config.MDF_DATABASE,
        )
        return jsonify({'message': f'{pipeline_name} added successfully.'}), 201
    except Exception as e:
        print(f'POST /api/mdf/pipeline-config failed: {e}', file=sys.stderr)
        return jsonify({'error': str(e)}), 500
