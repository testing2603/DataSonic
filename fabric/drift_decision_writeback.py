# Fabric notebook: drift decision write-back
#
# Paste into the Fabric notebook the backend runs (FABRIC_DECISION_NOTEBOOK_ID)
# as TWO cells, split at the "CELL" markers below.
#
# Setup in Fabric (once):
#   1. Notebook language: Python (not PySpark) -- toolbar language dropdown.
#   2. Cell 1: "..." menu on the cell -> "Toggle parameter cell".
#      (Cell 1 keeps an already-injected value either way.)
#   3. lakehouse_name: the lakehouse holding drift_ui_review, schema_registry
#      and schema_drift_log.
#
# What a run does, per decision (by ACTION + DRIFT_TYPE):
#   NEW_COLUMN     + REJECT_DRIFT -> schema_drift_log + schema_registry
#   NEW_COLUMN     + ACCEPT_DRIFT -> schema_registry
#   COLUMN_RENAMED + REJECT_DRIFT -> schema_registry
#   COLUMN_RENAMED + ACCEPT_DRIFT -> schema_drift_log + schema_registry
# and in every case the drift is then deleted from drift_ui_review (the
# pending-review queue).
#
# Target columns are filled by name (case-insensitive): first from the
# decision, then from the drift's row in drift_ui_review; anything else is
# left null. Writes skip rows already present, and the delete runs last, so a
# retried run never duplicates or loses a decision. Parameters are only ever
# used as data, never pasted into SQL text.


# ============================ CELL 1 (parameters) ============================
# Defaults only: never overwrite a value Fabric injected in an earlier cell.
decisions_json = globals().get("decisions_json", "[]")
workspace_id = globals().get("workspace_id", "1296a62d-7e36-4481-a586-686e8d4b0ccc")
lakehouse_name = globals().get("lakehouse_name", "Bronze_Data")
# Used only if the lakehouse can't be looked up by name.
lakehouse_id = globals().get("lakehouse_id", "")
# schema_drift_log lives in a separate lakehouse (LH_RAW).
drift_log_lakehouse_name = globals().get("drift_log_lakehouse_name", "LH_RAW")
drift_log_lakehouse_id = globals().get("drift_log_lakehouse_id", "e9d9d351-4665-4b03-9af4-26b1e6207c3b")


# ============================ CELL 2 (processing) ============================
import json
import re
import time
from datetime import date, datetime, timezone
from decimal import Decimal

import pyarrow as pa
import pyarrow.dataset as ds
from deltalake import DeltaTable
from deltalake.exceptions import CommitFailedError, TableNotFoundError

REVIEW_TABLE = "drift_ui_review"
REGISTRY_TABLE = "schema_registry"
DRIFT_LOG_TABLE = "schema_drift_log"
VALID_ACTIONS = {"REJECT_DRIFT", "ACCEPT_DRIFT"}


def tables_for(action, drift_type):
    """Which tables a decision writes to, based on action + drift type."""
    if drift_type == "NEW_COLUMN":
        if action == "REJECT_DRIFT":
            return [DRIFT_LOG_TABLE, REGISTRY_TABLE]
        return [REGISTRY_TABLE]
    if drift_type == "COLUMN_RENAMED":
        if action == "ACCEPT_DRIFT":
            return [DRIFT_LOG_TABLE, REGISTRY_TABLE]
        return [REGISTRY_TABLE]
    return [REGISTRY_TABLE]

decisions = json.loads(decisions_json)
print(f"Received {len(decisions)} decision(s)")
if not decisions:
    print("Nothing to write. If the backend sent decisions, check that the defaults cell "
          "is marked as the parameter cell and does not overwrite the injected value.")

storage_options = {
    "bearer_token": notebookutils.credentials.getToken("storage"),  # noqa: F821 (Fabric built-in)
    "use_fabric_endpoint": "true",
}


def _resolve_lakehouse(name, fallback_id):
    """This tenant only accepts GUIDs in OneLake paths, so look the lakehouse
    up by name (a Fabric API call, which names are fine for)."""
    try:
        info = notebookutils.lakehouse.get(name, workspace_id)  # noqa: F821
        found = info.get("id") if isinstance(info, dict) else getattr(info, "id", None)
        if found:
            return found
    except Exception as e:
        print(f"Lakehouse lookup by name failed ({e}); using fallback id")
    if not fallback_id:
        raise RuntimeError(f"Could not resolve lakehouse '{name}'; set its id parameter")
    return fallback_id


tables_root = f"abfss://{workspace_id}@onelake.dfs.fabric.microsoft.com/{_resolve_lakehouse(lakehouse_name, lakehouse_id)}/Tables"
drift_log_tables_root = f"abfss://{workspace_id}@onelake.dfs.fabric.microsoft.com/{_resolve_lakehouse(drift_log_lakehouse_name, drift_log_lakehouse_id)}/Tables"

