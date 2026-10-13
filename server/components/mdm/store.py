"""Steward decisions on MDM exceptions, kept locally.

Decisions are not written back to Fabric. They live in
server/local_data/mdm_decisions.db and are applied on top of the Fabric rows
whenever the page loads them, so a decided exception keeps showing its
decision (with RESOLVED_BY / RESOLVED_DATE / NOTES) across refreshes.
"""

import sqlite3
from datetime import datetime, timezone

from core import local_db

DB_NAME = 'mdm_decisions'
TABLE = 'mdm_decisions'

# STATUS values a steward can set (the page shows them as Approved/Rejected).
DECISIONS = ('APPROVED', 'REJECTED')


def connect() -> sqlite3.Connection:
    conn = local_db.connect(DB_NAME)
    conn.execute(f"""
        CREATE TABLE IF NOT EXISTS {TABLE} (
            EXCEPTION_ID  TEXT PRIMARY KEY,
            STATUS        TEXT NOT NULL,
            RESOLVED_BY   TEXT,
            RESOLVED_DATE TEXT NOT NULL,
            NOTES         TEXT
        )
    """)
    conn.commit()
    return conn


def save_decision(exception_id: str, status: str, resolved_by: str | None, notes: str | None) -> dict:
    """Record (or replace) the decision for one exception."""
    row = {
        'EXCEPTION_ID': exception_id,
        'STATUS': status,
        'RESOLVED_BY': resolved_by,
        'RESOLVED_DATE': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'NOTES': notes,
    }
    conn = connect()
    try:
        with conn:
            conn.execute(
                f'INSERT OR REPLACE INTO {TABLE} (EXCEPTION_ID, STATUS, RESOLVED_BY, RESOLVED_DATE, NOTES) '
                'VALUES (:EXCEPTION_ID, :STATUS, :RESOLVED_BY, :RESOLVED_DATE, :NOTES)',
                row,
            )
        return row
    finally:
        conn.close()


def decisions_by_id() -> dict[str, dict]:
    conn = connect()
    try:
        return {r['EXCEPTION_ID']: dict(r) for r in conn.execute(f'SELECT * FROM {TABLE}')}
    finally:
        conn.close()


def apply_decisions(rows: list[dict], id_column: str = 'EXCEPTION_ID') -> list[dict]:
    """Overlay saved decisions on Fabric rows (STATUS, RESOLVED_BY,
    RESOLVED_DATE, NOTES), as if they had been written back."""
    saved = decisions_by_id()
    if not saved:
        return rows
    out = []
    for row in rows:
        d = saved.get(str(row.get(id_column)))
        if d:
            row = {**row, 'STATUS': d['STATUS'], 'RESOLVED_BY': d['RESOLVED_BY'],
                   'RESOLVED_DATE': d['RESOLVED_DATE'], 'NOTES': d['NOTES']}
        out.append(row)
    return out
