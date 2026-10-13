"""One package per UI area. Each has a routes.py exposing `bp`, a Flask
Blueprint holding that area's /api endpoints; register_all() finds and
registers every one, so adding a component never touches app.py.

A routes.py may also define `on_startup()`, called once after sign-in and the
connection checks (e.g. to start a background worker).

To add endpoints for a component:
    # components/<name>/routes.py
    from flask import Blueprint, jsonify
    from core import fabric_sql, app_db

    bp = Blueprint('<name>', __name__)

    @bp.route('/api/<name>/things')
    def things():
        return jsonify(fabric_sql.run_query('SELECT ... FROM dbo.x'))
"""

import importlib
import pkgutil
import sys

from flask import Flask


def _route_modules():
    for info in sorted(pkgutil.iter_modules(__path__), key=lambda m: m.name):
        if info.ispkg:
            try:
                yield info.name, importlib.import_module(f'{__name__}.{info.name}.routes')
            except ModuleNotFoundError as e:
                if e.name != f'{__name__}.{info.name}.routes':
                    raise  # a real import error inside routes.py
                # a component folder without routes.py yet


def register_all(app: Flask) -> list[str]:
    """Register every components/*/routes.py `bp`; returns their names."""
    names = []
    for name, module in _route_modules():
        bp = getattr(module, 'bp', None)
        if bp is None:
            print(f'components/{name}/routes.py has no `bp`; skipped', file=sys.stderr)
            continue
        app.register_blueprint(bp)
        names.append(name)
    return names


def startup_all():
    """Run each component's optional on_startup() hook."""
    for name, module in _route_modules():
        hook = getattr(module, 'on_startup', None)
        if hook:
            hook()
