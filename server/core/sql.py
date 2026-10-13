"""Query helpers shared by every SQL connection (Fabric and the app's SQL
Server), both of which use Microsoft's mssql-python driver.

Always pass values as parameters, never formatted into the SQL text:
    query(connect, 'SELECT * FROM t WHERE id = ?', (drift_id,))
    query(connect, 'SELECT * FROM t WHERE id = %(id)s', {'id': drift_id})
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Callable

Params = tuple | list | dict | None


def _jsonable(value: Any) -> Any:
    """Values Flask's jsonify returns cleanly (ISO dates, floats)."""
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def query(connect: Callable, sql: str, params: Params = None) -> list[dict]:
    """Run a SELECT and return its rows as dicts keyed by column name."""
    return query_with_columns(connect, sql, params)[1]


def query_with_columns(connect: Callable, sql: str, params: Params = None) -> tuple[list[str], list[dict]]:
    """Run a SELECT; return (column names in result order, rows as dicts)."""
    conn = connect()
    try:
        cursor = conn.cursor()
        if params is None:
            cursor.execute(sql)
        else:
            cursor.execute(sql, params)
        columns = [d[0] for d in cursor.description]
        rows = [{c: _jsonable(v) for c, v in zip(columns, row)} for row in cursor.fetchall()]
        return columns, rows
    finally:
        conn.close()


def execute(connect: Callable, sql: str, params: Params = None) -> int:
    """Run an INSERT/UPDATE/DELETE, commit, and return the affected row count."""
    conn = connect()
    try:
        cursor = conn.cursor()
        if params is None:
            cursor.execute(sql)
        else:
            cursor.execute(sql, params)
        conn.commit()
        return cursor.rowcount
    finally:
        conn.close()


def execute_many(connect: Callable, sql: str, rows: list) -> int:
    """Run one statement for many parameter sets in a single transaction."""
    conn = connect()
    try:
        cursor = conn.cursor()
        cursor.executemany(sql, rows)
        conn.commit()
        return len(rows)
    finally:
        conn.close()
