"""Fabric Data Agent client using the MCP (Model Context Protocol) endpoint.

The OpenAI Assistants endpoint (/aiassistant/openai) was retired on 2026-08-26.
This client uses the MCP streamable-HTTP endpoint instead, which is the
current Microsoft-recommended approach for external applications.

MCP endpoint pattern:
  https://api.fabric.microsoft.com/v1/mcp/workspaces/{wid}/dataagents/{aid}/agent

Reuses the MSAL device-code flow from core.auth for authentication.
"""

import asyncio
import re
import sys
import threading

import httpx2
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

from core import auth

FABRIC_AGENT_SCOPES = ['https://api.fabric.microsoft.com/.default']

_ASSISTANTS_URL = re.compile(
    r'^(https://[^/]+/v1)/workspaces/([^/]+)/dataagents/([^/]+)/aiassistant/openai$'
)
_MCP_URL_RE = re.compile(
    r'^(https://[^/]+/v1)/mcp/workspaces/([^/]+)/dataagents/([^/]+)/agent$'
)


def _to_mcp_url(agent_url: str) -> str:
    """Convert any known agent URL format to the MCP endpoint URL."""
    url = agent_url.strip().rstrip('/')

    m = _ASSISTANTS_URL.match(url)
    if m:
        return f'{m.group(1)}/mcp/workspaces/{m.group(2)}/dataagents/{m.group(3)}/agent'

    if _MCP_URL_RE.match(url):
        return url

    return url


def _unwrap_exception(exc: BaseException) -> Exception:
    """Dig the real error out of ExceptionGroup / BaseExceptionGroup wrappers."""
    while isinstance(exc, BaseExceptionGroup) and exc.exceptions:
        exc = exc.exceptions[0]
    return exc if isinstance(exc, Exception) else RuntimeError(str(exc))


async def _ask_async(mcp_url: str, question: str, timeout: int) -> dict:
    """Connect to the MCP endpoint, discover the tool, call it, return the answer."""
    token = auth.get_access_token(FABRIC_AGENT_SCOPES)
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    }

    http_client = httpx2.AsyncClient(headers=headers, timeout=timeout)

    try:
        async with streamable_http_client(mcp_url, http_client=http_client) as streams:
            read_stream, write_stream = streams[0], streams[1]
            async with ClientSession(read_stream, write_stream) as session:
                await session.initialize()

                tools_result = await session.list_tools()
                if not tools_result.tools:
                    return {'answer': 'No tools exposed by the data agent.', 'status': 'no_tools'}

                tool = tools_result.tools[0]
                schema = getattr(tool, 'inputSchema', None) or getattr(tool, 'input_schema', None) or {}
                props = schema.get('properties', {}) if isinstance(schema, dict) else {}
                question_arg = next(iter(props), 'question')
                print(f'[fabric-agent] tool={tool.name}, arg={question_arg}', file=sys.stderr)

                result = await session.call_tool(tool.name, {question_arg: question})

                answer_parts = []
                for block in result.content:
                    text = getattr(block, 'text', None)
                    if text:
                        answer_parts.append(text)

                answer = '\n'.join(answer_parts) if answer_parts else 'No response from the data agent.'
                return {'answer': answer, 'status': 'completed'}
    except BaseException as e:
        real = _unwrap_exception(e)
        print(f'[fabric-agent] MCP error: {real}', file=sys.stderr)
        raise real from e
    finally:
        await http_client.aclose()


def ask(agent_url: str, question: str, timeout: int = 120) -> dict:
    """Send a question to the Fabric Data Agent. Returns {answer, status}.

    This is the synchronous wrapper called by Flask routes. It runs the
    async MCP session in a background thread so it never conflicts with
    Flask's (or any existing) event loop.
    """
    mcp_url = _to_mcp_url(agent_url)

    result = {}
    error = None

    def _run():
        nonlocal result, error
        try:
            result = asyncio.run(_ask_async(mcp_url, question, timeout))
        except BaseException as e:
            error = _unwrap_exception(e)

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    t.join(timeout + 30)

    if t.is_alive():
        return {'answer': f'Timed out after {timeout}s.', 'status': 'timeout'}
    if error:
        raise error
    return result
