"""Schema definitions for structured extraction tables.

Each policy sub-classification has its own table with fixed columns.
The JSON from the extraction API is mapped through RAW_TO_DB before insert.
Requirement levels per table determine which fields are mandatory.

Requirement levels:
  'required'      - must be present, insert fails validation without it
  'recommended'   - should be present, flagged if missing but insert proceeds
  'conditional'   - required only under certain conditions (e.g. vessel risk)
  'optional'      - nice to have, no flag if missing
"""

# ---- Raw JSON key → DB column name mapping -----------------------------------
# Applied before insert so the extraction API's naming doesn't leak into the DB.

RAW_TO_DB: dict[str, str] = {
    'CUST_ID':           'customer_id',
    'POLICY_NO':         'policy_number',
    'EXECUTIVE':         'executive',
    'UMR':               'umr',
    'POL_EFF_DATE':      'insurance_period_start',
    'POL_EXPIRY_DATE':   'insurance_period_end',
    'POL_ISSUE_DATE':    'policy_issue_date',
    'STATUS':            'policy_status',
    'POLICYTYPE':        'contract_type',
    'PRODUCT':           'product',
    'SUM_INSURED':       'limit_amount',
    'PREMIUM':           'premium_amount',
    'VESSEL_TYPE':       'vessel_type',
    'VESSEL_NAME':       'vessel_name',
    'VESSEL_CLASS':      'vessel_class',
    'IMO_NUMBER':        'imo_number',
    'FLAG_STATE':        'flag_state_country_code',
    'YEAR_BUILT':        'year_built',
    'GROSS_TONNAGE':     'gross_tonnage',
    'CARGO_COMMODITY':   'cargo_commodity',
    'P_AND_I_CLUB':      'p_and_i_club',
    'CHARTER_TYPE':      'charter_type',
    'WAR_RISK_INCLUDED': 'war_risk_included',
    'OWNER_NAME':        'owner_name',
    'SANCTIONS_CHECK':   'sanctions_check_status',
    'BROKER_ID':         'placing_broker_id',
    'BROKER_NAME':       'placing_broker_name',
    'FACILITY_ID':       'facility_id',
    'FACILITY_NAME':     'facility_name',
}

# Fields in the raw JSON that should NOT be stored (red in schema docs).
EXCLUDED_RAW_FIELDS = {'CURRENCY'}


# ---- Column definitions per table --------------------------------------------
# Each entry: (column_name, sql_type, requirement_level)

_COMMON_META = [
    ('id',              'INTEGER PRIMARY KEY AUTOINCREMENT', 'required'),
    ('doc_id',          'TEXT NOT NULL',                     'required'),
    ('created_at',      'TEXT NOT NULL',                     'required'),
    ('updated_at',      'TEXT NOT NULL',                     'required'),
]

POLICY_NEW_BUSINESS_COLUMNS: list[tuple[str, str, str]] = [
    *_COMMON_META,
    ('customer_id',             'TEXT',          'required'),
    ('policy_number',           'TEXT',          'required'),
    ('executive',               'TEXT',          'optional'),
    ('umr',                     'TEXT',          'required'),
    ('insurance_period_start',  'DATE',          'required'),
    ('insurance_period_end',    'DATE',          'required'),
    ('policy_issue_date',       'DATE',          'recommended'),
    ('policy_status',           'TEXT',          'required'),
    ('contract_type',           'TEXT',          'required'),
    ('product',                 'TEXT',          'required'),
    ('limit_amount',            'REAL',          'required'),
    ('premium_amount',          'REAL',          'required'),
    ('vessel_type',             'TEXT',          'conditional'),
    ('vessel_name',             'TEXT',          'conditional'),
    ('vessel_class',            'TEXT',          'recommended'),
    ('imo_number',              'TEXT',          'conditional'),
    ('flag_state_country_code', 'TEXT',          'conditional'),
    ('year_built',              'INTEGER',       'recommended'),
    ('gross_tonnage',           'REAL',          'recommended'),
    ('cargo_commodity',         'TEXT',          'conditional'),
    ('p_and_i_club',            'TEXT',          'conditional'),
    ('charter_type',            'TEXT',          'conditional'),
    ('war_risk_included',       'INTEGER',       'required'),
    ('owner_name',              'TEXT',          'recommended'),
    ('sanctions_check_status',  'TEXT',          'required'),
    ('placing_broker_id',       'TEXT',          'required'),
    ('placing_broker_name',     'TEXT',          'required'),
    ('facility_id',             'TEXT',          'optional'),
    ('facility_name',           'TEXT',          'optional'),
    ('policyholder_name',       'TEXT',          'required'),
    ('policyholder_country_code', 'TEXT',        'required'),
    ('image_ids',               'TEXT',          'optional'),
]

POLICY_RENEWAL_COLUMNS: list[tuple[str, str, str]] = [
    *_COMMON_META,
    ('customer_id',             'TEXT',          'required'),
    ('policy_number',           'TEXT',          'required'),
    ('executive',               'TEXT',          'optional'),
    ('umr',                     'TEXT',          'required'),
    ('insurance_period_start',  'DATE',          'required'),
    ('insurance_period_end',    'DATE',          'required'),
    ('policy_issue_date',       'DATE',          'recommended'),
    ('policy_status',           'TEXT',          'required'),
    ('contract_type',           'TEXT',          'required'),
    ('product',                 'TEXT',          'required'),
    ('limit_amount',            'REAL',          'required'),
    ('premium_amount',          'REAL',          'required'),
    ('vessel_type',             'TEXT',          'conditional'),
    ('vessel_name',             'TEXT',          'conditional'),
    ('vessel_class',            'TEXT',          'recommended'),
    ('imo_number',              'TEXT',          'conditional'),
    ('flag_state_country_code', 'TEXT',          'conditional'),
    ('year_built',              'INTEGER',       'recommended'),
    ('gross_tonnage',           'REAL',          'recommended'),
    ('cargo_commodity',         'TEXT',          'conditional'),
    ('p_and_i_club',            'TEXT',          'conditional'),
    ('charter_type',            'TEXT',          'conditional'),
    ('war_risk_included',       'INTEGER',       'required'),
    ('owner_name',              'TEXT',          'recommended'),
    ('sanctions_check_status',  'TEXT',          'required'),
    ('placing_broker_id',       'TEXT',          'required'),
    ('placing_broker_name',     'TEXT',          'required'),
    ('facility_id',             'TEXT',          'optional'),
    ('facility_name',           'TEXT',          'optional'),
    ('policyholder_name',       'TEXT',          'required'),
    ('policyholder_country_code', 'TEXT',        'required'),
    ('image_ids',               'TEXT',          'optional'),
]

