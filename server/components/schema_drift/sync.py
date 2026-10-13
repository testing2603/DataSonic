"""Background worker: writes queued steward decisions to the lakehouse by
running the write-back notebook (fabric/drift_decision_writeback.py).

One run at a time. A new decision wakes the worker immediately (or after
DECISION_SYNC_DELAY_SECONDS of no further clicks); decisions made while a run
is in progress go in the next run. Failed runs are retried twice, a minute
apart, then marked FAILED until the user presses Retry.
"""

import json
import sqlite3
import sys
import threading
import time
from datetime import datetime, timezone

import config
from core import fabric_api

from . import store

SYNC_JOB_TIMEOUT_SECONDS = 30 * 60
SYNC_TICK_SECONDS = 5
SYNC_POLL_SECONDS = 5

# Set when a decision is saved so the worker starts a run straight away.
wake = threading.Event()

# Only the worker thread writes these; routes read them for status.
state = {
    'last_error': None,         # last failure message, shown in the UI
    'job_started': None,        # epoch seconds the in-flight run started
    'last_poll': 0.0,
}


def decision_status(decision: str) -> str:
    return 'REJECTED' if decision == 'REJECT' else 'ACCEPTED'


def _mark_run_failed(conn: sqlite3.Connection, where: str, params: tuple, error: str):
    """Mark failed rows as FAILED so the error is visible in the UI.
    No automatic retry — the steward can see the failure and re-decide."""
    conn.execute(
        f"UPDATE {store.TABLE} SET SYNC_STATUS = 'FAILED', SYNC_ERROR = ? WHERE {where}",
        (error, *params),
    )
    state['last_error'] = error
    state['job_started'] = None
    print(f'Fabric sync failed: {error}', file=sys.stderr)


def _payload(r: dict) -> dict:
    return {
        'feedback_id': r['FEEDBACK_ID'],
        'drift_id': r['DRIFT_ID'],
        'cdr_concept': r['CDR_CONCEPT'],
        'field_name': r['FIELD_NAME'],
        'drift_type': r['DRIFT_TYPE'],
        'old_field_name': r['OLD_FIELD_NAME'],
        'new_field_name': r['NEW_FIELD_NAME'],
        'old_data_type': r['OLD_DATA_TYPE'],
        'new_data_type': r['NEW_DATA_TYPE'],
        'decision': r['DECISION'],
        'action': r['ACTION'] or ('REJECT_DRIFT' if r['DECISION'] == 'REJECT' else None),
        'status': decision_status(r['DECISION']),
        'tag_type': r['TAG_TYPE'],
        'tag_field': r['TAG_FIELD'],
        'steward_id': r['STEWARD_ID'],
        'steward_comment': r['STEWARD_COMMENT'],
        'decision_time': r['REVIEW_TIMESTAMP'],
    }


def tick():
    """One step: poll the run in progress, or start the next one."""
    conn = store.connect()
    try:
        # 1. A run in progress: poll it (at most every SYNC_POLL_SECONDS).
        in_flight = conn.execute(
            f"SELECT DISTINCT SYNC_JOB_URL FROM {store.TABLE} "
            "WHERE SYNC_STATUS = 'SYNCING' AND SYNC_JOB_URL IS NOT NULL"
        ).fetchall()
        if in_flight:
            if time.time() - state['last_poll'] < SYNC_POLL_SECONDS:
                return
            state['last_poll'] = time.time()
            for (job_url,) in in_flight:
                status, reason = fabric_api.job_status(job_url)
                started = state['job_started'] or time.time()
                with conn:
                    if status == 'Completed':
                        conn.execute(
                            f"UPDATE {store.TABLE} SET SYNC_STATUS = 'SYNCED', "
                            "SYNC_ERROR = NULL, SYNCED_TIME = ? WHERE SYNC_JOB_URL = ?",
                            (datetime.now(timezone.utc).isoformat(), job_url),
                        )
                        state['last_error'] = None
                        state['job_started'] = None
                        wake.set()  # decisions queued meanwhile go next
                        print('Fabric sync: notebook run completed.', file=sys.stderr)
                    elif status in ('Failed', 'Cancelled', 'Deduped'):
                        _mark_run_failed(conn, 'SYNC_JOB_URL = ?', (job_url,),
                                         f'Notebook run {status.lower()}: {reason or "no reason given"}')
                    elif time.time() - started > SYNC_JOB_TIMEOUT_SECONDS:
                        _mark_run_failed(conn, 'SYNC_JOB_URL = ?', (job_url,),
                                         'Notebook run did not finish within 30 minutes')
            return

        # 2. Nothing in progress: start a run once the queue has been quiet
        #    for DECISION_SYNC_DELAY_SECONDS.
        queued = [dict(r) for r in conn.execute(
            f"SELECT * FROM {store.TABLE} WHERE SYNC_STATUS = 'QUEUED' ORDER BY REVIEW_TIMESTAMP"
        )]
        if not queued:
            return
        newest = max(datetime.fromisoformat(r['REVIEW_TIMESTAMP']) for r in queued)
        if (datetime.now(timezone.utc) - newest).total_seconds() < config.DECISION_SYNC_DELAY_SECONDS:
            return

        # Latest decision per drift; older queued rows for the same drift are
        # superseded but marked with the same run so they don't linger.
        latest: dict[str, dict] = {}
        for r in queued:
            latest[r['DRIFT_ID']] = r
        payload = [_payload(r) for r in latest.values()]

        ids = [r['FEEDBACK_ID'] for r in queued]
        placeholders = ','.join('?' * len(ids))
        try:
            job_url = fabric_api.run_notebook(
                config.FABRIC_DECISION_NOTEBOOK_ID, {'decisions_json': json.dumps(payload)})
        except Exception as e:
            with conn:
                _mark_run_failed(conn, f'FEEDBACK_ID IN ({placeholders})', tuple(ids), str(e))
            return
        with conn:
            conn.execute(
                f"UPDATE {store.TABLE} SET SYNC_STATUS = 'SYNCING', SYNC_JOB_URL = ? "
                f"WHERE FEEDBACK_ID IN ({placeholders})",
                (job_url, *ids),
            )
        state['job_started'] = time.time()
        state['last_poll'] = time.time()
        print(f'Fabric sync: started notebook run for {len(payload)} decision(s).', file=sys.stderr)
    finally:
        conn.close()


def _worker():
    while True:
        try:
            tick()
        except Exception as e:
            state['last_error'] = str(e)
            print(f'Fabric sync error: {e!r}', file=sys.stderr)
        # Sleep until the next tick, or until a new decision wakes us.
        wake.wait(SYNC_TICK_SECONDS)
        wake.clear()


def start():
    threading.Thread(target=_worker, name='fabric-sync', daemon=True).start()


def summary() -> dict:
    counts = store.sync_counts()
    return {
        'enabled': store.sync_enabled(),
        'delaySeconds': config.DECISION_SYNC_DELAY_SECONDS,
        'queued': counts.get('QUEUED', 0),
        'syncing': counts.get('SYNCING', 0),
        'synced': counts.get('SYNCED', 0),
        'failed': counts.get('FAILED', 0),
        'localOnly': counts.get('LOCAL_ONLY', 0),
        'lastError': state['last_error'],
    }


