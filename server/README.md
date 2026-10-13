# Backend

Flask API behind the React app. Vite proxies `/api/*` to it on port 3001. Start it with `pnpm dev:api`, or `pnpm dev:all` to run it together with the frontend.

```
server/
├── app.py            entry point: sign-in, connection checks, starts the server
├── config.py         every setting from .env (see .env.example)
├── core/             shared by all components
│   ├── auth.py         Microsoft sign-in (device code), tokens, signed_in_user()
│   ├── network.py      DNS fallback for the corporate network
│   ├── sql.py          query / execute helpers (parameters, never string-formatting)
│   ├── fabric_sql.py   Fabric lakehouse SQL analytics endpoint — READ-ONLY
│   ├── app_db.py       the app's own SQL Server — read/write (APP_DB_* in .env)
│   ├── fabric_api.py   Fabric REST API: run_notebook / run_pipeline / job_status
│   └── local_db.py     interim SQLite stores in server/local_data/ (git-ignored)
├── components/       one package per UI area
│   ├── health/           /api/health
│   ├── schema_drift/     Stewardship Review > Schema Drift (routes, store, sync)
│   ├── ingestion/  mdm/  data_engineering/  data_reliability/  reporting/  ai_chat/
│   │                     empty blueprints, ready for their endpoints
│   └── __init__.py       auto-registers every components/*/routes.py
├── sql/              numbered table scripts for the app SQL Server
└── requirements.txt
```

## Adding endpoints for a component

1. Write them in `components/<name>/routes.py` on its `bp` blueprint. They're registered automatically, and `app.py` never changes.
2. Read from the lakehouse with `core.fabric_sql.run_query(...)`.
3. Read from or write to the app's SQL Server with `core.app_db.run_query(...)` or `core.app_db.execute(...)`. Add any new table as a numbered script in `sql/`.
4. Write to the lakehouse or kick off processing with `core.fabric_api.run_notebook(...)` or `run_pipeline(...)`.
5. Put bigger logic in sibling modules, such as `service.py` or `store.py`, the way `schema_drift/` does.
6. If the component needs a background worker, define `on_startup()` in `routes.py`. It runs once after sign-in.

New settings go in `config.py` and `.env.example`. Don't read `os.environ` anywhere else.