POLICY_CANCELLATION_COLUMNS: list[tuple[str, str, str]] = [
    *_COMMON_META,
    ('customer_id',             'TEXT',          'required'),
    ('policy_number',           'TEXT',          'required'),
    ('executive',               'TEXT',          'optional'),
    ('umr',                     'TEXT',          'required'),
    ('insurance_period_start',  'DATE',          'recommended'),
    ('insurance_period_end',    'DATE',          'recommended'),
    ('policy_issue_date',       'DATE',          'optional'),
    ('policy_status',           'TEXT',          'required'),
    ('contract_type',           'TEXT',          'recommended'),
    ('product',                 'TEXT',          'recommended'),
    ('premium_amount',          'REAL',          'conditional'),
    ('placing_broker_id',       'TEXT',          'recommended'),
    ('placing_broker_name',     'TEXT',          'recommended'),
    ('facility_id',             'TEXT',          'optional'),
    ('facility_name',           'TEXT',          'optional'),
    ('sanctions_check_status',  'TEXT',          'conditional'),
    ('policyholder_name',       'TEXT',          'required'),
    ('policyholder_country_code', 'TEXT',        'required'),
    ('image_ids',               'TEXT',          'optional'),
]

POLICY_MTA_COLUMNS: list[tuple[str, str, str]] = [
    *_COMMON_META,
    ('customer_id',             'TEXT',          'required'),
    ('policy_number',           'TEXT',          'required'),
    ('executive',               'TEXT',          'optional'),
    ('umr',                     'TEXT',          'conditional'),
    ('insurance_period_start',  'DATE',          'conditional'),
    ('insurance_period_end',    'DATE',          'conditional'),
    ('policy_issue_date',       'DATE',          'recommended'),
    ('policy_status',           'TEXT',          'conditional'),
    ('contract_type',           'TEXT',          'conditional'),
    ('product',                 'TEXT',          'conditional'),
    ('limit_amount',            'REAL',          'conditional'),
    ('premium_amount',          'REAL',          'conditional'),
    ('vessel_type',             'TEXT',          'conditional'),
    ('vessel_name',             'TEXT',          'conditional'),
    ('vessel_class',            'TEXT',          'conditional'),
    ('imo_number',              'TEXT',          'conditional'),
    ('flag_state_country_code', 'TEXT',          'conditional'),
    ('year_built',              'INTEGER',       'conditional'),
    ('gross_tonnage',           'REAL',          'conditional'),
    ('cargo_commodity',         'TEXT',          'conditional'),
    ('p_and_i_club',            'TEXT',          'conditional'),
    ('charter_type',            'TEXT',          'conditional'),
    ('war_risk_included',       'INTEGER',       'conditional'),
    ('owner_name',              'TEXT',          'conditional'),
    ('sanctions_check_status',  'TEXT',          'conditional'),
    ('placing_broker_id',       'TEXT',          'conditional'),
    ('placing_broker_name',     'TEXT',          'conditional'),
    ('facility_id',             'TEXT',          'conditional'),
    ('facility_name',           'TEXT',          'conditional'),
    ('policyholder_name',       'TEXT',          'required'),
    ('policyholder_country_code', 'TEXT',        'required'),
    ('image_ids',               'TEXT',          'optional'),
]


# ---- Lookup: subcategory → (table_name, columns) ----------------------------

SUBCATEGORY_TABLES: dict[str, tuple[str, list[tuple[str, str, str]]]] = {
    'New Business':  ('policy_new_business',   POLICY_NEW_BUSINESS_COLUMNS),
    'Renewal':       ('policy_renewal',        POLICY_RENEWAL_COLUMNS),
    'Policy Cancellation':  ('policy_cancellation',   POLICY_CANCELLATION_COLUMNS),
    'MTA':           ('policy_mta',            POLICY_MTA_COLUMNS),
}


def get_table_for(subcategory: str) -> tuple[str, list[tuple[str, str, str]]]:
    """Return (table_name, columns) for a subcategory. Raises KeyError if unknown."""
    if subcategory in SUBCATEGORY_TABLES:
        return SUBCATEGORY_TABLES[subcategory]
    # Case-insensitive fallback
    lower = subcategory.strip().lower()
    for key, val in SUBCATEGORY_TABLES.items():
        if key.lower() == lower:
            return val
    raise KeyError(subcategory)


def get_required_columns(subcategory: str) -> list[str]:
    """Return just the mandatory column names for a subcategory."""
    _, columns = get_table_for(subcategory)
    return [name for name, _, req in columns if req == 'required' and name not in ('id', 'doc_id', 'created_at', 'updated_at')]


def get_column_names(subcategory: str) -> list[str]:
    """Return all column names (excluding auto-generated ones) for a subcategory."""
    _, columns = get_table_for(subcategory)
    return [name for name, _, _ in columns if name != 'id']
