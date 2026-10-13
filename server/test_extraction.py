"""Test script: insert a sample JSON into the structured extraction tables.

Run from the server/ directory:
    python test_extraction.py

It will:
  1. Insert the sample JSON into the correct table (based on subcategory)
  2. Print the mapped row
  3. Show which mandatory fields are missing
  4. Simulate user filling those fields
  5. Print the updated row
  6. Show the DB file path so you can open it in a viewer
"""

import json
import os
import sys

# Make imports work from the server/ directory.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from components.ingestion import extraction_store as store
from core import local_db

# ---- Sample JSON (same as what the extraction API returns) -------------------

SAMPLE_JSON = {
    "files_processed": ["policy_192556.pdf"],
    "classification": {
        "category": "policy",
        "subcategory": "New Business",
        "lob": "MARINE",
    },
    "extracted_fields": {
        "CUST_ID": "2009",
        "EXECUTIVE": "MOHAMMED A",
        "POLICY_NO": "POL -00107",
        "UMR": "B0053A20L41036",
        "POL_EFF_DATE": "2026-11-07",
        "POL_EXPIRY_DATE": "2028-02-23",
        "POL_ISSUE_DATE": "2026-10-09",
        "STATUS": "Active",
        "CURRENCY": "USD",
        "POLICYTYPE": "Insurance",
        "PRODUCT": "Cargo",
        "SUM_INSURED": "46761848.54",
        "PREMIUM": "379045.07",
        "VESSEL_TYPE": "Container Ship",
        "VESSEL_NAME": "FV Net Runner",
        "VESSEL_CLASS": "Ultra Large",
        "IMO_NUMBER": "4942645",
        "FLAG_STATE": "DK",
        "YEAR_BUILT": "2009",
        "GROSS_TONNAGE": "134836.87",
        "CARGO_COMMODITY": "Steel",
        "P_AND_I_CLUB": "The Steamship Mutual",
        "CHARTER_TYPE": "Time Charter",
        "WAR_RISK_INCLUDED": False,
        "OWNER_NAME": "Alpha Maritime Ltd",
        "SANCTIONS_CHECK": "Clear",
        "BROKER_ID": "BRKGR9182",
        "BROKER_NAME": "Bolton, Daniel and Carlson Brokers",
        "FACILITY_ID": "FAC038",
        "FACILITY_NAME": "Starboard Shore Coverage Division",
    },
    "attachments": [],
}


def print_section(title: str) -> None:
    print(f'\n{"=" * 60}')
    print(f'  {title}')
    print(f'{"=" * 60}')


def print_row(row: dict) -> None:
    for col, val in row.items():
        marker = ''
        if val is None:
            marker = '  <-- NULL'
        print(f'  {col:30s} : {val}{marker}')


def main() -> None:
    print_section('STEP 1: Inserting sample JSON')
    print(f'  Subcategory : {SAMPLE_JSON["classification"]["subcategory"]}')
    print(f'  LOB         : {SAMPLE_JSON["classification"]["lob"]}')
    print(f'  File        : {SAMPLE_JSON["files_processed"][0]}')

    result = store.insert_from_json(SAMPLE_JSON)

    print_section(f'STEP 2: Row inserted into table "{result["table"]}"')
    print_row(result['row'])

    print_section('STEP 3: Missing mandatory fields')
    if result['missing_required']:
        for f in result['missing_required']:
            print(f'  [REQUIRED]    {f}')
    else:
        print('  None — all mandatory fields are present.')

    if result['missing_recommended']:
        for f in result['missing_recommended']:
            print(f'  [RECOMMENDED] {f}')

    # ---- Simulate user filling missing fields --------------------------------

    if result['missing_required']:
        print_section('STEP 4: Simulating user input for missing fields')

        user_input = {
            'policyholder_name': 'Alpha Maritime Holdings Ltd',
            'policyholder_country_code': 'GB',
        }

        filled = {k: v for k, v in user_input.items() if k in result['missing_required']}
        print(f'  User provides: {json.dumps(filled, indent=4)}')

        updated = store.update_fields(
            result['doc_id'],
            result['subcategory'],
            filled,
        )

        print_section('STEP 5: Updated row')
        print_row(updated)

        still_missing = [f for f in result['missing_required'] if updated.get(f) is None]
        if still_missing:
            print(f'\n  Still missing: {still_missing}')
        else:
            print('\n  All mandatory fields now filled.')

    # ---- Show DB path --------------------------------------------------------

    db_path = local_db.path('extraction')
    print_section('Done')
    print(f'  DB file: {db_path}')
    print(f'  Open it with DB Browser for SQLite, VS Code SQLite Viewer,')
    print(f'  or run: sqlite3 "{db_path}" "SELECT * FROM {result["table"]};"')


if __name__ == '__main__':
    main()
