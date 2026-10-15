"""All backend settings, read once from the project's .env.
 
Every other module imports from here instead of calling os.environ itself, so
the full list of settings lives in one place (and in .env.example).
"""
 
import os
 
from dotenv import load_dotenv
 
SERVER_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(SERVER_DIR, '..', '.env'))
 
 
def _str(name: str, default: str = '') -> str:
    return os.environ.get(name, default).strip()
 
 
def _int(name: str, default: int) -> int:
    return int(_str(name, str(default)))
 
 
def _bool(name: str, default: bool = False) -> bool:
    return _str(name, 'yes' if default else 'no').lower() in ('1', 'true', 'yes', 'on')
 
 
# ---------- Local API server ----------
API_PORT = _int('API_PORT', 3001)
# Interim local stores (SQLite) until the app's SQL Server is connected.
LOCAL_DATA_DIR = os.path.join(SERVER_DIR, 'local_data')
 
# ---------- Microsoft sign-in (Entra ID) ----------
# Microsoft's public client ID (same one `az login` uses). Works cross-tenant
# for delegated sign-in without registering your own app.
AZURE_CLI_CLIENT_ID = '04b07795-8ddb-461a-bbee-02f9e1bf7b46'
AZURE_CLIENT_ID = _str('AZURE_CLIENT_ID') or AZURE_CLI_CLIENT_ID
AZURE_TENANT_ID = _str('AZURE_TENANT_ID') or 'organizations'
AUTHORITY = f'https://login.microsoftonline.com/{AZURE_TENANT_ID}'
 
# ---------- Fabric: lakehouse SQL analytics endpoint (read-only) ----------
FABRIC_SERVER = _str('FABRIC_SERVER')
FABRIC_DATABASE = _str('FABRIC_DATABASE') or 'Bronze_Data'
 
# ---------- Fabric: REST API (notebook / pipeline runs) ----------
FABRIC_WORKSPACE_ID = _str('FABRIC_WORKSPACE_ID')
 
# ---------- App SQL Server (the backend's own read/write database) ----------
# Where the backend dumps its data (the "SSMS" database in the architecture
# doc). Optional until it exists: leave APP_DB_SERVER empty and components
# fall back to their interim local stores.
APP_DB_SERVER = _str('APP_DB_SERVER')          # host or host\instance
APP_DB_PORT = _int('APP_DB_PORT', 1433)
APP_DB_NAME = _str('APP_DB_NAME')
# 'sql' (APP_DB_USER/APP_DB_PASSWORD), 'windows' (the signed-in Windows user)
# or 'entra' (the same Microsoft sign-in as Fabric; Azure SQL only).
APP_DB_AUTH = _str('APP_DB_AUTH') or 'sql'
APP_DB_USER = _str('APP_DB_USER')
APP_DB_PASSWORD = os.environ.get('APP_DB_PASSWORD', '')
# yes for servers with a self-signed certificate (common on-premises).
APP_DB_TRUST_SERVER_CERTIFICATE = _bool('APP_DB_TRUST_SERVER_CERTIFICATE')
APP_DB_CONFIGURED = bool(APP_DB_SERVER and APP_DB_NAME)
 
# ---------- Component: reporting (Power BI generation) ----------
# Azure AI Foundry endpoint hosting the Claude model.
FOUNDRY_ENDPOINT = _str('FOUNDRY_ENDPOINT')
FOUNDRY_API_KEY = _str('FOUNDRY_API_KEY')
FOUNDRY_MODEL = _str('FOUNDRY_MODEL') or 'claude-sonnet-4-20250514'
# Fabric workspace where generated Power BI reports are created.
POWERBI_WORKSPACE_ID = _str('POWERBI_WORKSPACE_ID') or FABRIC_WORKSPACE_ID
# Gold table prefix per LOB (comma-separated overrides, or auto-discovered).
GOLD_TABLE_PREFIX = _str('GOLD_TABLE_PREFIX') or 'gold_'
 
