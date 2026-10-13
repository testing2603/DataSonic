"""AI Data Assistant — Fabric Data Agent integration via MCP.

Exposes a chat endpoint that forwards questions to the published Fabric
Data Agent MCP server and returns the agent's natural-language answer.
"""

import sys

from flask import Blueprint, jsonify, request

import config
from . import fabric_agent

bp = Blueprint('ai_chat', __name__)


@bp.route('/api/ai-chat/ask', methods=['POST'])
def ask_agent():
    """POST {question, ?timeout} -> {answer, status}"""
    body = request.get_json(silent=True) or {}
    question = (body.get('question') or '').strip()
    if not question:
        return jsonify(error='question is required'), 400

    agent_url = config.DATA_AGENT_URL
    if not agent_url:
        return jsonify(error='DATA_AGENT_URL is not configured on the server'), 503

    timeout = int(body.get('timeout', 120))

    try:
        result = fabric_agent.ask(agent_url, question, timeout=timeout)
        return jsonify(result)
    except Exception as e:
        print(f'[ai-chat] agent error: {e}', file=sys.stderr)
        return jsonify(error=str(e)), 502


@bp.route('/api/ai-chat/status')
def agent_status():
    """Health check — is the data agent URL configured?"""
    configured = bool(config.DATA_AGENT_URL)
    return jsonify(configured=configured, agent_url=config.DATA_AGENT_URL or None)
