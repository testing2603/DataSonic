"""Microsoft sign-in via MSAL device-code flow.

On first use the terminal prints a URL + code: open the URL, enter the code,
sign in. Tokens are cached in memory and reused silently until they are close
to expiring (~1 hr), so you are prompted once per run of the server. Once
signed in for one scope, other scopes (e.g. the Fabric REST API) are obtained
silently from the same sign-in.
"""

import json
import sys
import threading

import msal

import config

SQL_SCOPES = ['https://database.windows.net/.default']
FABRIC_API_SCOPES = ['https://api.fabric.microsoft.com/.default']

# Created ONCE at import, not per call: MSAL's token cache lives on this
# object, and a fresh one per request would forget every sign-in.
_msal_app = msal.PublicClientApplication(config.AZURE_CLIENT_ID, authority=config.AUTHORITY)

# Flask serves requests concurrently; without this lock two requests arriving
# before the first sign-in finishes would each start their own device-code
# flow (two codes printed). The second call waits and then finds the token.
_token_lock = threading.Lock()


def get_access_token(scopes: list[str] = SQL_SCOPES) -> str:
    """A bearer token for `scopes`, prompting for sign-in only if needed."""
    with _token_lock:
        accounts = _msal_app.get_accounts()
        if accounts:
            result = _msal_app.acquire_token_silent(scopes, account=accounts[0])
            if result and 'access_token' in result:
                return result['access_token']

        flow = _msal_app.initiate_device_flow(scopes=scopes)
        if 'user_code' not in flow:
            raise RuntimeError(f'Device code flow failed: {json.dumps(flow)}')

        print('\n--- Microsoft sign-in required ---', file=sys.stderr)
        print(flow['message'], file=sys.stderr)
        print('-----------------------------------\n', file=sys.stderr)
        sys.stderr.flush()

        result = _msal_app.acquire_token_by_device_flow(flow)
        if 'access_token' not in result:
            raise RuntimeError(f'Token acquisition failed: {json.dumps(result)}')
        return result['access_token']


def get_token_silently(scopes: list[str]) -> str:
    """A token from the existing sign-in, never prompting; raises if none."""
    with _token_lock:
        accounts = _msal_app.get_accounts()
        result = _msal_app.acquire_token_silent(scopes, account=accounts[0]) if accounts else None
    if not (result and 'access_token' in result):
        raise RuntimeError((result or {}).get('error_description', 'not signed in'))
    return result['access_token']


def signed_in_user() -> str | None:
    """The signed-in account's username (e.g. for STEWARD_ID), if any."""
    accounts = _msal_app.get_accounts()
    return accounts[0].get('username') if accounts else None
