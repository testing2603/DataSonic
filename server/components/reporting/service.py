"""Reporting service — orchestrates the report generation pipeline.

Pipeline steps:
  1. fetch_gold_schemas  — query INFORMATION_SCHEMA for the LOB's gold tables
  2. call_foundry        — send prompt + schema context to Claude on Foundry
  3. assemble_pbip       — write Claude's PBIR JSON into a PBIP folder
  4. deploy_to_fabric    — push the PBIP to the Fabric workspace via REST API
  5. get_report_url      — return the live Power BI report URL

Each step is a standalone function so they can be tested and wired
incrementally as the Foundry endpoint and gold tables become available.
"""

import json
import os
import tempfile
import uuid

import config
from core import fabric_sql

SUPPORTED_LOBS = {'marine', 'automobile', 'aviation', 'property'}

# Maps LOB → gold table name patterns. When gold tables exist in the
# lakehouse these should match their actual names. Update as tables land.
LOB_TABLES: dict[str, list[str]] = {
    'marine': ['gold_marine_policy_summary', 'gold_marine_claims'],
    'automobile': ['gold_auto_policy_summary', 'gold_auto_claims'],
    'aviation': ['gold_aviation_policy_summary', 'gold_aviation_claims'],
    'property': ['gold_property_policy_summary', 'gold_property_claims'],
}


class ReportError(Exception):
    """Any failure in the generation pipeline surfaced to the caller."""


# ── Step 1: fetch gold table schemas ─────────────────────────────────

def fetch_gold_schemas(lob: str) -> list[dict]:
    """Column metadata for every gold table belonging to `lob`.

    Returns a list of { table, columns: [{ name, type, nullable }] }.
    Falls back to an empty list if the tables don't exist yet.
    """
    prefix = config.GOLD_TABLE_PREFIX
    tables = LOB_TABLES.get(lob, [])
    if not tables:
        tables = _discover_tables(prefix + lob)

    schemas: list[dict] = []
    for table in tables:
        try:
            rows = fabric_sql.run_query(
                "SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE "
                "FROM INFORMATION_SCHEMA.COLUMNS "
                "WHERE TABLE_NAME = ? "
                "ORDER BY ORDINAL_POSITION",
                [table],
            )
            if rows:
                schemas.append({
                    'table': table,
                    'columns': [
                        {'name': r['COLUMN_NAME'], 'type': r['DATA_TYPE'], 'nullable': r['IS_NULLABLE'] == 'YES'}
                        for r in rows
                    ],
                })
        except Exception:
            pass
    return schemas


def _discover_tables(prefix: str) -> list[str]:
    """Auto-discover gold tables whose name starts with `prefix`."""
    try:
        rows = fabric_sql.run_query(
            "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES "
            "WHERE TABLE_NAME LIKE ? ORDER BY TABLE_NAME",
            [prefix + '%'],
        )
        return [r['TABLE_NAME'] for r in rows]
    except Exception:
        return []


def _fetch_sample_rows(table: str, limit: int = 5) -> list[dict]:
    """A few sample rows so Claude understands the data shape."""
    try:
        return fabric_sql.run_query(f"SELECT TOP {limit} * FROM [{table}]")
    except Exception:
        return []


# ── Step 2: call Claude on Foundry ───────────────────────────────────

SYSTEM_PROMPT = """\
You are a Power BI report generator. Given a user's request and the schema
of their gold data tables, you produce PBIR-format JSON files that define
a Power BI report.

Output a single JSON object with this structure:
{
  "reportName": "...",
  "pages": [
    {
      "name": "page_id",
      "displayName": "Page Title",
      "visuals": [
        {
          "name": "visual_id",
          "type": "barChart | lineChart | kpiCard | table | ...",
          "title": "Visual Title",
          "dataColumns": ["TableName.ColumnName", ...],
          "config": { ... visual-specific PBIR config ... }
        }
      ]
    }
  ],
  "semanticModel": {
    "tables": [
      {
        "name": "TableName",
        "source": "SELECT ... FROM [gold_table_name]",
        "columns": [{ "name": "...", "type": "..." }]
      }
    ]
  }
}

Rules:
- Only reference columns that exist in the provided schemas
- Use descriptive visual titles
- Choose appropriate chart types for the data being shown
- KPI cards should have a value, optional delta, and a title
- Return ONLY the JSON, no markdown fences or explanation
"""


def call_foundry(prompt: str, schemas: list[dict], sample_data: dict[str, list[dict]] | None = None) -> dict:
    """Send the prompt + schema context to Claude on Foundry.

    Returns the parsed PBIR JSON from Claude's response.
    Raises ReportError if Foundry is unreachable or returns invalid JSON.
    """
    if not config.FOUNDRY_ENDPOINT or not config.FOUNDRY_API_KEY:
        raise ReportError(
            'Foundry is not configured. Set FOUNDRY_ENDPOINT and FOUNDRY_API_KEY in .env'
        )

    schema_text = json.dumps(schemas, indent=2)
    user_message = f"## Gold Table Schemas\n\n{schema_text}\n"
    if sample_data:
        user_message += f"\n## Sample Data\n\n{json.dumps(sample_data, indent=2, default=str)}\n"
    user_message += f"\n## User Request\n\n{prompt}"

    import requests
    try:
        resp = requests.post(
            config.FOUNDRY_ENDPOINT,
            headers={
                'Content-Type': 'application/json',
                'api-key': config.FOUNDRY_API_KEY,
            },
            json={
                'model': config.FOUNDRY_MODEL,
                'max_tokens': 8192,
                'messages': [
                    {'role': 'system', 'content': SYSTEM_PROMPT},
                    {'role': 'user', 'content': user_message},
                ],
            },
            timeout=120,
        )
        resp.raise_for_status()
    except requests.RequestException as exc:
        raise ReportError(f'Foundry request failed: {exc}')

    try:
        body = resp.json()
        content = body['choices'][0]['message']['content']
        content = content.strip()
        if content.startswith('```'):
            content = content.split('\n', 1)[1].rsplit('```', 1)[0].strip()
        return json.loads(content)
    except (KeyError, IndexError, json.JSONDecodeError) as exc:
        raise ReportError(f'Could not parse Foundry response: {exc}')


