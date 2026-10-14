"""Fabric lakehouse SQL analytics endpoint (read-only).

Why mssql-python: Fabric redirects every login to a second server named
"<host>\\<instance>". The Node `tedious`/`mssql` packages and pure-Python
`python-tds` both fail on that redirect; Microsoft's `mssql-python` handles it
and bundles its own ODBC driver in the pip wheel (no admin install).

The endpoint is read-only by design: writes to the lakehouse go through a
Fabric notebook (see core.fabric_api).
"""

import struct
from functools import partial

import mssql_python

import config
from core import auth, sql

SQL_COPT_SS_ACCESS_TOKEN = 1256  # ODBC attribute for an Entra access token


def token_attrs(token: str) -> dict:
    """ODBC connection attribute carrying an Entra access token."""
    raw = token.encode('utf-16-le')
    return {SQL_COPT_SS_ACCESS_TOKEN: struct.pack(f'<I{len(raw)}s', len(raw), raw)}


def connect(database: str | None = None):
    """Connect to a lakehouse/warehouse on the workspace's SQL endpoint:
    FABRIC_DATABASE (Bronze_Data) unless another one is named."""
    return mssql_python.connect(
        f'Server={config.FABRIC_SERVER},1433;'
        f'Database={database or config.FABRIC_DATABASE};'
        'Encrypt=yes;TrustServerCertificate=no;',
        attrs_before=token_attrs(auth.get_access_token(auth.SQL_SCOPES)),
        timeout=60,
    )


def run_query(statement: str, params: sql.Params = None, database: str | None = None) -> list[dict]:
    """SELECT against the lakehouse; rows as dicts."""
    return sql.query(partial(connect, database), statement, params)


def run_query_with_columns(statement: str, params: sql.Params = None,
                           database: str | None = None) -> tuple[list[str], list[dict]]:
    """Like run_query, plus the column names in the table's own order (JSON
    responses don't keep dict key order)."""
    return sql.query_with_columns(partial(connect, database), statement, params)


def execute(statement: str, params: sql.Params = None, database: str | None = None) -> int:
    """INSERT/UPDATE/DELETE against a Fabric warehouse; commits and returns affected row count."""
    return sql.execute(partial(connect, database), statement, params)


def check():
    """Fail fast at startup if the endpoint can't be reached."""
    run_query('SELECT 1 AS ok')
