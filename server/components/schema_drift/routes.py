"""Schema drift endpoints (Stewardship Review > Schema Drift page).

  GET  /api/approval-logs       all drifts (pending from drift_ui_review + decided from schema_registry)
  GET  /api/decision-counts     Approved / Rejected / Auto Approved counts
  POST /api/drift-decision      save a steward decision (queues the Fabric sync)
  GET  /api/drift-decisions     latest local decision per drift
  GET  /api/drift-sync          where decisions are in the Fabric write-back
"""

import re
import sys
import uuid
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

import config
from core import auth, fabric_sql

from . import store, sync

bp = Blueprint('schema_drift', __name__)

# STEWARD_COMMENT the LLM auto-approval writes into schema_registry.
AUTO_APPROVED_COMMENT = 'Auto-approved by LLM score threshold'


def _normalize_comment(text: str | None) -> str:
    """Lowercase, and treat hyphens/underscores/repeated spaces as one space,
    so 'Auto-approved' and 'Auto approved' compare equal."""
    return re.sub(r'[\s\-_]+', ' ', (text or '')).strip().lower()


def _is_auto_approved(decision: str, comment: str | None) -> bool:
    return decision == 'ACCEPT' and _normalize_comment(AUTO_APPROVED_COMMENT) in _normalize_comment(comment)


def _error(route: str, e: Exception):
    print(f'{route} failed: {e}', file=sys.stderr)
    return jsonify({'error': str(e)}), 500


@bp.route('/api/approval-logs')
def approval_logs():
    """Pending reviews from drift_ui_review + decided entries from schema_registry.

    The DECISION column in schema_registry drives the status:
    ACCEPT → Approved, REJECT → Rejected, AUTO_APPROVED → Auto Approved.
    """
    try:
        pending = fabric_sql.run_query("""
            SELECT
                DRIFT_ID, OBJECT_ID, PIPELINE_ID, SOURCE_ID, SOURCE_LOCATION,
                CDR_CONCEPT, DRIFT_TYPE, OLD_FIELD_NAME, NEW_FIELD_NAME,
                OLD_DATA_TYPE, NEW_DATA_TYPE, PROCESS_STATUS, CREATED_TIME,
                LLM_SCORE, REASONING, DECISION, STATUS, TAG_TYPE, TAG_FIELD,
                TAG_FIELD_ENABLED, TAG_FIELD_OPTIONS, STEWARD_ID, STEWARD_COMMENT,
                REVIEW_TIMESTAMP
            FROM [dbo].[drift_ui_review]
            WHERE STATUS = 'PENDING'
            ORDER BY CREATED_TIME DESC
        """)

        try:
            registry_rows = fabric_sql.run_query(
                "SELECT DRIFT_ID, DECISION, STEWARD_COMMENT, REVIEW_TIMESTAMP,"
                " CDR_CONCEPT, DRIFT_TYPE, OLD_FIELD_NAME, NEW_FIELD_NAME,"
                " OLD_DATA_TYPE, NEW_DATA_TYPE, STEWARD_ID"
                " FROM [dbo].[schema_registry]"
            )
        except Exception as e:
            if 'Invalid object name' not in str(e):
                raise
            registry_rows = []

        _decision_to_status = {
            'ACCEPT': 'APPROVED',
            'REJECT': 'REJECTED',
            'AUTO_APPROVED': 'AUTO_APPROVED',
        }
        # Keep latest decision per drift_id.
        latest: dict[str, dict] = {}
        for row in registry_rows:
            did = row['DRIFT_ID']
            if did not in latest or (row.get('REVIEW_TIMESTAMP') or '') > (latest[did].get('REVIEW_TIMESTAMP') or ''):
                latest[did] = row
        decided = []
        for row in latest.values():
            row['STATUS'] = _decision_to_status.get(
                (row.get('DECISION') or '').upper(), row.get('DECISION'))
            row.setdefault('CREATED_TIME', row.get('REVIEW_TIMESTAMP'))
            for col in ('OBJECT_ID', 'PIPELINE_ID', 'SOURCE_ID', 'SOURCE_LOCATION',
                        'PROCESS_STATUS', 'LLM_SCORE', 'REASONING',
                        'TAG_FIELD_ENABLED', 'TAG_FIELD_OPTIONS', 'TAG_TYPE', 'TAG_FIELD'):
                row.setdefault(col, None)
            decided.append(row)

        pending_ids = {r['DRIFT_ID'] for r in pending}
        decided_new = [r for r in decided if r['DRIFT_ID'] not in pending_ids]
        combined = pending + decided_new
        combined.sort(key=lambda r: r.get('CREATED_TIME') or '', reverse=True)
        return jsonify(combined)
    except Exception as e:
        return _error('GET /api/approval-logs', e)


