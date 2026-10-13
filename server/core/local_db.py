"""Interim local SQLite stores, one file per component under
server/local_data/ (git-ignored). Used until the app's SQL Server
(core.app_db) is connected; each component keeps its store behind its own
module so moving it to SQL Server is a one-file change.
"""

import os
import sqlite3

import config


def path(name: str) -> str:
    return os.path.join(config.LOCAL_DATA_DIR, f'{name}.db')


def connect(name: str) -> sqlite3.Connection:
    """Open server/local_data/<name>.db with rows readable by column name."""
    os.makedirs(config.LOCAL_DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(path(name))
    conn.row_factory = sqlite3.Row
    return conn
