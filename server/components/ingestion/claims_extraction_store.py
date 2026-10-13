"""Structured claims extraction tables — one per claim sub-classification.

Tables are created once on import and persist in server/local_data/claims_extraction.db.
New rows are added via insert_from_json(), which:
  1. Reads classification.subcategory from the JSON to pick the right table
  2. Maps raw field names to DB column names via CLAIMS_RAW_TO_DB
  3. Inserts a row
  4. Returns which mandatory columns are still NULL (need user input)
"""

import sqlite3
import uuid
from datetime import datetime, timezone

from core import local_db

from . import azure_csv_store, claims_extraction_schema as cs

DB_NAME = 'claims_extraction'


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---- Table creation (runs once on import) ------------------------------------

def _create_tables() -> None:
    conn = _connect()
    try:
        for _subcat, (table_name, columns) in cs.SUBCATEGORY_TABLES.items():
            col_defs = ', '.join(f'{name} {sql_type}' for name, sql_type, _ in columns)
            conn.execute(f'CREATE TABLE IF NOT EXISTS {table_name} ({col_defs})')
            # Migrate: add image_ids column to existing tables
            existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table_name})").fetchall()}
            if 'image_ids' not in existing:
                conn.execute(f'ALTER TABLE {table_name} ADD COLUMN image_ids TEXT')
        conn.commit()
    finally:
        conn.close()


def _connect() -> sqlite3.Connection:
    return local_db.connect(DB_NAME)


_create_tables()


# ---- Field mapping -----------------------------------------------------------

def _extract_value(val):
    """Unwrap {'value': x, 'confidence': y} dicts to just the value."""
    if isinstance(val, dict) and 'value' in val:
        return val['value']
    return val


def map_fields(raw_fields: dict) -> dict:
    """Rename raw JSON keys to DB column names, drop excluded fields."""
    mapped = {}
    for raw_key, value in raw_fields.items():
        if raw_key in cs.EXCLUDED_RAW_FIELDS:
            continue
        value = _extract_value(value)
        db_col = cs.CLAIMS_RAW_TO_DB.get(raw_key)
        if db_col:
            mapped[db_col] = value
        else:
            mapped[raw_key.lower()] = value
    return mapped


# ---- Validate (no insert) ----------------------------------------------------

def validate_json(json_blob: dict) -> dict:
    """Map and validate claims JSON without inserting. Returns mapped row + missing fields."""
    classification = json_blob.get('classification', {})
    subcategory = classification.get('subcategory', '')
    extracted = json_blob.get('extracted_fields', {})

    table_name, columns = cs.get_table_for(subcategory)
    mapped = map_fields(extracted)

    valid_cols = {name for name, _, _ in columns if name != 'id'}
    row = {}
    for col in valid_cols:
        row[col] = mapped.get(col)

    missing_required = [
        name for name, _, req in columns
        if req == 'required' and name not in ('id', 'created_at', 'updated_at', 'doc_id')
        and row.get(name) is None
    ]
    missing_recommended = [
        name for name, _, req in columns
        if req == 'recommended' and row.get(name) is None
    ]

    return {
        'table': table_name,
        'subcategory': subcategory,
        'row': row,
        'missing_required': missing_required,
        'missing_recommended': missing_recommended,
    }


# ---- Insert ------------------------------------------------------------------

def insert_from_json(json_blob: dict, extra_fields: dict | None = None) -> dict:
    """Parse claims JSON, merge any user-provided fields, then insert."""
    classification = json_blob.get('classification', {})
    subcategory = classification.get('subcategory', '')
    extracted = json_blob.get('extracted_fields', {})

    table_name, columns = cs.get_table_for(subcategory)
    mapped = map_fields(extracted)

    if extra_fields:
        mapped.update(extra_fields)

    img_ids = json_blob.get('image_ids')
    if img_ids:
        import json as _json
        mapped['image_ids'] = _json.dumps(img_ids)

    doc_id = str(uuid.uuid4())
    now = _now()
    mapped['doc_id'] = doc_id
    mapped['created_at'] = now
    mapped['updated_at'] = now

    valid_cols = {name for name, _, _ in columns if name != 'id'}
    row = {}
    for col in valid_cols:
        row[col] = mapped.get(col)

    col_names = [c for c in row if row[c] is not None]
    placeholders = ', '.join('?' for _ in col_names)
    values = [row[c] for c in col_names]

    conn = _connect()
    try:
        with conn:
            conn.execute(
                f"INSERT INTO {table_name} ({', '.join(col_names)}) VALUES ({placeholders})",
                values,
            )
    finally:
        conn.close()

    azure_csv_store.append_row(table_name, row)

    return {
        'doc_id': doc_id,
        'table': table_name,
        'subcategory': subcategory,
        'row': row,
    }


# ---- Query -------------------------------------------------------------------

def get_row(doc_id: str, subcategory: str) -> dict | None:
    """Fetch a single row by doc_id."""
    table_name, _ = cs.get_table_for(subcategory)
    conn = _connect()
    try:
        row = conn.execute(
            f"SELECT * FROM {table_name} WHERE doc_id = ?", (doc_id,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def list_rows(subcategory: str, limit: int = 100) -> list[dict]:
    """List recent rows from a specific table."""
    table_name, _ = cs.get_table_for(subcategory)
    conn = _connect()
    try:
        rows = conn.execute(
            f"SELECT * FROM {table_name} ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def list_all_tables() -> dict[str, list[dict]]:
    """Return all rows from all 4 claims tables, keyed by table name."""
    result = {}
    conn = _connect()
    try:
        for _subcat, (table_name, _columns) in cs.SUBCATEGORY_TABLES.items():
            rows = conn.execute(
                f"SELECT * FROM {table_name} ORDER BY created_at DESC"
            ).fetchall()
            result[table_name] = [dict(r) for r in rows]
        return result
    finally:
        conn.close()
