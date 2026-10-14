"""Stewardship Review > MDM page endpoints.
 
  GET  /api/mdm/records    rows of the MDM review table (MDM_TABLE in
                           MDM_DATABASE, default LLM_MDM_LH.mdm.mdm_preview_ui_table),
                           with saved steward decisions applied
  POST /api/mdm/decision   save a steward decision on one exception
 
The table is read through the workspace's Fabric SQL analytics endpoint (the
same server as schema drift, a different lakehouse). Decisions are kept
locally (store.py) and are not written back to Fabric; they are applied to
the rows on every read, so they persist across refreshes.
"""
 
import re
import sys
 
from flask import Blueprint, jsonify, request
 
import config
from core import auth, fabric_sql
 
from . import store
 
bp = Blueprint('mdm', __name__)
 
_IDENTIFIER = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*$')
 
 
def _table_name() -> str:
    """MDM_TABLE ('schema.table' or 'table') as a safely bracketed SQL name.
    It comes from .env, but is still checked: names can't be parameters."""
    parts = config.MDM_TABLE.split('.')
    if not 1 <= len(parts) <= 2 or not all(_IDENTIFIER.match(p) for p in parts):
        raise ValueError(f'MDM_TABLE must look like schema.table, not {config.MDM_TABLE!r}')
    if len(parts) == 1:
        parts.insert(0, 'dbo')
    return '.'.join(f'[{p}]' for p in parts)
 
 
@bp.route('/api/mdm/records')
def records():
    try:
        columns, rows = fabric_sql.run_query_with_columns(
            f'SELECT TOP ({int(config.MDM_MAX_ROWS)}) * FROM {_table_name()}',
            database=config.MDM_DATABASE,
        )
        return jsonify({
            'source': f'{config.MDM_DATABASE}.{config.MDM_TABLE}',
            'columns': columns,
            'rows': store.apply_decisions(rows),
            'truncated': len(rows) >= config.MDM_MAX_ROWS,
        })
    except Exception as e:
        print(f'GET /api/mdm/records failed: {e}', file=sys.stderr)
        return jsonify({'error': str(e)}), 500
 
 
def _master_table_name() -> str:
    """MDM_MASTER_TABLE as a safely bracketed SQL name."""
    parts = config.MDM_MASTER_TABLE.split('.')
    if not 1 <= len(parts) <= 2 or not all(_IDENTIFIER.match(p) for p in parts):
        raise ValueError(f'MDM_MASTER_TABLE must look like schema.table, not {config.MDM_MASTER_TABLE!r}')
    if len(parts) == 1:
        parts.insert(0, 'dbo')
    return '.'.join(f'[{p}]' for p in parts)
 
 
@bp.route('/api/mdm/master-records')
def master_records():
    try:
        columns, rows = fabric_sql.run_query_with_columns(
            f'SELECT TOP ({int(config.MDM_MAX_ROWS)}) * FROM {_master_table_name()}',
            database=config.MDM_DATABASE,
        )
        return jsonify({
            'source': f'{config.MDM_DATABASE}.{config.MDM_MASTER_TABLE}',
            'columns': columns,
            'rows': rows,
            'truncated': len(rows) >= config.MDM_MAX_ROWS,
        })
    except Exception as e:
        print(f'GET /api/mdm/master-records failed: {e}', file=sys.stderr)
        return jsonify({'error': str(e)}), 500
 
 
@bp.route('/api/mdm/decision', methods=['POST'])
def decision():
    body = request.get_json(silent=True) or {}
    exception_id = str(body.get('exceptionId') or '').strip()
    status = str(body.get('status') or '').strip().upper()
    if not exception_id:
        return jsonify({'error': 'exceptionId is required'}), 400
    if status not in store.DECISIONS:
        return jsonify({'error': f'status must be one of {", ".join(store.DECISIONS)}'}), 400
    try:
        row = store.save_decision(
            exception_id,
            status,
            resolved_by=auth.signed_in_user(),
            notes=(str(body.get('note') or '').strip()[:500] or None),
        )
        return jsonify(row), 201
    except Exception as e:
        print(f'POST /api/mdm/decision failed: {e}', file=sys.stderr)
        return jsonify({'error': str(e)}), 500
 
 