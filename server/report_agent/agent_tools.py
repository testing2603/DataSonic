"""In-process tools for the report agent (Claude Agent SDK MCP server "marine").

The agent gets these and file Read/Write inside its own job folder, nothing else: no shell.
Only imported when a job starts (Foundry must be configured).
"""
import asyncio
import json
import subprocess
import sys
from pathlib import Path

from claude_agent_sdk import create_sdk_mcp_server, tool

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPTS = Path(__file__).resolve().parent / "scripts"

sys.path.insert(0, str(SCRIPTS))
import run_dax as dax  # noqa: E402


def _text(s):
    return {"content": [{"type": "text", "text": s}]}


def make_tools(job_dir: Path, notify=None, on_build=None):
    """Tools bound to one job: build_report only accepts this job's report.yaml.

    notify(text) is called (from any thread) with progress the user should see, e.g. a sign-in code.
    on_build(ok, output) records the real build/validation result so the server doesn't have to
    trust the agent's own summary.
    """

    @tool("run_dax", "Run a read-only DAX query (must start with EVALUATE or DEFINE) against Marine_Gold_Model. "
                     "Returns JSON {row_count, rows, truncated} or an error message to fix the query.", {"query": str})
    async def run_dax(args):
        dax.on_device_code = (lambda m: notify(f"Power BI sign-in needed: {m}")) if notify else None
        try:
            rows = await asyncio.to_thread(dax.run, args["query"])
        except SystemExit as e:
            return _text(str(e))
        except Exception as e:  # noqa: BLE001
            return _text(f"run_dax failed: {type(e).__name__}: {e}")
        return _text(json.dumps({"row_count": len(rows), "rows": rows[:dax.MAX_ROWS], "truncated": len(rows) > dax.MAX_ROWS},
                                ensure_ascii=False, default=str))

    @tool("build_report", "Generate the Power BI project from this job's report.yaml and validate it. "
                          "Returns the build and validation output.", {})
    async def build_report(args):
        plan = job_dir / "report.yaml"
        if not plan.exists():
            return _text(f"No plan at {plan.relative_to(PROJECT_ROOT)}; write report.yaml first.")
        try:
            r = await asyncio.to_thread(subprocess.run, [sys.executable, str(SCRIPTS / "pbir_build.py"), str(plan)],
                                        cwd=PROJECT_ROOT, capture_output=True, text=True, timeout=600)
        except subprocess.TimeoutExpired:
            if on_build:
                on_build(False, "build timed out after 600s")
            return _text("Build timed out after 600s.")
        out = (r.stdout + r.stderr).strip()
        if on_build:
            on_build(r.returncode == 0, out)
        return _text(f"exit code {r.returncode}\n{out[-6000:]}")

    return create_sdk_mcp_server("marine", tools=[run_dax, build_report])


TOOL_NAMES = ["mcp__marine__run_dax", "mcp__marine__build_report"]