@bp.route('/api/decision-counts')
def decision_counts():
    """Counts from the lakehouse schema_registry table:
    - autoApproved:     DECISION = 'ACCEPT' and STEWARD_COMMENT is the
                        auto-approval marker (AUTO_APPROVED_COMMENT)
    - manuallyApproved: DECISION = 'ACCEPT' with any other comment
    - rejected:         DECISION = 'REJECT'
    Only the latest decision per DRIFT_ID is counted. ROW_NUMBER keeps rows
    whose REVIEW_TIMESTAMP is NULL (e.g. auto-approvals).

    Decisions made in this app that Fabric doesn't show yet (queued, being
    written, or the SQL endpoint still catching up) come from the local
    store: per drift, the newer of Fabric's row and the local one wins."""
    try:
        try:
            fabric_rows = fabric_sql.run_query("""
                SELECT DRIFT_ID, DECISION, STEWARD_COMMENT, REVIEW_TIMESTAMP
                FROM (
                    SELECT DRIFT_ID, DECISION, STEWARD_COMMENT, REVIEW_TIMESTAMP,
                           ROW_NUMBER() OVER (
                               PARTITION BY DRIFT_ID ORDER BY REVIEW_TIMESTAMP DESC
                           ) AS rn
                    FROM [dbo].[schema_registry]
                ) latest
                WHERE rn = 1
            """)
        except Exception as e:
            if 'Invalid object name' not in str(e):
                raise
            fabric_rows = []  # schema_registry not created yet

        def category(decision: str, comment: str | None) -> str | None:
            decision = (decision or '').strip().upper()
            if decision == 'AUTO_APPROVED':
                return 'autoApproved'
            if decision == 'ACCEPT':
                return 'autoApproved' if _is_auto_approved(decision, comment) else 'manuallyApproved'
            if decision == 'REJECT':
                return 'rejected'
            return None

        def when(value) -> datetime:
            """REVIEW_TIMESTAMP as an aware UTC datetime; missing = oldest."""
            if not value:
                return datetime.min.replace(tzinfo=timezone.utc)
            ts = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace('Z', '+00:00'))
            return ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)

        by_drift = {r['DRIFT_ID']: (when(r.get('REVIEW_TIMESTAMP')),
                                    category(r.get('DECISION'), r.get('STEWARD_COMMENT')))
                    for r in fabric_rows}
        for r in store.list_decisions():
            local = (when(r['REVIEW_TIMESTAMP']), category(r['DECISION'], r.get('STEWARD_COMMENT')))
            if r['DRIFT_ID'] not in by_drift or local[0] > by_drift[r['DRIFT_ID']][0]:
                by_drift[r['DRIFT_ID']] = local

        counts = {'autoApproved': 0, 'manuallyApproved': 0, 'rejected': 0}
        for _, c in by_drift.values():
            if c:
                counts[c] += 1
        return jsonify({**counts, 'total': sum(counts.values())})
    except Exception as e:
        return _error('GET /api/decision-counts', e)


@bp.route('/api/drift-decision', methods=['POST'])
def drift_decision():
    body = request.get_json(silent=True) or {}
    drift_id = str(body.get('driftId') or body.get('approvalId') or '').strip()
    decision = body.get('decision')
    if not drift_id:
        return jsonify({'error': 'driftId is required'}), 400
    if decision not in store.DECISIONS:
        return jsonify({'error': f'decision must be one of {", ".join(store.DECISIONS)}'}), 400
    action = body.get('action') or ('REJECT_DRIFT' if decision == 'REJECT' else None)
    if action not in store.ACTIONS:
        return jsonify({'error': f'action must be one of {", ".join(store.ACTIONS)}'}), 400
    if store.ACTIONS[action] != decision:
        return jsonify({'error': f'action {action} requires decision {store.ACTIONS[action]}'}), 400

    try:
        row = store.save_decision({
            'FEEDBACK_ID': str(uuid.uuid4()),
            'DRIFT_ID': drift_id,
            'CDR_CONCEPT': body.get('cdrConcept'),
            'FIELD_NAME': body.get('fieldName'),
            'DRIFT_TYPE': body.get('driftType'),
            'OLD_FIELD_NAME': body.get('oldFieldName'),
            'NEW_FIELD_NAME': body.get('newFieldName'),
            'OLD_DATA_TYPE': body.get('oldDataType'),
            'NEW_DATA_TYPE': body.get('newDataType'),
            'DECISION': decision,
            'ACTION': action,
            'TAG_TYPE': body.get('tagType'),
            'TAG_FIELD': body.get('tagField'),
            'STEWARD_ID': auth.signed_in_user(),
            'STEWARD_COMMENT': (body.get('justification') or '')[:500] or None,
            'REVIEW_TIMESTAMP': datetime.now(timezone.utc).isoformat(),
        })
        sync.wake.set()
        return jsonify(row), 201
    except Exception as e:
        return _error('POST /api/drift-decision', e)


@bp.route('/api/drift-decisions')
def drift_decisions():
    try:
        return jsonify(store.list_decisions())
    except Exception as e:
        return _error('GET /api/drift-decisions', e)


@bp.route('/api/drift-sync')
def drift_sync():
    try:
        return jsonify(sync.summary())
    except Exception as e:
        return _error('GET /api/drift-sync', e)


def on_startup():
    """Start the Fabric write-back worker (after sign-in)."""
    if not store.sync_enabled():
        print('Schema drift sync OFF: set FABRIC_WORKSPACE_ID and FABRIC_DECISION_NOTEBOOK_ID '
              'in .env to write decisions back to the lakehouse.', file=sys.stderr)
        return
    try:
        auth.get_token_silently(auth.FABRIC_API_SCOPES)
        when = ('as soon as they are made' if config.DECISION_SYNC_DELAY_SECONDS == 0
                else f'{config.DECISION_SYNC_DELAY_SECONDS}s after the last click')
        print(f'Schema drift sync ON: decisions go to notebook '
              f'{config.FABRIC_DECISION_NOTEBOOK_ID} {when}.', file=sys.stderr)
    except Exception as e:
        print(f'WARNING: could not get a Fabric API token ({e}); decisions will '
              'queue and the sync will retry.', file=sys.stderr)
    sync.start()
