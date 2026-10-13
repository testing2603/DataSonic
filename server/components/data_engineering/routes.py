"""Data Engineering page endpoints (none yet).

Bronze cleaning: trigger the cleaning notebook/pipeline
(core.fabric_api) and read bronze output, transformation logs and
quality metrics (core.fabric_sql). Architecture doc: POST /api/clean.

Add endpoints here; this blueprint is registered automatically:

    @bp.route('/api/data-engineering/...')
    def ...():
        return jsonify(fabric_sql.run_query('SELECT ...'))   # Fabric (read-only)
        # or app_db.run_query / app_db.execute                  # app SQL Server

Keep larger logic in sibling modules (e.g. service.py, store.py), as
components/schema_drift does.
"""

from flask import Blueprint

bp = Blueprint('data_engineering', __name__)