# Which root to use for each table.
_TABLE_ROOTS = {
    DRIFT_LOG_TABLE: drift_log_tables_root,
}


def find_table(name):
    """Schema-enabled lakehouses keep tables under Tables/dbo/, others under Tables/."""
    root = _TABLE_ROOTS.get(name, tables_root)
    for path in (f"{root}/dbo/{name}", f"{root}/{name}"):
        try:
            DeltaTable(path, storage_options=storage_options)
            return path
        except TableNotFoundError:
            pass
    raise RuntimeError(f"Table {name} not found under {root}")


def open_table(path):
    return DeltaTable(path, storage_options=storage_options)


def with_retry(action, what):
    """Other notebooks write these tables too; retry on write conflicts."""
    for attempt in range(1, 6):
        try:
            return action()
        except CommitFailedError as e:
            if attempt == 5:
                raise
            print(f"{what}: write conflict ({e}); retrying in {attempt * 5}s")
            time.sleep(attempt * 5)


# ---- Delta schema -> Arrow types, and value conversion ---------------------

_SIMPLE_TYPES = {
    "string": pa.string(), "long": pa.int64(), "integer": pa.int32(),
    "short": pa.int16(), "byte": pa.int8(), "float": pa.float32(),
    "double": pa.float64(), "boolean": pa.bool_(), "date": pa.date32(),
    "timestamp": pa.timestamp("us", tz="UTC"), "timestamp_ntz": pa.timestamp("us"),
    "binary": pa.binary(),
}


def arrow_type(delta_type):
    name = getattr(delta_type, "type", None) or str(delta_type)
    if name in _SIMPLE_TYPES:
        return _SIMPLE_TYPES[name]
    m = re.fullmatch(r"decimal\((\d+),\s*(\d+)\)", name)
    if m:
        return pa.decimal128(int(m.group(1)), int(m.group(2)))
    return None  # array/map/struct: not written by this notebook


def convert(value, typ):
    """Coerce a JSON/Delta value into the target column's Arrow type."""
    if value is None:
        return None
    if pa.types.is_timestamp(typ) or pa.types.is_date(typ):
        if isinstance(value, str):
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if isinstance(value, datetime):
            if pa.types.is_date(typ):
                return value.date()
            if typ.tz is None:
                return value.astimezone(timezone.utc).replace(tzinfo=None) if value.tzinfo else value
            return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return value
    if pa.types.is_string(typ):
        if isinstance(value, (list, dict)):
            return json.dumps(value)
        if isinstance(value, (datetime, date)):
            return value.isoformat()
        return str(value)
    if pa.types.is_boolean(typ):
        return value if isinstance(value, bool) else str(value).strip().lower() in ("true", "1", "yes")
    if pa.types.is_integer(typ):
        return int(value)
    if pa.types.is_floating(typ):
        return float(value)
    if pa.types.is_decimal(typ):
        return Decimal(str(value))
    return value


# ---- Building rows for a target table ---------------------------------------

def decision_values(d):
    """Decision fields by the column names schema_registry uses."""
    return {
        "FEEDBACK_ID": d.get("feedback_id"),
        "DRIFT_ID": d.get("drift_id"),
        "CDR_CONCEPT": d.get("cdr_concept"),
        "FIELD_NAME": d.get("field_name"),
        "DRIFT_TYPE": d.get("drift_type"),
        "OLD_FIELD_NAME": d.get("old_field_name"),
        "NEW_FIELD_NAME": d.get("new_field_name"),
        "OLD_DATA_TYPE": d.get("old_data_type"),
        "NEW_DATA_TYPE": d.get("new_data_type"),
        "DECISION": d.get("decision"),
        "ACTION": d.get("action"),
        "STATUS": d.get("status"),
        "TAG_TYPE": d.get("tag_type"),
        "TAG_FIELD": d.get("tag_field"),
        "STEWARD_ID": d.get("steward_id"),
        "STEWARD_COMMENT": d.get("steward_comment"),
        "REVIEW_TIMESTAMP": d.get("decision_time"),
        "CREATED_TIME": d.get("decision_time"),
    }


