"""Local tracking of document uploads through the extraction pipeline.

Status lifecycle:
  UPLOADING   -> file received, saving to disk
  EXTRACTING  -> sent to extraction API, waiting for response
  VALIDATION  -> extraction done, awaiting user review of missing/low-confidence fields
  COMPLETED   -> all fields confirmed, ready for downstream pipeline
  FAILED      -> extraction or validation failed permanently
"""

import json
import sqlite3
from datetime import datetime, timezone

from core import local_db

DB_NAME = 'ingestion'
TABLE = 'document_uploads'
RECORDS_TABLE = 'extracted_records'

STATUSES = ('UPLOADING', 'EXTRACTING', 'VALIDATION', 'COMPLETED', 'FAILED')


def connect() -> sqlite3.Connection:
    conn = local_db.connect(DB_NAME)
    conn.execute(f"""
        CREATE TABLE IF NOT EXISTS {TABLE} (
            DOC_ID          TEXT PRIMARY KEY,
            FILENAME        TEXT NOT NULL,
            FILE_TYPE       TEXT,
            CONTENT_TYPE    TEXT,
            LOB             TEXT,
            CLASSIFICATION  TEXT,
            STATUS          TEXT NOT NULL DEFAULT 'UPLOADING',
            EXTRACTED_FIELDS TEXT,
            FINAL_FIELDS    TEXT,
            ERROR           TEXT,
            CREATED_AT      TEXT NOT NULL,
            UPDATED_AT      TEXT NOT NULL,
            COMPLETED_AT    TEXT,
            IMAGE_IDS       TEXT
        )
    """)
    # Migrate existing DB: add IMAGE_IDS if missing.
    existing = {row[1] for row in conn.execute(f"PRAGMA table_info({TABLE})").fetchall()}
    if 'IMAGE_IDS' not in existing:
        conn.execute(f'ALTER TABLE {TABLE} ADD COLUMN IMAGE_IDS TEXT')
        conn.commit()
    conn.execute(f"""
        CREATE TABLE IF NOT EXISTS {RECORDS_TABLE} (
            ID              INTEGER PRIMARY KEY AUTOINCREMENT,
            DOC_ID          TEXT NOT NULL,
            FIELD_NAME      TEXT NOT NULL,
            EXTRACTED_VALUE TEXT,
            FINAL_VALUE     TEXT,
            CONFIDENCE      REAL,
            SOURCE          TEXT NOT NULL DEFAULT 'extraction',
            LOB             TEXT,
            CLASSIFICATION  TEXT,
            CREATED_AT      TEXT NOT NULL,
            UPDATED_AT      TEXT NOT NULL,
            FOREIGN KEY (DOC_ID) REFERENCES {TABLE}(DOC_ID)
        )
    """)
    conn.commit()
    return conn


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create(doc_id: str, filename: str, file_type: str, content_type: str) -> dict:
    now = _now()
    row = {
        'DOC_ID': doc_id,
        'FILENAME': filename,
        'FILE_TYPE': file_type,
        'CONTENT_TYPE': content_type,
        'STATUS': 'UPLOADING',
        'CREATED_AT': now,
        'UPDATED_AT': now,
    }
    conn = connect()
    try:
        with conn:
            conn.execute(
                f"INSERT INTO {TABLE} (DOC_ID, FILENAME, FILE_TYPE, CONTENT_TYPE, STATUS, CREATED_AT, UPDATED_AT) "
                "VALUES (:DOC_ID, :FILENAME, :FILE_TYPE, :CONTENT_TYPE, :STATUS, :CREATED_AT, :UPDATED_AT)",
                row,
            )
        return row
    finally:
        conn.close()


def update_status(doc_id: str, status: str, **kwargs) -> None:
    sets = ['STATUS = ?', 'UPDATED_AT = ?']
    params: list = [status, _now()]

    if 'extracted_fields' in kwargs:
        sets.append('EXTRACTED_FIELDS = ?')
        params.append(json.dumps(kwargs['extracted_fields']) if kwargs['extracted_fields'] is not None else None)
    if 'final_fields' in kwargs:
        sets.append('FINAL_FIELDS = ?')
        params.append(json.dumps(kwargs['final_fields']) if kwargs['final_fields'] is not None else None)
    if 'lob' in kwargs:
        sets.append('LOB = ?')
        params.append(kwargs['lob'])
    if 'classification' in kwargs:
        sets.append('CLASSIFICATION = ?')
        params.append(kwargs['classification'])
    if 'error' in kwargs:
        sets.append('ERROR = ?')
        params.append(kwargs['error'])
    if 'image_ids' in kwargs:
        sets.append('IMAGE_IDS = ?')
        params.append(json.dumps(kwargs['image_ids']) if kwargs['image_ids'] else None)
    if status == 'COMPLETED':
        sets.append('COMPLETED_AT = ?')
        params.append(_now())

    params.append(doc_id)
    conn = connect()
    try:
        with conn:
            conn.execute(f"UPDATE {TABLE} SET {', '.join(sets)} WHERE DOC_ID = ?", params)
    finally:
        conn.close()