# ---------- Component: schema drift ----------
# Notebook that writes steward decisions back to the lakehouse.
FABRIC_DECISION_NOTEBOOK_ID = _str('FABRIC_DECISION_NOTEBOOK_ID')
# Seconds after the latest click before a run starts (0 = immediately).
DECISION_SYNC_DELAY_SECONDS = _int('DECISION_SYNC_DELAY_SECONDS', 0)
 
# ---------- Component: CDR Schema Dictionary (Schema Drift page) ----------
CDR_DICTIONARY_DATABASE = _str('CDR_DICTIONARY_DATABASE') or 'CDR_Airtable_Schema'
CDR_DICTIONARY_TABLE = _str('CDR_DICTIONARY_TABLE') or 'dbo.cdr_schema_dictionary'
CDR_DICTIONARY_MAX_ROWS = _int('CDR_DICTIONARY_MAX_ROWS', 1000)

# ---------- Component: MDM (Stewardship Review > MDM) ----------
# Lakehouse on the same SQL endpoint holding the MDM review table, and the
# table as <schema>.<table> (the lakehouse's mdm folder is the schema).
MDM_DATABASE = _str('MDM_DATABASE') or _str('MDM_DB') or 'LLM_MDM_LH'
MDM_TABLE = _str('MDM_TABLE') or 'mdm.mdm_preview_ui_table'
MDM_MASTER_TABLE = _str('MDM_MASTER_TABLE') or _str('MDM_MASTER_TB') or 'mdm.mdm_preview_master'
 
# Maximum rows returned to the MDM list
MDM_MAX_ROWS = _int('MDM_MAX_ROWS', 1000)
 
# ---------- Component: data extraction / ingestion ----------
EXTRACTION_API_URL = _str('EXTRACTION_API_URL')
EXTRACTION_API_KEY = _str('EXTRACTION_API_KEY')
# Max seconds to wait for the extraction API to respond (large PDFs are slow).
EXTRACTION_API_TIMEOUT = _int('EXTRACTION_API_TIMEOUT', 180)
# Local directory for raw uploads before extraction.
UPLOAD_TEMP_DIR = _str('UPLOAD_TEMP_DIR') or os.path.join(LOCAL_DATA_DIR, 'uploads')
# Notebook that runs the ingestion pipeline after extraction is complete.
FABRIC_INGESTION_NOTEBOOK_ID = _str('FABRIC_INGESTION_NOTEBOOK_ID')
# Max upload size in bytes (default 50 MB).
MAX_UPLOAD_BYTES = _int('MAX_UPLOAD_BYTES', 50 * 1024 * 1024)
 
# ---------- Azure Blob Storage (extraction CSV outputs) ----------
AZURE_STORAGE_CONNECTION_STRING = _str('AZURE_STORAGE_CONNECTION_STRING')
AZURE_BLOB_CONTAINER = _str('AZURE_BLOB_CONTAINER') or 'marine'
 
# ---------- Component: MDF (Metadata-Driven Framework) ----------
MDF_DATABASE = _str('MDF_DATABASE') or _str('MDF_DB') or 'Datasonic_4_Metadata_Warehouse'
MDF_TABLE = _str('MDF_TABLE') or 'METADATASTORE.OBJECT_CONFIG'
MDF_SOURCE_TABLE = _str('MDF_SOURCE_TABLE') or 'METADATASTORE.SOURCE_CONFIG'
MDF_AUDIT_TABLE = _str('MDF_AUDIT_TABLE') or 'METADATASTORE.PIPELINE_AUDIT_LOG'
MDF_PIPELINE_CONFIG_TABLE = _str('MDF_PIPELINE_CONFIG_TABLE') or 'METADATASTORE.PIPELINE_CONFIG'
MDF_PIPELINE_ID = _str('MDF_PIPELINE_ID')
MDF_MAX_ROWS = _int('MDF_MAX_ROWS', 1000)

# ---------- Component: AI Data Assistant (Fabric Data Agent) ----------
DATA_AGENT_URL = _str('DATA_AGENT_URL')
 
 