"""DataSonic report-agent backend (POC), now integrated into the main project.

    python -m uvicorn server.report_agent.app:app --port 8000

WebSocket /api/report/ws, JSON messages:
  client -> {"type": "generate", "lob": "marine", "prompt": "..."}
  client -> {"type": "approve", "job_id": "..."} | {"type": "revise", "job_id": "...", "feedback": "..."}
  client -> {"type": "subscribe", "job_id": "..."}        (after a reconnect: replays the job's events)
  server -> {"type": "job", "job_id", "lob", "prompt"}
         -> {"type": "step", "job_id", "text"}            (progress)
         -> {"type": "plan", "job_id", "plan": {...}}      (waits for approve / revise)
         -> {"type": "ready", "job_id", "result": {...}, "openUrl", "downloadUrl"}
         -> {"type": "rejected" | "error", "job_id", "message"}
HTTP: GET /api/report/{job_id}/open (opens the .pbip in Power BI Desktop on this machine),
      GET /api/report/{job_id}/download (zip of the Power BI project + plan), GET /api/health.

Claude integration: set CLAUDE_CODE_USE_FOUNDRY=1 and ANTHROPIC_FOUNDRY_RESOURCE (plus
ANTHROPIC_FOUNDRY_API_KEY unless you use Entra ID) to use Microsoft Foundry. Without them the server
uses the local Claude CLI, which must be signed in (run `claude` once). REPORT_AGENT_MODEL optionally
picks the model / Foundry deployment.
"""
import ast
import asyncio
import io
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
import warnings
import zipfile
from pathlib import Path

logger = logging.getLogger("report_agent")

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
# Foundry settings (CLAUDE_CODE_USE_FOUNDRY, ANTHROPIC_FOUNDRY_*) live in .env; the Claude CLI
# subprocess inherits os.environ. Real environment variables win over .env.
load_dotenv(PROJECT_ROOT / ".env")
REPORT_DATA = PROJECT_ROOT / "report_data"
sys.path.insert(0, str(Path(__file__).resolve().parent / "scripts"))  # run_dax, publish_report, pbir_build
SERVER_MODE = (Path(__file__).parent / "server_mode.md").read_text(encoding="utf-8")
SUPPORTED_LOBS = {"marine"}
BLOCKED_TOOLS = ["Bash", "PowerShell", "WebFetch", "WebSearch", "Task", "Agent", "NotebookEdit", "Skill", "TodoWrite"]
WRITE_TOOLS = {"Write", "Edit", "MultiEdit"}


def _skill_rules():
    """The Marine-specific rules from the marine-report skill (its Desktop/CLI steps don't apply here)."""
    text = (PROJECT_ROOT / ".claude" / "skills" / "marine-report" / "SKILL.md").read_text(encoding="utf-8")
    rules = re.search(r"^### Marine rules the plan must follow\n.*?(?=^## )", text, re.S | re.M)
    never = re.search(r"^## Never\n.*", text, re.S | re.M)
    if not (rules and never):
        return text
    return rules.group(0) + "\n" + never.group(0)


def _reference_material():
    """Inlined into the system prompt so the agent doesn't spend turns reading these files (it's cached)."""
    agent_dir = PROJECT_ROOT / "server" / "report_agent"
    builder = agent_dir / "scripts" / "pbir_build.py"
    example = agent_dir / "example_report.yaml"
    if not example.exists():
        example = REPORT_DATA / "reports" / "marine-claims-overview" / "report.yaml"
    ontology = REPORT_DATA / "ontology" / "marine.yaml"
    sections = [
        "# Reference material (already loaded: don't Read these files)",
        "## Marine report rules\n\n" + _skill_rules(),
        "## report.yaml field reference\n\n" + ast.get_docstring(ast.parse(builder.read_text(encoding="utf-8"))),
    ]
    if example.exists():
        sections.append(f"## Worked example: {example.relative_to(PROJECT_ROOT).as_posix()}\n\n```yaml\n{example.read_text(encoding='utf-8')}\n```")
    if ontology.exists():
        sections.append(f"## Ontology: {ontology.relative_to(PROJECT_ROOT).as_posix()}\n\n```yaml\n{ontology.read_text(encoding='utf-8')}\n```")
    return "\n\n".join(sections)


