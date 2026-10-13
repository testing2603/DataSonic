"""Run a read-only DAX query against Marine_Gold_Model and print the rows as JSON.

Usage:
    python server/report_agent/scripts/run_dax.py "EVALUATE ROW(\"x\", [# Claims])"
    python server/report_agent/scripts/run_dax.py --file query.dax

Only DAX queries (EVALUATE / DEFINE) are accepted; executeQueries cannot change the model.
Sign-in uses MSAL device-code flow (same as the rest of the DataSonic backend).
"""
import json
import os
import re
import sys
import threading
import time
from pathlib import Path

import msal
import requests

from dotenv import load_dotenv

_env_path = Path(__file__).resolve().parent.parent.parent.parent / ".env"
load_dotenv(_env_path)

WORKSPACE_ID = os.environ.get("FABRIC_WORKSPACE_ID", "1296a62d-7e36-4481-a586-686e8d4b0ccc")
MODEL_ID = os.environ.get("POWERBI_MODEL_ID", "dcd787e0-dd7d-47fd-bb3d-af3669727011")
MAX_ROWS = 200

AZURE_CLI_CLIENT_ID = "04b07795-8ddb-461a-bbee-02f9e1bf7b46"
AZURE_CLIENT_ID = os.environ.get("AZURE_CLIENT_ID", "") or AZURE_CLI_CLIENT_ID
AZURE_TENANT_ID = os.environ.get("AZURE_TENANT_ID", "") or "organizations"
AUTHORITY = f"https://login.microsoftonline.com/{AZURE_TENANT_ID}"

POWERBI_SCOPES = ["https://analysis.windows.net/powerbi/api/.default"]

_msal_app = msal.PublicClientApplication(AZURE_CLIENT_ID, authority=AUTHORITY)
_token_lock = threading.Lock()

# Optional callback(message) so the report server can show the device-code sign-in in the web UI
# instead of only in its terminal.
on_device_code = None


def token():
    with _token_lock:
        accounts = _msal_app.get_accounts()
        if accounts:
            result = _msal_app.acquire_token_silent(POWERBI_SCOPES, account=accounts[0])
            if result and "access_token" in result:
                return result["access_token"]

        flow = _msal_app.initiate_device_flow(scopes=POWERBI_SCOPES)
        if "user_code" not in flow:
            sys.exit(f"Device code flow failed: {json.dumps(flow)}")

        print("\n--- Microsoft sign-in required (Power BI) ---", file=sys.stderr)
        print(flow["message"], file=sys.stderr)
        print("------------------------------------------------\n", file=sys.stderr)
        sys.stderr.flush()
        if on_device_code:
            on_device_code(flow["message"])

        result = _msal_app.acquire_token_by_device_flow(flow)
        if "access_token" not in result:
            sys.exit(f"Token acquisition failed: {json.dumps(result)}")
        return result["access_token"]


def silent_token(scopes):
    """A token for `scopes` from the existing sign-in (e.g. the Fabric API after the Power BI sign-in), or None."""
    with _token_lock:
        accounts = _msal_app.get_accounts()
        result = _msal_app.acquire_token_silent(scopes, account=accounts[0]) if accounts else None
    return result["access_token"] if result and "access_token" in result else None


_pending_flow = {}


def begin_sign_in(scopes):
    """Start a device-code sign-in in the background (for HTTP callers that can't block); returns the
    message to show the user. Repeated calls while one is pending return the same code."""
    with _token_lock:
        flow = _pending_flow.get("flow")
        if flow and flow.get("expires_at", 0) > time.time() and _pending_flow.get("thread").is_alive():
            return flow["message"]
        flow = _msal_app.initiate_device_flow(scopes=scopes)
        if "user_code" not in flow:
            raise RuntimeError(f"Device code flow failed: {json.dumps(flow)}")
        t = threading.Thread(target=_msal_app.acquire_token_by_device_flow, args=(flow,), daemon=True)
        t.start()
        _pending_flow.update(flow=flow, thread=t)
        return flow["message"]


def run(dax):
    body = re.sub(r"(--|//)[^\n]*", "", dax).strip()
    if not re.match(r"^(DEFINE|EVALUATE)\b", body, re.I):
        sys.exit("Refused: only DAX queries starting with EVALUATE or DEFINE are allowed.")
    try:
        r = requests.post(
            f"https://api.powerbi.com/v1.0/myorg/groups/{WORKSPACE_ID}/datasets/{MODEL_ID}/executeQueries",
            headers={"Authorization": "Bearer " + token()},
            json={"queries": [{"query": dax}], "serializerSettings": {"includeNulls": True}}, timeout=120)
    except requests.RequestException as e:
        sys.exit(f"Power BI request failed (network, not the DAX): {e}")
    if not r.ok:
        try:
            err = r.json()["error"]["pbi.error"]["details"]
            msg = next((d["detail"]["value"] for d in err if d["code"] == "DetailsMessage"), r.text)
        except Exception:
            msg = r.text
        sys.exit(f"DAX error: {msg[:1500]}")
    rows = r.json()["results"][0]["tables"][0]["rows"]
    return [{k.split("[", 1)[-1].rstrip("]") if k.startswith("[") else k: v for k, v in row.items()} for row in rows]


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--file":
        query = open(sys.argv[2], encoding="utf-8").read()
    elif len(sys.argv) == 2:
        query = sys.argv[1]
    else:
        sys.exit(__doc__)
    rows = run(query)
    print(json.dumps({"row_count": len(rows), "rows": rows[:MAX_ROWS], "truncated": len(rows) > MAX_ROWS},
                     indent=1, ensure_ascii=False, default=str))
