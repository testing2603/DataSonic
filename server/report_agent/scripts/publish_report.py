"""Publish a built report to a Power BI / Fabric workspace as a NEW report item (never overwrites).

    python server/report_agent/scripts/publish_report.py report_data/reports/<folder> [--workspace <id>] [--name "<display name>"]

Follows Microsoft's powerbi-report-cli management rules: a copy of the .Report is rebound to the
API form of the model link (`semanticmodelid=<id>`), packed (with `powerbi-report-author pack --raw
--mode create` when it's installed, otherwise directly as base64 PBIR parts), POSTed to the Fabric
Reports API, and the long-running operation is polled to a terminal state (never re-POSTed).
The local .Report keeps its Desktop-style binding.

Workspace: --workspace, else PUBLISH_WORKSPACE_ID, else the signed-in user's own My workspace.
Sign-in: the report server passes its MSAL token; the command line uses `az login` (POC).
"""
import base64
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pbir_build  # noqa: E402

FABRIC = "https://api.fabric.microsoft.com"
FABRIC_SCOPES = [f"{FABRIC}/.default"]
SKILL_HEADER = {"x-ms-fabric-skill": "powerbi-report-cli"}
MODEL_ID = os.environ.get("POWERBI_MODEL_ID", "dcd787e0-dd7d-47fd-bb3d-af3669727011")


def token():
    r = subprocess.run("az account get-access-token --resource https://api.fabric.microsoft.com --query accessToken -o tsv",
                       shell=True, capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError("Not signed in to Azure. Run: az login --allow-no-subscriptions")
    return r.stdout.strip()


def resolve_workspace(h, workspace_id=None):
    """(workspace id, is personal). Defaults to the signed-in user's My workspace, which only they can see."""
    workspace_id = workspace_id or os.environ.get("PUBLISH_WORKSPACE_ID")
    if workspace_id:
        return workspace_id, False
    url = f"{FABRIC}/v1/workspaces"
    while url:
        r = requests.get(url, headers=h, timeout=60)
        if not r.ok:
            raise RuntimeError(f"Couldn't list your workspaces: HTTP {r.status_code} {r.text[:300]}")
        body = r.json()
        personal = next((w for w in body.get("value", []) if w.get("type") == "Personal"), None)
        if personal:
            return personal["id"], True
        url = body.get("continuationUri")
    raise RuntimeError("Couldn't find your My workspace; set PUBLISH_WORKSPACE_ID in .env to publish somewhere else")


def report_url(workspace_id, report_id, personal):
    return f"https://app.powerbi.com/groups/{'me' if personal else workspace_id}/reports/{report_id}"


def validate(report_dir):
    if pbir_build.CLI:
        v = subprocess.run(f'powerbi-report-author validate "{report_dir}"', shell=True, capture_output=True, text=True)
        res = json.loads(v.stdout)["data"]
    else:
        res = pbir_build.local_validate(report_dir)
    if res["result"] == "failed":
        raise RuntimeError(f"Validation failed before publish: {res['errorCount']} errors")


def pack(report_dir, name, tmp):
    if pbir_build.CLI:
        body_file = Path(tmp) / "create-report.json"
        p = subprocess.run(f'powerbi-report-author pack "{report_dir}" --raw --mode create --display-name "{name}" --out "{body_file}"',
                           shell=True, capture_output=True, text=True)
        if p.returncode or not body_file.exists():
            raise RuntimeError(f"pack failed: {p.stdout[-500:]} {p.stderr[-500:]}")
        return json.loads(body_file.read_text(encoding="utf-8"))
    # Same shape the CLI produces: every file of the .Report as an inline base64 part (.platform is optional
    # and its displayName would compete with the request's, so it's left out).
    parts = [{"path": f.relative_to(report_dir).as_posix(), "payload": base64.b64encode(f.read_bytes()).decode(),
              "payloadType": "InlineBase64"}
             for f in sorted(report_dir.rglob("*")) if f.is_file() and f.name != ".platform"]
    return {"displayName": name, "definition": {"format": "PBIR", "parts": parts}}


def publish(folder, workspace_id=None, display_name=None, model_id=MODEL_ID, access_token=None):
    folder = Path(folder).resolve()
    src = next(folder.glob("*.Report"), None)
    if not src or not (src / "definition" / "report.json").exists():
        raise RuntimeError(f"No modern PBIR .Report folder with definition/report.json in {folder}")
    name = display_name or src.name.removesuffix(".Report")

    with tempfile.TemporaryDirectory() as tmp:
        dst = Path(tmp) / "r.Report"   # short path: Windows' 260-char limit
        shutil.copytree(src, dst)
        pbir = dst / "definition.pbir"
        d = json.loads(pbir.read_text(encoding="utf-8"))
        d["datasetReference"] = {"byConnection": {"connectionString": f"semanticmodelid={model_id}"}}
        pbir.write_text(json.dumps(d, indent=2), encoding="utf-8")
        validate(dst)
        body = pack(dst, name, tmp)

    h = {"Authorization": "Bearer " + (access_token or token()), "Content-Type": "application/json", **SKILL_HEADER}
    workspace_id, personal = resolve_workspace(h, workspace_id)
    r = requests.post(f"{FABRIC}/v1/workspaces/{workspace_id}/reports", headers=h, json=body, timeout=120)
    if r.status_code in (400, 409) and "ItemDisplayNameAlreadyInUse" in r.text:
        # Never overwrite: publish alongside the existing report under a dated name.
        body["displayName"] = f"{name} ({time.strftime('%d %b %H.%M')})"
        r = requests.post(f"{FABRIC}/v1/workspaces/{workspace_id}/reports", headers=h, json=body, timeout=120)
    if r.status_code == 201:
        item = r.json()
    elif r.status_code == 202:
        item = poll(r, h)
    else:
        raise RuntimeError(f"Publish failed: HTTP {r.status_code} {r.text[:600]}")
    return {"reportId": item["id"], "displayName": item.get("displayName", body["displayName"]),
            "workspaceId": workspace_id, "url": report_url(workspace_id, item["id"], personal)}


def poll(resp, h, limit_s=300):
    op_url = resp.headers.get("Location") or f"{FABRIC}/v1/operations/{resp.headers['x-ms-operation-id']}"
    deadline = time.time() + limit_s
    while time.time() < deadline:
        time.sleep(int(resp.headers.get("Retry-After", 3)))
        s = requests.get(op_url, headers=h, timeout=60)
        st = s.json().get("status")
        if st == "Succeeded":
            rr = requests.get(op_url.rstrip("/") + "/result", headers=h, timeout=60)
            rr.raise_for_status()
            return rr.json()
        if st in ("Failed", "Cancelled"):
            raise RuntimeError(f"Publish operation {st}: {json.dumps(s.json().get('error', {}))[:600]}")
    raise RuntimeError("Publish still running after 5 minutes; check the workspace before retrying")


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("--workspace")
    ap.add_argument("--name")
    a = ap.parse_args()
    print(json.dumps(publish(a.folder, a.workspace, a.name), indent=2))