REFERENCE = _reference_material()

_HAS_SDK = False
try:
    from claude_agent_sdk import (AssistantMessage, CanUseToolShadowedWarning, ClaudeAgentOptions,
                                  ClaudeSDKClient, PermissionResultAllow, PermissionResultDeny,
                                  ResultMessage, TextBlock, ToolUseBlock)
    # Intentional: allowed_tools auto-approves the read-only tools; can_use_tool only gates writes.
    warnings.filterwarnings("ignore", category=CanUseToolShadowedWarning)
    _HAS_SDK = True
except ImportError:
    pass


def _unset(name):
    """Empty, or still the <placeholder> copied from .env.example."""
    v = (os.environ.get(name) or "").strip()
    return not v or (v.startswith("<") and v.endswith(">"))


def _foundry_problem():
    """None if Foundry is usable, else what's wrong with its .env settings."""
    bad = []
    if _unset("ANTHROPIC_FOUNDRY_RESOURCE") and _unset("ANTHROPIC_FOUNDRY_BASE_URL"):
        bad.append("ANTHROPIC_FOUNDRY_RESOURCE")
    if os.environ.get("ANTHROPIC_FOUNDRY_API_KEY") is not None and _unset("ANTHROPIC_FOUNDRY_API_KEY"):
        bad.append("ANTHROPIC_FOUNDRY_API_KEY")
    if not bad:
        return None
    return (f"CLAUDE_CODE_USE_FOUNDRY is on, but {' and '.join(bad)} in .env {'is' if len(bad) == 1 else 'are'} "
            "empty or still a <placeholder>. Fill in the Foundry resource name and API key, or remove "
            "CLAUDE_CODE_USE_FOUNDRY to use the local Claude CLI, then restart the report server.")


_AUTH_CACHE = {"at": 0.0, "ok": True}


def _local_cli_signed_in(cli):
    if not _unset("ANTHROPIC_API_KEY") or not _unset("CLAUDE_CODE_OAUTH_TOKEN"):
        return True
    if time.time() - _AUTH_CACHE["at"] < 60:
        return _AUTH_CACHE["ok"]
    try:
        r = subprocess.run([cli, "auth", "status"], capture_output=True, text=True, timeout=20)
        ok = bool(json.loads(r.stdout).get("loggedIn", True))
    except Exception:  # noqa: BLE001 - unknown output: don't block, the job will report the real error
        ok = True
    _AUTH_CACHE.update(at=time.time(), ok=ok)
    return ok


def _find_claude_cli():
    found = shutil.which("claude")
    if found and os.name == "nt" and found.lower().endswith((".cmd", ".bat")):
        exe = Path(found).resolve().parent / "node_modules" / "@anthropic-ai" / "claude-code" / "bin" / "claude.exe"
        if exe.exists():
            return str(exe)
    return found


def _log_cli_stderr(line):
    # The CLI ignores .claude/settings.json allow rules in an untrusted workspace. Server mode
    # passes its own allowed_tools and gates writes in can_use_tool, so that notice is noise.
    if "permissions.allow entries" in line and "has not been trusted" in line:
        return
    logger.warning("claude cli: %s", line.rstrip())


def _agent_mode():
    """Return ('foundry', cli_path) | ('local', cli_path) | (None, reason)."""
    if not _HAS_SDK:
        return None, "Claude Agent SDK is not installed (pip install claude-agent-sdk)."
    if os.environ.get("CLAUDE_CODE_USE_FOUNDRY"):
        problem = _foundry_problem()
        return (None, problem) if problem else ("foundry", _find_claude_cli())
    cli = _find_claude_cli()
    if not cli:
        return None, "Neither Microsoft Foundry nor a local Claude CLI is available."
    if not _local_cli_signed_in(cli):
        return None, ("The local Claude CLI isn't signed in. Run `claude` once in a terminal and log in, "
                      "or configure Microsoft Foundry in .env, then try again.")
    return "local", cli