def get(doc_id: str) -> dict | None:
    conn = connect()
    try:
        row = conn.execute(f"SELECT * FROM {TABLE} WHERE DOC_ID = ?", (doc_id,)).fetchone()
        if row is None:
            return None
        d = dict(row)
        for col in ('EXTRACTED_FIELDS', 'FINAL_FIELDS', 'IMAGE_IDS'):
            if d.get(col):
                d[col] = json.loads(d[col])
        return d
    finally:
        conn.close()


def list_all(limit: int = 100) -> list[dict]:
    conn = connect()
    try:
        rows = conn.execute(
            f"SELECT * FROM {TABLE} ORDER BY CREATED_AT DESC LIMIT ?", (limit,)
        ).fetchall()
        result = []
        for row in rows:
            d = dict(row)
            for col in ('EXTRACTED_FIELDS', 'FINAL_FIELDS', 'IMAGE_IDS'):
                if d.get(col):
                    d[col] = json.loads(d[col])
            result.append(d)
        return result
    finally:
        conn.close()


# ---- Extracted records (row-per-field) ---------------------------------------

def save_extracted_records(
    doc_id: str,
    fields: dict,
    classification: str | None = None,
    lob: str | None = None,
) -> int:
    """Flatten extracted fields into individual rows. Returns count inserted."""
    now = _now()
    conn = connect()
    try:
        rows = []
        for field_name, field_data in fields.items():
            if isinstance(field_data, dict):
                value = field_data.get('value')
                confidence = field_data.get('confidence')
            else:
                value = field_data
                confidence = None
            rows.append((
                doc_id, field_name,
                str(value) if value is not None else None,
                confidence,
                'extraction',
                lob, classification,
                now, now,
            ))
        with conn:
            conn.executemany(
                f"INSERT INTO {RECORDS_TABLE} "
                "(DOC_ID, FIELD_NAME, EXTRACTED_VALUE, CONFIDENCE, SOURCE, LOB, CLASSIFICATION, CREATED_AT, UPDATED_AT) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                rows,
            )
        return len(rows)
    finally:
        conn.close()


def save_final_records(
    doc_id: str,
    final_fields: dict,
    classification: str | None = None,
    lob: str | None = None,
) -> int:
    """Update extracted records with user-corrected values, or insert new ones."""
    now = _now()
    conn = connect()
    try:
        with conn:
            count = 0
            for field_name, field_data in final_fields.items():
                if isinstance(field_data, dict):
                    value = field_data.get('value')
                else:
                    value = field_data
                final_val = str(value) if value is not None else None

                existing = conn.execute(
                    f"SELECT ID, EXTRACTED_VALUE FROM {RECORDS_TABLE} WHERE DOC_ID = ? AND FIELD_NAME = ?",
                    (doc_id, field_name),
                ).fetchone()

                if existing:
                    source = 'user' if final_val != existing['EXTRACTED_VALUE'] else 'extraction'
                    conn.execute(
                        f"UPDATE {RECORDS_TABLE} SET FINAL_VALUE = ?, SOURCE = ?, UPDATED_AT = ? WHERE ID = ?",
                        (final_val, source, now, existing['ID']),
                    )
                else:
                    conn.execute(
                        f"INSERT INTO {RECORDS_TABLE} "
                        "(DOC_ID, FIELD_NAME, FINAL_VALUE, SOURCE, LOB, CLASSIFICATION, CREATED_AT, UPDATED_AT) "
                        "VALUES (?, ?, ?, 'user', ?, ?, ?, ?)",
                        (doc_id, field_name, final_val, lob, classification, now, now),
                    )
                count += 1
        return count
    finally:
        conn.close()


def get_records(doc_id: str) -> list[dict]:
    """Return all field records for a document."""
    conn = connect()
    try:
        rows = conn.execute(
            f"SELECT * FROM {RECORDS_TABLE} WHERE DOC_ID = ? ORDER BY ID", (doc_id,)
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def list_records(limit: int = 500, classification: str | None = None) -> list[dict]:
    """Return recent extracted records, optionally filtered by classification."""
    conn = connect()
    try:
        if classification:
            rows = conn.execute(
                f"SELECT * FROM {RECORDS_TABLE} WHERE CLASSIFICATION = ? ORDER BY CREATED_AT DESC, ID LIMIT ?",
                (classification, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                f"SELECT * FROM {RECORDS_TABLE} ORDER BY CREATED_AT DESC, ID LIMIT ?", (limit,)
            ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()
