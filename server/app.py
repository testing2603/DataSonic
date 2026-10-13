"""DataSonic backend: Flask API for the React app (proxied by Vite at /api).

Layout (see server/README.md):
  config.py     all settings from .env
  core/         shared: sign-in, Fabric SQL (read-only), app SQL Server,
                Fabric REST API, interim local stores
  components/   one package per UI area; each routes.py blueprint is
                registered automatically
  sql/          table scripts for the app SQL Server

Run with `pnpm dev:api` (or `python server/app.py`). Startup signs in to
Microsoft (device code), checks the connections, then serves requests.
"""

import sys

from flask import Flask
from flask_cors import CORS

import components
import config
from core import app_db, auth, fabric_sql, network


def create_app() -> Flask:
    app = Flask(__name__)
    CORS(app)
    registered = components.register_all(app)
    print(f'Components: {", ".join(registered)}', file=sys.stderr)
    return app


app = create_app()


def main():
    network.apply_dns_patch()

    if not config.FABRIC_SERVER:
        print('ERROR: FABRIC_SERVER is not set in .env', file=sys.stderr)
        sys.exit(1)
    print(f'Fabric server: {config.FABRIC_SERVER!r}', file=sys.stderr)
    print(f'Fabric database: {config.FABRIC_DATABASE!r}', file=sys.stderr)
    network.prewarm(config.FABRIC_SERVER)

    # Sign in and verify connections BEFORE serving, so no request arrives
    # while the device code is still being entered.
    print('\nAcquiring Fabric access token...', file=sys.stderr)
    try:
        auth.get_access_token(auth.SQL_SCOPES)
        print('Token acquired successfully.', file=sys.stderr)
    except Exception as e:
        print(f'ERROR: Failed to acquire token: {e}', file=sys.stderr)
        sys.exit(1)

    print('Testing Fabric connection...', file=sys.stderr)
    try:
        fabric_sql.check()
        print('Fabric connection OK - ready to serve requests.\n', file=sys.stderr)
    except Exception as e:
        print(f'ERROR: Fabric connection failed: {e!r}', file=sys.stderr)
        print('Check FABRIC_SERVER in your .env and your network/VPN.', file=sys.stderr)
        sys.exit(1)

    # The app's own SQL Server is optional until it exists; report, don't stop.
    if app_db.is_configured():
        try:
            app_db.check()
            print(f'App SQL Server OK: {config.APP_DB_SERVER}/{config.APP_DB_NAME}', file=sys.stderr)
        except Exception as e:
            print(f'WARNING: App SQL Server connection failed: {e!r}', file=sys.stderr)
    else:
        print('App SQL Server not configured (APP_DB_SERVER); using local stores.', file=sys.stderr)

    components.startup_all()

    print(f'API server starting on http://localhost:{config.API_PORT}')
    app.run(host='0.0.0.0', port=config.API_PORT, debug=True, use_reloader=False)


if __name__ == '__main__':
    main()