app = FastAPI(title="DataSonic report agent (POC)")
JOBS: dict[str, "Job"] = {}


def last_json_block(text):
    blocks = re.findall(r"```json\s*(\{.*?\})\s*```", text or "", re.S)
    for b in reversed(blocks):
        try:
            return json.loads(b)
        except json.JSONDecodeError:
            continue
    return None


def step_label(tool, inp):
    path = str(inp.get("file_path", inp.get("path", ""))).replace("\\", "/")
    name = path.rsplit("/", 1)[-1]
    if tool == "mcp__marine__run_dax":
        return "Checking the data in Marine_Gold_Model"
    if tool == "mcp__marine__build_report":
        return "Building the Power BI report and validating it"
    if tool in WRITE_TOOLS:
        return {"report-spec.md": "Writing the report spec", "report.yaml": "Writing the report plan"}.get(name, f"Writing {name}")
    if tool == "Read":
        if "ontology" in path:
            return "Reading the business ontology"
        if "/skills/" in path:
            return "Reading the report-building rules"
        if "/reports/" in path or "/report_data/" in path:
            return "Studying a worked example report"
        if "/model/" in path:
            return "Reading the semantic model definition"
        return f"Reading {name}"
    if tool in ("Glob", "Grep"):
        return "Looking through project files"
    return None


