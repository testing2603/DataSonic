"""Schema definitions for structured claims extraction tables.

Each claim sub-classification has its own table with fixed columns.
The JSON from the extraction API is mapped through CLAIMS_RAW_TO_DB before insert.
Requirement levels per table determine which fields are mandatory.

Requirement levels:
  'required'      - must be present, insert fails validation without it
  'recommended'   - should be present, flagged if missing but insert proceeds
  'conditional'   - required only under certain conditions
  'optional'      - nice to have, no flag if missing
"""

# ---- Raw JSON key → DB column name mapping -----------------------------------

CLAIMS_RAW_TO_DB: dict[str, str] = {
    'CUST_ID':                   'customer_id',
    'CLAIM_NO':                  'claim_number',
    'POLICY_NO':                 'policy_number',
    'EXECUTIVE':                 'executive',
    'DATE_OF_INTIMATION':        'notification_date',
    'DATE_OF_LOSS':              'loss_date',
    'TXN_DATE':                  'last_transaction_date',
    'LOSS_LOCATION':             'loss_location',
    'CAUSE_OF_LOSS':             'cause_of_loss',
    'CLAIM_TYPE':                'claim_type',
    'CLAIM_STATUS':              'claim_status',
    'INCURRED_AMOUNT':           'incurred_amount',
    'PAID_AMOUNT':               'paid_amount',
    'SETTLEMENT_AMOUNT':         'settlement_amount',
    'SALVAGE_AMOUNT':            'salvage_amount',
    'GENERAL_AVERAGE_DECLARED':  'general_average_declared',
    'VESSEL_TYPE':               'vessel_type',
    'IMO_NUMBER':                'imo_number',
    'UMR':                       'umr',
    'CLAIM_CURRENCY':            'claim_currency',
    'COMMENT':                   'comment',
}

EXCLUDED_RAW_FIELDS = {'CURRENCY', 'POLICY_START', 'POLICY_END', 'POLICYTYPE',
                       'PRODUCT', 'SUM_INSURED', 'BROKER_ID', 'BROKER_NAME',
                       'FACILITY_ID', 'FACILITY_NAME'}


# ---- Column definitions per table --------------------------------------------

_COMMON_META = [
    ('id',              'INTEGER PRIMARY KEY AUTOINCREMENT', 'required'),
    ('doc_id',          'TEXT NOT NULL',                     'required'),
    ('created_at',      'TEXT NOT NULL',                     'required'),
    ('updated_at',      'TEXT NOT NULL',                     'required'),
]

CLAIMS_NEW_COLUMNS: list[tuple[str, str, str]] = [
    *_COMMON_META,
    ('customer_id',             'TEXT',          'required'),
    ('claim_number',            'TEXT',          'required'),
    ('policy_number',           'TEXT',          'required'),
    ('executive',               'TEXT',          'optional'),
    ('notification_date',       'DATE',          'required'),
    ('loss_date',               'DATE',          'required'),
    ('last_transaction_date',   'DATE',          'recommended'),
    ('loss_location',           'TEXT',          'required'),
    ('cause_of_loss',           'TEXT',          'required'),
    ('claim_type',              'TEXT',          'required'),
    ('claim_status',            'TEXT',          'required'),
    ('incurred_amount',         'REAL',          'required'),
    ('paid_amount',             'REAL',          'required'),
    ('settlement_amount',       'REAL',          'conditional'),
    ('salvage_amount',          'REAL',          'conditional'),
    ('general_average_declared','TEXT',          'conditional'),
    ('vessel_type',             'TEXT',          'conditional'),
    ('imo_number',              'TEXT',          'conditional'),
    ('umr',                     'TEXT',          'conditional'),
    ('claim_currency',          'TEXT',          'required'),
    ('comment',                 'TEXT',          'conditional'),
    ('image_ids',               'TEXT',          'optional'),
]

