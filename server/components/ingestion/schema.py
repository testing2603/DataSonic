"""Mandatory field definitions per document classification.

Each key is a classification (as returned by the extraction API's
`classification` field). The value is the list of field names that must
have a non-empty value before the document can proceed to the pipeline.

Update this dict when new LOBs or document types are onboarded.
"""

LOW_CONFIDENCE_THRESHOLD = 0.6

MANDATORY_FIELDS: dict[str, list[str]] = {
    'Policy': [
        'policy_number',
        'insured_name',
        'lob',
        'inception_date',
        'premium',
    ],
    'Claims': [
        'claim_number',
        'policy_number',
        'date_of_loss',
        'lob',
    ],
    'Endorsement': [
        'policy_number',
        'endorsement_number',
        'lob',
        'effective_date',
    ],
    'Bordereaux': [
        'policy_number',
        'lob',
        'reporting_period',
        'broker_name',
    ],
}


def get_required(classification: str | None) -> list[str]:
    if not classification:
        return []
    return MANDATORY_FIELDS.get(classification, [])


def validate(fields: dict, classification: str | None) -> tuple[list[str], list[str]]:
    """Return (missing_fields, low_confidence_fields) for the given extraction."""
    required = get_required(classification)
    missing = [f for f in required if not (fields.get(f) or {}).get('value')]
    low_confidence = [
        f for f, v in fields.items()
        if isinstance(v, dict) and 0 < (v.get('confidence') or 0) < LOW_CONFIDENCE_THRESHOLD
    ]
    return missing, low_confidence
