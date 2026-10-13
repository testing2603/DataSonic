# App SQL Server scripts

Table definitions for the backend's own SQL Server (`core/app_db.py`, configured by `APP_DB_*` in `.env`).

- One file per change, numbered, never edited once applied: `001_create_<table>.sql`, `002_...`.
- Run them in order in SSMS against `APP_DB_NAME`.
- Put the component in each file's header comment (e.g. `-- component: ingestion`).

No scripts yet. Schema drift decisions still use the interim SQLite store (`components/schema_drift/store.py`). Moving them here means adding `001_create_schema_drift_feedback.sql`, then switching that one module to `core.app_db`.