# ── Step 3: assemble PBIP folder ────────────────────────────────────

def assemble_pbip(report_def: dict, output_dir: str) -> str:
    """Write the PBIR JSON from Claude into a PBIP folder structure.

    Returns the path to the root .pbip file.
    """
    name = report_def.get('reportName', 'GeneratedReport').replace(' ', '')
    root = os.path.join(output_dir, name)
    report_dir = os.path.join(root, f'{name}.Report')
    model_dir = os.path.join(root, f'{name}.SemanticModel', 'definition')

    os.makedirs(report_dir, exist_ok=True)
    os.makedirs(model_dir, exist_ok=True)

    # .pbip project file
    _write_json(os.path.join(root, f'{name}.pbip'), {
        'version': '1.0',
        'artifacts': [
            {'report': {'path': f'{name}.Report'}},
            {'semanticModel': {'path': f'{name}.SemanticModel'}},
        ],
    })

    # Report definition.pbir
    _write_json(os.path.join(report_dir, 'definition.pbir'), {
        'version': '4.0',
        'datasetReference': {
            'byPath': {'path': f'../{name}.SemanticModel'},
        },
    })

    # Pages and visuals
    pages = report_def.get('pages', [])
    for page in pages:
        page_dir = os.path.join(report_dir, 'pages', page.get('name', 'page1'))
        os.makedirs(page_dir, exist_ok=True)
        _write_json(os.path.join(page_dir, 'page.json'), {
            'name': page.get('name'),
            'displayName': page.get('displayName', 'Page 1'),
        })
        for visual in page.get('visuals', []):
            vis_dir = os.path.join(page_dir, 'visuals', visual.get('name', str(uuid.uuid4())[:8]))
            os.makedirs(vis_dir, exist_ok=True)
            _write_json(os.path.join(vis_dir, 'visual.json'), visual)

    # Semantic model
    model = report_def.get('semanticModel', {})
    for table in model.get('tables', []):
        tmdl_path = os.path.join(model_dir, 'tables', f'{table["name"]}.tmdl')
        os.makedirs(os.path.dirname(tmdl_path), exist_ok=True)
        tmdl = _build_tmdl(table)
        with open(tmdl_path, 'w', encoding='utf-8') as f:
            f.write(tmdl)

    _write_json(os.path.join(model_dir, 'model.tmdl'), {
        'tables': [t['name'] for t in model.get('tables', [])],
    })

    return os.path.join(root, f'{name}.pbip')


def _write_json(path: str, data: dict) -> None:
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)


def _build_tmdl(table: dict) -> str:
    """Build a minimal TMDL definition for a semantic model table."""
    lines = [f'table {table["name"]}']
    source = table.get('source', '')
    if source:
        lines.append(f'  source = Fabric "{source}"')
    for col in table.get('columns', []):
        lines.append(f'  column {col["name"]} : {col.get("type", "string")}')
    return '\n'.join(lines) + '\n'


# ── Step 4: deploy to Fabric ────────────────────────────────────────

def deploy_to_fabric(pbip_path: str, workspace_id: str) -> str:
    """Deploy the PBIP folder to a Fabric workspace.

    Uses the Fabric REST API to create a report item.
    Returns the report item ID.

    TODO: implement once Fabric workspace write access is confirmed.
    Currently returns a placeholder.
    """
    raise ReportError(
        'Fabric deployment is not yet implemented. '
        'Set up POWERBI_WORKSPACE_ID and ensure the signed-in user has Contributor access.'
    )


# ── Step 5: get report URL ──────────────────────────────────────────

def get_report_url(workspace_id: str, report_id: str) -> str:
    """Build the Power BI report URL from workspace and report IDs."""
    return f'https://app.powerbi.com/groups/{workspace_id}/reports/{report_id}'


# ── Orchestrator ─────────────────────────────────────────────────────

def generate_report(lob: str, prompt: str) -> dict:
    """Full pipeline: schema → Foundry → PBIP → deploy → URL."""

    # Step 1: fetch schemas
    schemas = fetch_gold_schemas(lob)
    if not schemas:
        raise ReportError(
            f'No gold tables found for LOB "{lob}". '
            f'Expected tables matching: {", ".join(LOB_TABLES.get(lob, []))}'
        )

    # Fetch a few sample rows for context
    sample_data = {}
    for s in schemas:
        rows = _fetch_sample_rows(s['table'])
        if rows:
            sample_data[s['table']] = rows

    # Step 2: call Claude on Foundry
    report_def = call_foundry(prompt, schemas, sample_data or None)

    # Step 3: assemble PBIP
    output_dir = tempfile.mkdtemp(prefix='datasonic_report_')
    pbip_path = assemble_pbip(report_def, output_dir)

    # Step 4: deploy to Fabric
    workspace_id = config.POWERBI_WORKSPACE_ID
    if not workspace_id:
        raise ReportError('POWERBI_WORKSPACE_ID is not configured in .env')
    report_id = deploy_to_fabric(pbip_path, workspace_id)

    # Step 5: return URL
    report_url = get_report_url(workspace_id, report_id)
    return {'status': 'ready', 'reportUrl': report_url}
