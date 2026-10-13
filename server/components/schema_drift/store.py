"""Local record of steward decisions, and the queue for the Fabric sync.

The Fabric SQL analytics endpoint is read-only, so each decision is first
recorded here, then written to the lakehouse by the write-back notebook (see
sync.py). Column names match the lakehouse schema_registry table.

This is the only module to change when decisions move to the app's SQL
Server (core.app_db): same columns, same functions.

SYNC_STATUS lifecycle:
  QUEUED     -> waiting for the next notebook run
  SYNCING    -> included in a run that is in progress (SYNC_JOB_URL)
  SYNCED     -> the run completed; the lakehouse holds the decision
  FAILED     -> the run failed MAX_SYNC_ATTEMPTS times; needs a manual retry
  LOCAL_ONLY -> saved with sync not configured; never sent automatically
"""

import sqlite3

import config
from core import local_db

DB_NAME = 'drift_feedback'
TABLE = 'schema_drift_feedback'

# DECISION values in the lakehouse schema_registry table.
DECISIONS = ('ACCEPT', 'REJECT')

# Which of the two UI buttons was used (stored as ACTION next to DECISION):
#   REJECT_DRIFT - DECISION REJECT.
#   ACCEPT_DRIFT - DECISION ACCEPT.
ACTIONS = {
    'REJECT_DRIFT': 'REJECT',
    'ACCEPT_DRIFT': 'ACCEPT',
}

_COLUMNS = (
    'FEEDBACK_ID', 'DRIFT_ID', 'CDR_CONCEPT', 'FIELD_NAME', 'DRIFT_TYPE',
    'OLD_FIELD_NAME', 'NEW_FIELD_NAME', 'OLD_DATA_TYPE', 'NEW_DATA_TYPE',
    'DECISION', 'ACTION', 'TAG_TYPE', 'TAG_FIELD', 'STEWARD_ID', 'STEWARD_COMMENT',
    'REVIEW_TIMESTAMP', 'SYNC_STATUS',
)


def connect() -> sqlite3.Connection:
    """Open the store, creating or upgrading its table as needed."""
    conn = local_db.connect(DB_NAME)
    # A file from before the switch to the schema_registry columns has the
    # old layout (APPROVAL_ID, DECISION_TIME, ...). Keep those rows, renamed
    # out of the way, and start the new-layout table fresh.
    old_cols = {r['name'] for r in conn.execute(f'PRAGMA table_info({TABLE})')}
    if old_cols and 'DRIFT_ID' not in old_cols:
        conn.execute(f'ALTER TABLE {TABLE} RENAME TO {TABLE}_legacy')
        conn.commit()
    conn.execute(f"""
        CREATE TABLE IF NOT EXISTS {TABLE} (
            FEEDBACK_ID      TEXT PRIMARY KEY,
            DRIFT_ID         TEXT NOT NULL,
            CDR_CONCEPT      TEXT,
            FIELD_NAME       TEXT,
            DRIFT_TYPE       TEXT,
            OLD_FIELD_NAME   TEXT,
            NEW_FIELD_NAME   TEXT,
            OLD_DATA_TYPE    TEXT,
            NEW_DATA_TYPE    TEXT,
            DECISION         TEXT NOT NULL,
            TAG_TYPE         TEXT,
            TAG_FIELD        TEXT,
            STEWARD_ID       TEXT,
            STEWARD_COMMENT  TEXT,
            REVIEW_TIMESTAMP TEXT NOT NULL
        )
    """)
    # Columns added after the table first shipped; added in place.
    existing = {r['name'] for r in conn.execute(f'PRAGMA table_info({TABLE})')}
    for column, ddl in (
        ('ACTION', 'TEXT'),
        ('SYNC_STATUS', "TEXT NOT NULL DEFAULT 'LOCAL_ONLY'"),
        ('SYNC_ATTEMPTS', 'INTEGER NOT NULL DEFAULT 0'),
        ('SYNC_JOB_URL', 'TEXT'),
        ('SYNC_ERROR', 'TEXT'),
        ('SYNCED_TIME', 'TEXT'),
    ):
        if column not in existing:
            conn.execute(f'ALTER TABLE {TABLE} ADD COLUMN {column} {ddl}')
    conn.commit()
    return conn


def sync_enabled() -> bool:
    return bool(config.FABRIC_WORKSPACE_ID and config.FABRIC_DECISION_NOTEBOOK_ID)


def save_decision(row: dict) -> dict:
    """Append one decision (history is kept, never updated in place)."""
    row = {**row, 'SYNC_STATUS': 'QUEUED' if sync_enabled() else 'LOCAL_ONLY'}
    names = ', '.join(_COLUMNS)
    values = ', '.join(f':{c}' for c in _COLUMNS)
    conn = connect()
    try:
        with conn:
            conn.execute(f'INSERT INTO {TABLE} ({names}) VALUES ({values})', row)
        return row
    finally:
        conn.close()


def list_decisions() -> list[dict]:
    """Latest decision per DRIFT_ID."""
    conn = connect()
    try:
        rows = conn.execute(f"""
            SELECT f.* FROM {TABLE} f
            WHERE f.REVIEW_TIMESTAMP = (
                SELECT MAX(REVIEW_TIMESTAMP) FROM {TABLE} WHERE DRIFT_ID = f.DRIFT_ID
            )
        """).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def sync_counts() -> dict[str, int]:
    """Number of decisions in each SYNC_STATUS."""
    conn = connect()
    try:
        return {r['SYNC_STATUS']: r['n'] for r in conn.execute(
            f'SELECT SYNC_STATUS, COUNT(*) AS n FROM {TABLE} GROUP BY SYNC_STATUS'
        )}
    finally:
        conn.close()


