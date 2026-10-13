"""Fabric REST API: start item jobs (notebooks, pipelines) and poll them.

Uses the same Microsoft sign-in as the SQL endpoint (a second token, for the
Fabric API scope, obtained silently). Running an item needs Contributor or
higher on the workspace.
"""

import json

import requests

import config
from core import auth

FABRIC_API = 'https://api.fabric.microsoft.com/v1'


def _headers() -> dict:
    return {'Authorization': f'Bearer {auth.get_access_token(auth.FABRIC_API_SCOPES)}'}


def run_item_job(item_id: str, job_type: str, parameters: dict | None = None,
                 workspace_id: str | None = None) -> str:
    """Start a job and return its job-instance URL (poll with job_status).

    job_type: 'RunNotebook' for notebooks, 'Pipeline' for data pipelines.
    parameters: {name: value}; strings/ints/floats/bools are typed for you.
    """
    typed = {}
    for name, value in (parameters or {}).items():
        kind = ('bool' if isinstance(value, bool) else
                'int' if isinstance(value, int) else
                'float' if isinstance(value, float) else 'string')
        typed[name] = {'value': value if kind != 'string' else str(value), 'type': kind}
    body = {'executionData': {'parameters': typed}} if typed else None

    resp = requests.post(
        f'{FABRIC_API}/workspaces/{workspace_id or config.FABRIC_WORKSPACE_ID}/items/'
        f'{item_id}/jobs/instances?jobType={job_type}',
        headers=_headers(), json=body, timeout=30,
    )
    if resp.status_code != 202 or 'Location' not in resp.headers:
        raise RuntimeError(f'{job_type} not accepted: HTTP {resp.status_code} {resp.text[:300]}')
    return resp.headers['Location']


def run_notebook(notebook_id: str, parameters: dict | None = None) -> str:
    return run_item_job(notebook_id, 'RunNotebook', parameters)


def run_pipeline(pipeline_id: str, parameters: dict | None = None) -> str:
    return run_item_job(pipeline_id, 'Pipeline', parameters)


def job_status(job_url: str) -> tuple[str, str | None]:
    """(status, failure reason). Status: NotStarted, InProgress, Completed,
    Failed, Cancelled or Deduped."""
    resp = requests.get(job_url, headers=_headers(), timeout=30)
    resp.raise_for_status()
    body = resp.json()
    reason = body.get('failureReason')
    if isinstance(reason, dict):
        reason = reason.get('message') or json.dumps(reason)
    return body.get('status', 'Unknown'), reason
