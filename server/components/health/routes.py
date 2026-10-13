"""Liveness check: GET /api/health."""

from flask import Blueprint, jsonify

import config

bp = Blueprint('health', __name__)


@bp.route('/api/health')
def health():
    return jsonify({'ok': True, 'appDbConfigured': config.APP_DB_CONFIGURED})