def build_rows(dt, sources):
    """One Arrow table in dt's schema. `sources` is a list of dicts per row,
    highest priority first; columns match by name, case-insensitively."""
    columns, arrays, missing = [], [], set()
    for field in dt.schema().fields:
        typ = arrow_type(field.type)
        values = []
        for row_sources in sources:
            value = None
            for src in row_sources:
                hit = next((v for k, v in src.items() if k.upper() == field.name.upper()), None)
                if hit is not None:
                    value = hit
                    break
            values.append(value)
        if typ is None:
            if any(v is not None for v in values) or not field.nullable:
                missing.add(f"{field.name} (unsupported type {field.type})")
            continue
        if not field.nullable and any(v is None for v in values):
            missing.add(field.name)
        columns.append(field.name)
        arrays.append(pa.array([convert(v, typ) for v in values], typ))
    if missing:
        raise RuntimeError(f"Cannot fill required column(s) {sorted(missing)} in {dt.table_uri}")
    return pa.table(dict(zip(columns, arrays)))


def column(dt, wanted):
    """The table's own spelling of a column name, or None."""
    return next((f.name for f in dt.schema().fields if f.name.upper() == wanted.upper()), None)


def insert_new(path, rows, key, what):
    """Insert rows whose key isn't in the table yet (safe to re-run)."""
    def run():
        dt = open_table(path)
        return (
            dt.merge(source=rows, predicate=f"t.`{key}` = s.`{key}`",
                     source_alias="s", target_alias="t")
            .when_not_matched_insert_all()
            .execute()
        )
    metrics = with_retry(run, what)
    print(f"{what}: {metrics.get('num_target_rows_inserted')} row(s) added")


if decisions:
    unknown = sorted({d.get("action") for d in decisions} - VALID_ACTIONS)
    if unknown:
        raise RuntimeError(f"Unknown action(s) {unknown}; expected {sorted(VALID_ACTIONS)}")

    review_path = find_table(REVIEW_TABLE)
    review_dt = open_table(review_path)
    review_id = column(review_dt, "DRIFT_ID")
    if review_id is None:
        raise RuntimeError(f"{REVIEW_TABLE} has no DRIFT_ID column")

    # The drifts' current rows in the review queue (missing if an earlier,
    # partly finished run already removed them -- the decision then fills
    # what it can).
    ids = sorted({d["drift_id"] for d in decisions})
    review_rows = {
        r[review_id]: r
        for r in review_dt.to_pyarrow_dataset().to_table(filter=ds.field(review_id).isin(ids)).to_pylist()
    }
    for drift_id in ids:
        if drift_id not in review_rows:
            print(f"{drift_id}: not in {REVIEW_TABLE} (already moved?); using the decision's fields only")

    # 1. Write each target table for the decisions routed to it.
    drift_log_errors = []
    for table in (REGISTRY_TABLE, DRIFT_LOG_TABLE):
        routed = [d for d in decisions if table in tables_for(d["action"], d.get("drift_type"))]
        if not routed:
            continue
        try:
            path = find_table(table)
            dt = open_table(path)
            if table == REGISTRY_TABLE:
                # The decision wins over the review row (e.g. DECISION/STATUS,
                # which are PENDING in drift_ui_review).
                sources = [[decision_values(d), review_rows.get(d["drift_id"], {})] for d in routed]
                key = column(dt, "FEEDBACK_ID") or column(dt, "DRIFT_ID")
            else:
                # schema_drift_log: decision values first so STATUS, DECISION
                # and CREATED_TIME reflect the actual decision, then fill
                # remaining columns from the review row.
                sources = [[decision_values(d), review_rows.get(d["drift_id"], {})] for d in routed]
                key = column(dt, "DRIFT_ID")
            if key is None:
                raise RuntimeError(f"{table} has no DRIFT_ID column to de-duplicate on")
            rows = build_rows(dt, sources)
            print(f"{table}: filling {rows.num_columns} column(s): {', '.join(rows.column_names)}")
            insert_new(path, rows, key, table)
        except Exception as e:
            if table == DRIFT_LOG_TABLE:
                print(f"WARNING: {DRIFT_LOG_TABLE} write failed ({e}); continuing with registry and review cleanup")
                drift_log_errors.append(str(e))
            else:
                raise

    # 2. Only then remove the decided drifts from the review queue.
    def delete_reviewed():
        dt = open_table(review_path)
        source = pa.table({"drift_id": pa.array(ids, pa.string())})
        return (
            dt.merge(source=source, predicate=f"t.`{review_id}` = s.drift_id",
                     source_alias="s", target_alias="t")
            .when_matched_delete()
            .execute()
        )
    metrics = with_retry(delete_reviewed, REVIEW_TABLE)
    print(f"{REVIEW_TABLE}: {metrics.get('num_target_rows_deleted')} row(s) removed")

    if drift_log_errors:
        print(f"WARNING: {DRIFT_LOG_TABLE} in {drift_log_lakehouse_name} had errors: {'; '.join(drift_log_errors)}")
        print("Registry and review updates completed successfully despite drift log failure.")
