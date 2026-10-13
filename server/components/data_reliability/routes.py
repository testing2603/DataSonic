"""Data Reliability Agent page endpoints (none yet).

Data reliability checks and results.

Add endpoints here; this blueprint is registered automatically:

    @bp.route('/api/data-reliability/...')
    def ...():
        return jsonify(fabric_sql.run_query('SELECT ...'))   # Fabric (read-only)
        # or app_db.run_query / app_db.execute                  # app SQL Server

Keep larger logic in sibling modules (e.g. service.py, store.py), as
components/schema_drift does.
"""

from flask import Blueprint

bp = Blueprint('data_reliability', __name__)
