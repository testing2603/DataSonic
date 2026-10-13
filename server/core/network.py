"""DNS fallback for the corporate network.

Python's socket.getaddrinfo sometimes fails here while `nslookup` works, so
the patch below retries a failed lookup through nslookup. apply_dns_patch()
is called once at startup, before any connection is made.
"""

import socket as _socket
import subprocess
import sys


def _resolve_via_nslookup(hostname: str) -> str | None:
    try:
        result = subprocess.run(['nslookup', hostname], capture_output=True, text=True, timeout=10)
        # Only read addresses after the "Name:" line: everything before it is
        # the DNS server's own address, never the answer. Windows lists
        # several addresses as "Addresses:  a" plus indented continuation
        # lines, so collect those too.
        addresses = []
        in_answer = False
        in_addresses = False
        for raw in result.stdout.splitlines():
            line = raw.strip()
            if line.startswith('Name:'):
                in_answer = True
                continue
            if not in_answer:
                continue
            if line.startswith('Address:') or line.startswith('Addresses:'):
                in_addresses = True
                line = line.split(':', 1)[1].strip()
            elif not raw[:1].isspace():
                in_addresses = False  # e.g. "Aliases:" section
            if in_addresses and line.count('.') == 3:  # IPv4 only
                addresses.append(line)
        if addresses:
            return addresses[0]
    except Exception as e:
        print(f'nslookup fallback failed for {hostname}: {e}', file=sys.stderr)
    return None


_applied = False


def apply_dns_patch():
    """Patch socket.getaddrinfo to fall back to nslookup (idempotent)."""
    global _applied
    if _applied:
        return
    original_getaddrinfo = _socket.getaddrinfo
    cache: dict[str, str] = {}

    def patched_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
        # A TDS redirect can name "<host>\<instance>"; only the host part is
        # a DNS name.
        if isinstance(host, str) and '\\' in host:
            host = host.split('\\', 1)[0]
        try:
            return original_getaddrinfo(host, port, family, type, proto, flags)
        except _socket.gaierror:
            if not isinstance(host, str):
                raise
            print(f'DNS failed for {host}:{port}, trying nslookup fallback...', file=sys.stderr)
            if host not in cache:
                ip = _resolve_via_nslookup(host)
                if not ip:
                    print(f'nslookup also failed for {host}', file=sys.stderr)
                    raise
                cache[host] = ip
                print(f'nslookup resolved: {host} -> {ip}', file=sys.stderr)
            p = port if isinstance(port, int) else (int(port) if port else 1433)
            return [(_socket.AF_INET, _socket.SOCK_STREAM, 6, '', (cache[host], p))]

    _socket.getaddrinfo = patched_getaddrinfo
    _applied = True
    print('DNS fallback patch applied.', file=sys.stderr)


def prewarm(host: str, port: int = 1433):
    """Resolve a host at startup so a DNS problem shows up immediately."""
    if not host:
        return
    try:
        addr = _socket.getaddrinfo(host, port, _socket.AF_INET, _socket.SOCK_STREAM)[0][4][0]
        print(f'Pre-resolved: {host} -> {addr}', file=sys.stderr)
    except Exception as e:
        print(f'Pre-resolution of {host} failed: {e}', file=sys.stderr)
