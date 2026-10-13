"""The app's own SQL Server: the read/write database the backend dumps its
data into (extracted rows, app state, decisions, audit logs).

Configured in .env (APP_DB_*). Until APP_DB_SERVER is set, is_configured()
is False and components use their interim local stores instead. Table
definitions live in server/sql/ as numbered scripts.

Usage from a component:
    from core import app_db
    rows = app_db.run_query('SELECT * FROM dbo.x WHERE id = ?', (x_id,))
    app_db.execute('INSERT INTO dbo.x (id, name) VALUES (?, ?)', (x_id, name))
"""

import mssql_python

import config
from core import auth, sql
from core.fabric_sql import token_attrs


class AppDbNotConfigured(RuntimeError):
    pass


def is_configured() -> bool:
    return config.APP_DB_CONFIGURED


def _connection_string() -> tuple[str, dict]:
    server = config.APP_DB_SERVER
    # A named instance (host\instance) is found by the SQL Browser service;
    # otherwise connect on the configured port.
    target = server if '\\' in server else f'{server},{config.APP_DB_PORT}'
    parts = [
        f'Server={target}',
        f'Database={config.APP_DB_NAME}',
        'Encrypt=yes',
        f'TrustServerCertificate={"yes" if config.APP_DB_TRUST_SERVER_CERTIFICATE else "no"}',
    ]
    attrs: dict = {}
    mode = config.APP_DB_AUTH.lower()
    if mode == 'sql':
        parts += [f'UID={config.APP_DB_USER}', f'PWD={{{config.APP_DB_PASSWORD}}}']
    elif mode == 'windows':
        parts.append('Trusted_Connection=yes')
    elif mode == 'entra':
        attrs = token_attrs(auth.get_access_token(auth.SQL_SCOPES))
    else:
        raise ValueError(f"APP_DB_AUTH must be 'sql', 'windows' or 'entra', not {config.APP_DB_AUTH!r}")
    return ';'.join(parts) + ';', attrs


def connect():
    if not is_configured():
        raise AppDbNotConfigured('App SQL Server not configured: set APP_DB_SERVER and APP_DB_NAME in .env')
    conn_str, attrs = _connection_string()
    return mssql_python.connect(conn_str, attrs_before=attrs or None, timeout=30)


def run_query(statement: str, params: sql.Params = None) -> list[dict]:
    return sql.query(connect, statement, params)


def execute(statement: str, params: sql.Params = None) -> int:
    return sql.execute(connect, statement, params)


def execute_many(statement: str, rows: list) -> int:
    return sql.execute_many(connect, statement, rows)


def check():
    """Fail fast at startup if the configured server can't be reached."""
    run_query('SELECT 1 AS ok')
