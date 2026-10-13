"""Shared image storage for document ingestion.

Stores base64-encoded images extracted from emails and documents.
Common across all policy and claims tables, partitioned by LOB.
Each image is linked to a doc_id from the upload tracking table.
"""

import sqlite3
import uuid
from datetime import datetime, timezone

from core import local_db

from . import azure_csv_store

DB_NAME = 'document_images'
TABLE = 'document_images'


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect() -> sqlite3.Connection:
    conn = local_db.connect(DB_NAME)
    conn.execute(f"""
        CREATE TABLE IF NOT EXISTS {TABLE} (
            IMAGE_ID     TEXT PRIMARY KEY,
            DOC_ID       TEXT NOT NULL,
            LOB          TEXT,
            CONTENT_TYPE TEXT NOT NULL DEFAULT 'image/png',
            IMAGE_DATA   TEXT NOT NULL,
            FILENAME     TEXT,
            CREATED_AT   TEXT NOT NULL
        )
    """)
    conn.execute(f"""
        CREATE INDEX IF NOT EXISTS idx_{TABLE}_doc_id ON {TABLE} (DOC_ID)
    """)
    conn.execute(f"""
        CREATE INDEX IF NOT EXISTS idx_{TABLE}_lob ON {TABLE} (LOB)
    """)
    conn.commit()
    return conn


def insert_image(
    doc_id: str,
    image_data: str,
    content_type: str = 'image/png',
    lob: str | None = None,
    filename: str | None = None,
) -> str:
    """Store a base64-encoded image. Returns the generated image_id."""
    image_id = str(uuid.uuid4())
    now = _now()
    conn = connect()
    try:
        with conn:
            conn.execute(
                f"INSERT INTO {TABLE} (IMAGE_ID, DOC_ID, LOB, CONTENT_TYPE, IMAGE_DATA, FILENAME, CREATED_AT) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (image_id, doc_id, lob, content_type, image_data, filename, now),
            )
        blob_url = azure_csv_store.upload_image_file(image_id, image_data, content_type)
        azure_csv_store.append_image_row(image_id, doc_id, lob, content_type, filename, blob_url, now)
        return image_id
    finally:
        conn.close()


def get_image(image_id: str) -> dict | None:
    """Fetch a single image by ID."""
    conn = connect()
    try:
        row = conn.execute(
            f"SELECT * FROM {TABLE} WHERE IMAGE_ID = ?", (image_id,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def get_images_for_doc(doc_id: str) -> list[dict]:
    """Return all images linked to a document."""
    conn = connect()
    try:
        rows = conn.execute(
            f"SELECT IMAGE_ID, DOC_ID, LOB, CONTENT_TYPE, FILENAME, CREATED_AT FROM {TABLE} WHERE DOC_ID = ? ORDER BY CREATED_AT",
            (doc_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_image_data(image_id: str) -> tuple[str, str] | None:
    """Return (content_type, base64_data) for rendering. None if not found."""
    conn = connect()
    try:
        row = conn.execute(
            f"SELECT CONTENT_TYPE, IMAGE_DATA FROM {TABLE} WHERE IMAGE_ID = ?", (image_id,)
        ).fetchone()
        return (row['CONTENT_TYPE'], row['IMAGE_DATA']) if row else None
    finally:
        conn.close()


def delete_images_for_doc(doc_id: str) -> int:
    """Remove all images for a document. Returns count deleted."""
    conn = connect()
    try:
        with conn:
            cursor = conn.execute(
                f"DELETE FROM {TABLE} WHERE DOC_ID = ?", (doc_id,)
            )
        return cursor.rowcount
    finally:
        conn.close()