class Job:
    def __init__(self, lob, prompt):
        self.id = uuid.uuid4().hex[:12]
        self.lob, self.prompt = lob, prompt
        self.dir = REPORT_DATA / "reports" / f"job-{self.id}"
        self.events, self.subscribers = [], set()
        self.client, self.status, self.started, self.cost = None, "planning", time.time(), 0.0
        self.busy = asyncio.Lock()
        self.plan = None          # last plan block, so a failed build can be retried or revised
        self.last_build = None    # (ok, output) of the latest build_report call: the server's source of truth
        self.loop = self.prompt_file = None

    def emit_nowait(self, ev):
        ev = {**ev, "job_id": self.id}
        self.events.append(ev)
        for q in list(self.subscribers):
            q.put_nowait(ev)

    async def emit(self, ev):
        self.emit_nowait(ev)

    def notify_threadsafe(self, text):
        """Progress from a worker thread (e.g. the Power BI device-code sign-in prompt)."""
        if self.loop:
            self.loop.call_soon_threadsafe(self.emit_nowait, {"type": "step", "text": text})

    def record_build(self, ok, output):
        self.last_build = (ok, output)

    async def can_use_tool(self, name, inp, ctx):
        if name in WRITE_TOOLS:
            target = Path(inp.get("file_path", ""))
            target = (target if target.is_absolute() else PROJECT_ROOT / target).resolve()
            if self.dir.resolve() in target.parents:
                return PermissionResultAllow()
            return PermissionResultDeny(message=f"Writes are only allowed inside {self.dir.relative_to(PROJECT_ROOT)}")
        return PermissionResultDeny(message=f"{name} is not available in server mode")

    async def start(self):
        from .agent_tools import TOOL_NAMES, make_tools

        self.loop = asyncio.get_running_loop()
        self.dir.mkdir(parents=True, exist_ok=True)
        rel = self.dir.relative_to(PROJECT_ROOT).as_posix()
        # ~55 KB of instructions + reference: too long for a Windows command line (32 KB), so pass a file.
        self.prompt_file = Path(tempfile.gettempdir()) / f"datasonic-report-{self.id}.md"
        self.prompt_file.write_text(SERVER_MODE.replace("{job_dir}", rel) + "\n\n" + REFERENCE, encoding="utf-8")
        opts = ClaudeAgentOptions(
            cwd=str(PROJECT_ROOT),
            cli_path=_find_claude_cli(),
            # No filesystem settings or skills: everything the agent needs is in the system prompt, so it
            # doesn't spend turns loading the skill and reading the ontology / example / generator docs.
            setting_sources=[],
            system_prompt={"type": "preset", "preset": "claude_code"},
            extra_args={"append-system-prompt-file": str(self.prompt_file)},
            mcp_servers={"marine": make_tools(self.dir, notify=self.notify_threadsafe, on_build=self.record_build)},
            strict_mcp_config=True,
            allowed_tools=["Read", "Glob", "Grep", *TOOL_NAMES],
            disallowed_tools=BLOCKED_TOOLS,
            can_use_tool=self.can_use_tool,
            model=os.environ.get("REPORT_AGENT_MODEL") or None,
            max_turns=60,
            max_budget_usd=10,
            stderr=_log_cli_stderr,
        )
        try:
            logger.info("Starting Claude agent with cli_path=%s, cwd=%s", opts.cli_path, opts.cwd)
            self.client = ClaudeSDKClient(options=opts)
            await self.client.connect()
            logger.info("Claude agent connected successfully")
        except Exception as e:  # noqa: BLE001
            logger.exception("Failed to start Claude agent")
            await self.fail(f"Failed to start Claude agent: {e}")
            return
        await self.turn(f"Line of business: Marine.\nReport request from the user:\n\n{self.prompt}")

    async def run(self, text):
        """One agent turn; returns its final text. Raises on API / agent errors."""
        final = ""
        await self.client.query(text)
        async for msg in self.client.receive_response():
            if isinstance(msg, AssistantMessage):
                for b in msg.content:
                    if isinstance(b, ToolUseBlock):
                        label = step_label(b.name, b.input or {})
                        if label:
                            await self.emit({"type": "step", "text": label})
                    elif isinstance(b, TextBlock):
                        logger.info("TextBlock (first 500): %s", b.text[:500])
                        final = b.text
            elif isinstance(msg, ResultMessage):
                logger.info("ResultMessage: subtype=%s is_error=%s cost=%.2f turns=%s result_len=%d errors=%s",
                            msg.subtype, msg.is_error, msg.total_cost_usd or 0, msg.num_turns,
                            len(msg.result or ""), msg.errors)
                self.cost += msg.total_cost_usd or 0
                if msg.result:
                    final = msg.result
                if msg.is_error:
                    # API failures (bad model, auth, network) arrive as subtype "success"
                    # with the actual error text in msg.result.
                    detail = msg.result or msg.errors or msg.subtype
                    raise RuntimeError(f"agent stopped: {detail}")
        return final

    async def turn(self, text):
        async with self.busy:
            try:
                final = await self.run(text)
                block = last_json_block(final)
                if not (block or {}).get("phase"):
                    # The agent sometimes finishes its work but forgets the machine-readable block: ask once.
                    await self.emit({"type": "step", "text": "Collecting the agent's summary"})
                    final = await self.run("Your reply didn't end with the required fenced ```json block. Reply now "
                                           "with only that block, based on the work you've already done.")
                    block = last_json_block(final)
            except Exception as e:  # noqa: BLE001
                await self.fail(str(e))
                return
            await self.handle(block, final)

    async def handle(self, block, text):
        meta = {"seconds": round(time.time() - self.started), "cost_usd": round(self.cost, 2)}
        phase = (block or {}).get("phase")
        if phase == "plan":
            self.plan = block
            self.status = "awaiting_approval"
            await self.emit({"type": "plan", "plan": block, **meta})
        elif phase == "built":
            # Trust the generator's exit code, not the agent's own "validation" claim.
            ok, output = self.last_build or (False, "build_report was never called")
            ok = ok and next(self.dir.glob("*.pbip"), None) is not None
            notes = list(block.get("notes") or [])
            if ok and "local checks only" in output and not any("local" in n.lower() for n in notes):
                notes.append("Checked with local structural checks only: Microsoft's powerbi-report-author "
                              "isn't installed on the server, so open it in Power BI Desktop to confirm.")
            result = {**block, "validation": "succeeded" if ok else "failed", "notes": notes}
            self.status = "ready" if ok else "error"
            ev = {"type": "ready", "result": result, **meta, "openUrl": f"/api/report/{self.id}/open",
                  "publishUrl": f"/api/report/{self.id}/publish", "downloadUrl": f"/api/report/{self.id}/download"}
            if not ok:
                ev["message"] = "The report did not pass the build: " + output.strip()[-300:]
                ev["can_retry"] = self.client is not None
            await self.emit(ev)
            if ok:
                await self.close()
        elif phase == "rejected":
            self.status = "rejected"
            await self.emit({"type": "rejected", "message": block.get("reason", "Request rejected")})
            await self.close()
        else:
            await self.fail("The agent did not return a plan or result.", detail=text[-800:])

    async def fail(self, message, detail=None):
        self.status = "error"
        ev = {"type": "error", "message": message[:500], "can_retry": self.plan is not None and self.client is not None}
        if detail:
            ev["detail"] = detail
        await self.emit(ev)
        if self.plan is None:
            # Nothing to retry: free the CLI process and drop the empty job folder.
            await self.close()
            if self.dir.exists() and not any(self.dir.iterdir()):
                self.dir.rmdir()

    async def close(self):
        if self.client:
            try:
                await self.client.disconnect()
            except Exception:  # noqa: BLE001
                logger.warning("disconnect failed for job %s", self.id, exc_info=True)
            self.client = None
        if self.prompt_file:
            self.prompt_file.unlink(missing_ok=True)