CLAIMS_CLOSURE_COLUMNS: list[tuple[str, str, str]] = [
    *_COMMON_META,
    ('claim_number',            'TEXT',          'required'),
    ('policy_number',           'TEXT',          'required'),
    ('customer_id',             'TEXT',          'recommended'),
    ('executive',               'TEXT',          'optional'),
    ('last_transaction_date',   'DATE',          'required'),
    ('claim_status',            'TEXT',          'required'),
    ('incurred_amount',         'REAL',          'required'),
    ('paid_amount',             'REAL',          'required'),
    ('settlement_amount',       'REAL',          'conditional'),
    ('salvage_amount',          'REAL',          'conditional'),
    ('general_average_declared','TEXT',          'conditional'),
    ('claim_currency',          'TEXT',          'required'),
    ('umr',                     'TEXT',          'conditional'),
    ('comment',                 'TEXT',          'required'),
    ('image_ids',               'TEXT',          'optional'),
]

CLAIMS_UPDATE_COLUMNS: list[tuple[str, str, str]] = [
    *_COMMON_META,
    ('claim_number',            'TEXT',          'required'),
    ('policy_number',           'TEXT',          'required'),
    ('customer_id',             'TEXT',          'recommended'),
    ('executive',               'TEXT',          'optional'),
    ('last_transaction_date',   'DATE',          'required'),
    ('notification_date',       'DATE',          'conditional'),
    ('loss_date',               'DATE',          'conditional'),
    ('loss_location',           'TEXT',          'conditional'),
    ('cause_of_loss',           'TEXT',          'conditional'),
    ('claim_type',              'TEXT',          'conditional'),
    ('claim_status',            'TEXT',          'conditional'),
    ('incurred_amount',         'REAL',          'conditional'),
    ('paid_amount',             'REAL',          'conditional'),
    ('settlement_amount',       'REAL',          'conditional'),
    ('salvage_amount',          'REAL',          'conditional'),
    ('general_average_declared','TEXT',          'conditional'),
    ('vessel_type',             'TEXT',          'conditional'),
    ('imo_number',              'TEXT',          'conditional'),
    ('claim_currency',          'TEXT',          'conditional'),
    ('umr',                     'TEXT',          'conditional'),
    ('comment',                 'TEXT',          'required'),
    ('image_ids',               'TEXT',          'optional'),
]

CLAIMS_REOPEN_COLUMNS: list[tuple[str, str, str]] = [
    *_COMMON_META,
    ('claim_number',            'TEXT',          'required'),
    ('policy_number',           'TEXT',          'required'),
    ('customer_id',             'TEXT',          'recommended'),
    ('executive',               'TEXT',          'optional'),
    ('last_transaction_date',   'DATE',          'required'),
    ('claim_status',            'TEXT',          'required'),
    ('incurred_amount',         'REAL',          'required'),
    ('paid_amount',             'REAL',          'required'),
    ('settlement_amount',       'REAL',          'conditional'),
    ('salvage_amount',          'REAL',          'conditional'),
    ('general_average_declared','TEXT',          'conditional'),
    ('claim_currency',          'TEXT',          'required'),
    ('umr',                     'TEXT',          'conditional'),
    ('comment',                 'TEXT',          'required'),
    ('image_ids',               'TEXT',          'optional'),
]


# ---- Lookup: subcategory → (table_name, columns) ----------------------------

SUBCATEGORY_TABLES: dict[str, tuple[str, list[tuple[str, str, str]]]] = {
    'New Claim':       ('claims_new',       CLAIMS_NEW_COLUMNS),
    'Claim Closure':   ('claims_closure',   CLAIMS_CLOSURE_COLUMNS),
    'Claim Update':    ('claims_update',    CLAIMS_UPDATE_COLUMNS),
    'Claim Reopen':    ('claims_reopen',    CLAIMS_REOPEN_COLUMNS),
}

# Aliases so older names still resolve
_SUBCATEGORY_ALIASES: dict[str, str] = {
    'claims new': 'new claim',
    'claims closure': 'claim closure',
    'claims update': 'claim update',
    'claims reopen': 'claim reopen',
}


def get_table_for(subcategory: str) -> tuple[str, list[tuple[str, str, str]]]:
    """Return (table_name, columns) for a subcategory. Raises KeyError if unknown."""
    if subcategory in SUBCATEGORY_TABLES:
        return SUBCATEGORY_TABLES[subcategory]
    lower = subcategory.strip().lower()
    # Check aliases first
    resolved = _SUBCATEGORY_ALIASES.get(lower, lower)
    for key, val in SUBCATEGORY_TABLES.items():
        if key.lower() == resolved:
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
