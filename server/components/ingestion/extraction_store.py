"""Structured extraction tables — one per policy sub-classification.

Tables are created once on import and persist in server/local_data/extraction.db.
New rows are added via insert_from_json(), which:
  1. Reads classification.subcategory from the JSON to pick the right table
  2. Maps raw field names to DB column names via RAW_TO_DB
  3. Inserts a row
  4. Returns which mandatory columns are still NULL (need user input)
"""

import sqlite3
import uuid
from datetime import datetime, timezone

from core import local_db

from . import azure_csv_store, extraction_schema as es

DB_NAME = 'extraction'


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---- Table creation (runs once on import) ------------------------------------

def _create_tables() -> None:
    conn = _connect()
    try:
        for _subcat, (table_name, columns) in es.SUBCATEGORY_TABLES.items():
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
    """Rename raw JSON keys to DB column names, drop excluded fields.

    Handles both flat values ("POLICY_NO": "POL-001") and
    confidence dicts ("POLICY_NO": {"value": "POL-001", "confidence": 0.95}).
    """
    mapped = {}
    for raw_key, value in raw_fields.items():
        if raw_key in es.EXCLUDED_RAW_FIELDS:
            continue
        value = _extract_value(value)
        db_col = es.RAW_TO_DB.get(raw_key)
        if db_col:
            mapped[db_col] = value
        else:
            mapped[raw_key.lower()] = value
    return mapped


# ---- Validate (no insert) ----------------------------------------------------

def validate_json(json_blob: dict) -> dict:
    """Map and validate extraction JSON without inserting. Returns mapped row + missing fields."""
    classification = json_blob.get('classification', {})
    subcategory = classification.get('subcategory', '')
    extracted = json_blob.get('extracted_fields', {})

    table_name, columns = es.get_table_for(subcategory)
    mapped = map_fields(extracted)

    if 'war_risk_included' in mapped:
        val = mapped['war_risk_included']
        mapped['war_risk_included'] = 1 if val is True or val == 'true' else 0

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
    """Parse extraction JSON, merge any user-provided fields, then insert.

    Args:
        json_blob: The full JSON from the extraction API.
        extra_fields: Additional {column_name: value} to merge (user-filled missing fields).
    """
    classification = json_blob.get('classification', {})
    subcategory = classification.get('subcategory', '')
    extracted = json_blob.get('extracted_fields', {})

    table_name, columns = es.get_table_for(subcategory)
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

    if 'war_risk_included' in mapped:
        val = mapped['war_risk_included']
        mapped['war_risk_included'] = 1 if val is True or val == 'true' else 0

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


# ---- Update (for user-filled fields) ----------------------------------------

def update_fields(doc_id: str, subcategory: str, fields: dict) -> dict:
    """Update specific columns for a row after user fills missing fields.

    Args:
        doc_id: The row's doc_id.
        subcategory: e.g. 'New Business' — to resolve the table.
        fields: {column_name: value} of fields to update.

    Returns:
        The full updated row.
    """
    table_name, columns = es.get_table_for(subcategory)
    valid_cols = {name for name, _, _ in columns if name != 'id'}

    sets = ['updated_at = ?']
    params: list = [_now()]

    for col, val in fields.items():
        if col in valid_cols:
            if col == 'war_risk_included':
                val = 1 if val is True or val == 'true' else 0
            sets.append(f'{col} = ?')
            params.append(val)

    params.append(doc_id)

    conn = _connect()
    try:
        with conn:
            conn.execute(
                f"UPDATE {table_name} SET {', '.join(sets)} WHERE doc_id = ?",
                params,
            )
        row = conn.execute(
            f"SELECT * FROM {table_name} WHERE doc_id = ?", (doc_id,)
        ).fetchone()
        return dict(row) if row else {}
    finally:
        conn.close()


# ---- Query -------------------------------------------------------------------

def get_row(doc_id: str, subcategory: str) -> dict | None:
    """Fetch a single row by doc_id."""
    table_name, _ = es.get_table_for(subcategory)
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
    table_name, _ = es.get_table_for(subcategory)
    conn = _connect()
    try:
        rows = conn.execute(
            f"SELECT * FROM {table_name} ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def list_all_tables() -> dict[str, list[dict]]:
    """Return all rows from all 4 tables, keyed by table name."""
    result = {}
    conn = _connect()
    try:
        for _subcat, (table_name, _columns) in es.SUBCATEGORY_TABLES.items():
            rows = conn.execute(
                f"SELECT * FROM {table_name} ORDER BY created_at DESC"
            ).fetchall()
            result[table_name] = [dict(r) for r in rows]
        return result
    finally:
        conn.close()