@app.websocket("/api/report/ws")
async def ws(websocket: WebSocket):
    await websocket.accept()
    queue: asyncio.Queue = asyncio.Queue()
    subscribed: list[Job] = []

    async def pump():
        while True:
            await websocket.send_json(await queue.get())

    sender = asyncio.create_task(pump())

    def subscribe(job, replay):
        job.subscribers.add(queue)
        subscribed.append(job)
        for ev in (job.events if replay else []):
            queue.put_nowait(ev)

    try:
        while True:
            msg = await websocket.receive_json()
            kind = msg.get("type")
            if kind == "generate":
                mode, mode_detail = await asyncio.to_thread(_agent_mode)

                if mode is None:
                    await websocket.send_json({"type": "error", "job_id": None,
                                               "message": f"Report agent unavailable: {mode_detail}"})
                    continue

                lob, prompt = msg.get("lob", "").lower(), (msg.get("prompt") or "").strip()[:1000]
                if not prompt:
                    continue
                job = Job(lob, prompt)
                JOBS[job.id] = job
                subscribe(job, replay=False)
                await job.emit({"type": "job", "lob": lob, "prompt": prompt})
                if lob not in SUPPORTED_LOBS:
                    job.status = "rejected"
                    await job.emit({"type": "rejected", "message": f"{lob.title()} isn't available yet: only Marine has an ontology so far."})
                    continue
                await job.emit({"type": "step", "text": "Starting the report agent"})
                asyncio.create_task(job.start())
            elif kind in ("approve", "revise"):
                job = JOBS.get(msg.get("job_id", ""))
                # A failed build keeps its plan and agent session, so it can be retried or revised.
                retryable = job and job.status == "error" and job.plan is not None and job.client is not None
                if not job or (job.status != "awaiting_approval" and not retryable) or job.busy.locked():
                    await websocket.send_json({"type": "error", "job_id": msg.get("job_id"), "message": "No plan waiting for approval."})
                    continue
                if kind == "approve":
                    job.status = "building"
                    job.last_build = None
                    await job.emit({"type": "step", "text": "Retrying the build" if retryable else "Plan approved: building"})
                    asyncio.create_task(job.turn("APPROVED"))
                else:
                    job.status = "planning"
                    await job.emit({"type": "step", "text": "Revising the plan"})
                    asyncio.create_task(job.turn(f"REVISE: {msg.get('feedback', '')[:1000]}"))
            elif kind == "subscribe":
                job = JOBS.get(msg.get("job_id", ""))
                if job:
                    subscribe(job, replay=True)
    except WebSocketDisconnect:
        pass
    finally:
        sender.cancel()
        for job in subscribed:
            job.subscribers.discard(queue)


