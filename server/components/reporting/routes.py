"""Reporting & Analytics — Power BI report generation from natural language.

POST /api/report/generate  { lob, prompt }
  → fetches gold table schemas → calls Claude on Foundry → assembles PBIP
  → deploys to Fabric workspace → returns { reportUrl }

GET  /api/report/schemas/<lob>
  → returns the gold table column metadata for a given LOB (debug / preview)
"""

from flask import Blueprint, jsonify, request

from components.reporting import service

bp = Blueprint('reporting', __name__)


@bp.route('/api/report/generate', methods=['POST'])
def generate_report():
    body = request.get_json(silent=True) or {}
    lob = body.get('lob', '').strip().lower()
    prompt = body.get('prompt', '').strip()

    if not lob:
        return jsonify(error='lob is required'), 400
    if lob not in service.SUPPORTED_LOBS:
        return jsonify(error=f'Unsupported LOB: {lob}. Supported: {", ".join(service.SUPPORTED_LOBS)}'), 400
    if not prompt:
        return jsonify(error='prompt is required'), 400
    if len(prompt) > 2000:
        return jsonify(error='Prompt too long (max 2000 chars)'), 400

    try:
        result = service.generate_report(lob, prompt)
        return jsonify(result)
    except service.ReportError as exc:
        return jsonify(error=str(exc)), 502
    except Exception as exc:
        return jsonify(error=f'Unexpected error: {exc}'), 500


@bp.route('/api/report/schemas/<lob>')
def get_schemas(lob: str):
    lob = lob.strip().lower()
    if lob not in service.SUPPORTED_LOBS:
        return jsonify(error=f'Unsupported LOB: {lob}'), 400

    try:
        schemas = service.fetch_gold_schemas(lob)
        return jsonify(schemas)
    except Exception as exc:
        return jsonify(error=str(exc)), 500