def job_or_404(job_id):
    job = JOBS.get(job_id)
    if not job:
        d = REPORT_DATA / "reports" / f"job-{job_id}"
        if not d.exists():
            raise HTTPException(404, "Unknown job")
        return d
    return job.dir


@app.get("/api/report/{job_id}/open")
def open_in_desktop(job_id: str):
    d = job_or_404(job_id)
    pbip = next(d.glob("*.pbip"), None)
    if not pbip:
        raise HTTPException(409, "The report hasn't been built yet")
    exe = os.environ.get("PBI_DESKTOP_PATH") or _user_env("PBI_DESKTOP_PATH")
    if not exe or not Path(exe).exists():
        raise HTTPException(500, "Power BI Desktop path (PBI_DESKTOP_PATH) isn't set on the server")
    subprocess.Popen([exe, str(pbip)])
    return {"ok": True, "opened": pbip.name}


PUBLISH_LOCKS: dict[str, asyncio.Lock] = {}


@app.post("/api/report/{job_id}/publish")
async def publish_to_web(job_id: str):
    """Publish the built report to Power BI (the user's My workspace unless PUBLISH_WORKSPACE_ID is set)
    and return its web URL. Publishes once per job; later clicks reuse the same report."""
    d = job_or_404(job_id)
    if not next(d.glob("*.pbip"), None):
        raise HTTPException(409, "The report hasn't been built yet")
    cache = d / ".published.json"
    async with PUBLISH_LOCKS.setdefault(job_id, asyncio.Lock()):
        if cache.exists():
            return json.loads(cache.read_text(encoding="utf-8"))
        import publish_report
        import run_dax
        tok = await asyncio.to_thread(run_dax.silent_token, publish_report.FABRIC_SCOPES)
        if not tok:
            msg = await asyncio.to_thread(run_dax.begin_sign_in, publish_report.FABRIC_SCOPES)
            raise HTTPException(401, f"Sign in to Power BI first: {msg} Then click the button again.")
        try:
            result = await asyncio.to_thread(publish_report.publish, d, access_token=tok)
        except (RuntimeError, OSError, ValueError) as e:
            logger.exception("publish failed for job %s", job_id)
            raise HTTPException(502, str(e)[:600])
        except Exception as e:  # noqa: BLE001 - network errors etc.: still give the UI a readable reason
            logger.exception("publish failed for job %s", job_id)
            raise HTTPException(502, f"Publish failed: {type(e).__name__}: {e}"[:600])
        cache.write_text(json.dumps(result, indent=2), encoding="utf-8")
        return result


@app.get("/api/report/{job_id}/download")
def download(job_id: str):
    d = job_or_404(job_id)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for f in d.rglob("*"):
            if f.is_file():
                z.write(f, f.relative_to(d))
    buf.seek(0)
    name = next((p.stem for p in d.glob("*.pbip")), d.name)
    return StreamingResponse(buf, media_type="application/zip",
                             headers={"Content-Disposition": f'attachment; filename="{name}.zip"'})


@app.get("/api/health")
@app.get("/api/report/health")  # the web app's dev proxy sends /api/health to the main API, not here
def health():
    mode, detail = _agent_mode()
    return {"ok": True, "agent_available": mode is not None, "agent_mode": mode,
            "agent_detail": None if mode else detail,
            "jobs": {j.id: j.status for j in JOBS.values()}}


def _user_env(name):
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as k:
            return winreg.QueryValueEx(k, name)[0]
    except OSError:
        return None


@app.on_event("shutdown")
async def shutdown():
    for j in JOBS.values():
        await j.close()
