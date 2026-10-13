"""Score the marine-answer agent against tests/golden.json.

Each question is sent to a fresh headless Claude Code session (`claude -p`) in this project,
so the agent sees only the skill, the ontology and the read-only run_dax tool (scripts/dax_mcp.py).

    python tests/run_eval.py            # all questions
    python tests/run_eval.py Q02 Q07    # some
"""
import concurrent.futures as cf
import json
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GOLDEN = json.loads((ROOT / "tests" / "golden.json").read_text(encoding="utf-8"))
OUT_DIR = ROOT / "tests" / "results"
ALLOWED = ["Read", "Skill", "mcp__marine-dax__run_dax"]
BLOCKED = ["Bash", "PowerShell", "Write", "Edit"]
TOLERANCE = 0.005  # 0.5% relative
MIN_MATCH = {"Q03": 5}  # ties: any 5 of the 7 tied brokers is correct


def ask(question):
    cmd = [shutil.which("claude"), "-p", f"{question}\n\nUse the marine-answer skill.", "--output-format", "json",
           "--mcp-config", str(ROOT / ".mcp.json"), "--strict-mcp-config",
           "--allowedTools", *ALLOWED, "--disallowedTools", *BLOCKED, "--max-turns", "20"]
    t = time.time()
    p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, encoding="utf-8")
    try:
        res = json.loads(p.stdout)
    except json.JSONDecodeError:
        return {"text": p.stdout + p.stderr, "seconds": time.time() - t, "cost": None}
    return {"text": res.get("result", ""), "seconds": round(time.time() - t), "cost": res.get("total_cost_usd")}


def final_block(text):
    blocks = re.findall(r"```json\s*(\{.*?\})\s*```", text, re.S)
    if not blocks:
        return None
    try:
        return json.loads(blocks[-1])
    except json.JSONDecodeError:
        return None


def nums(row):
    return [v for v in row.values() if isinstance(v, (int, float)) and not isinstance(v, bool)]


def strs(row):
    return [str(v).lower() for v in row.values() if isinstance(v, str)]


def close(a, b):
    return any(abs(x - b) <= TOLERANCE * max(abs(b), 1e-9) for x in (a, a / 100, a * 100))


def row_matches(exp, got):
    got_strs = " | ".join(strs(got))
    if not all(s in got_strs for s in strs(exp)):
        return False
    return all(any(close(g, e) for g in nums(got)) for e in nums(exp))


def score(case, answer):
    block = final_block(answer["text"])
    if "expected_behaviour" in case:
        want = "not_available" if "not available" in case["expected_behaviour"].lower() else "clarify"
        got = (block or {}).get("status")
        return got == want, f"status={got}, expected {want}"
    if not block:
        return False, "no JSON block"
    rows = block.get("rows") or []
    exp = case["expected"]
    matched = sum(any(row_matches(e, g) for g in rows) for e in exp)
    need = MIN_MATCH.get(case["id"], len(exp))
    return matched >= need, f"{matched}/{len(exp)} expected rows matched (need {need}); agent returned {len(rows)} rows"


def main():
    ids = set(sys.argv[1:])
    cases = [c for c in GOLDEN if not ids or c["id"] in ids]
    OUT_DIR.mkdir(exist_ok=True)
    with cf.ThreadPoolExecutor(4) as pool:
        answers = dict(zip([c["id"] for c in cases], pool.map(lambda c: ask(c["question"]), cases)))
    passed, lines, cost = 0, [], 0.0
    for c in cases:
        a = answers[c["id"]]
        ok, why = score(c, a)
        passed += ok
        cost += a["cost"] or 0
        (OUT_DIR / f"{c['id']}.md").write_text(f"# {c['id']}: {c['question']}\n\n{a['text']}\n", encoding="utf-8")
        lines.append(f"{'PASS' if ok else 'FAIL'}  {c['id']}  {c['question'][:55]:<55}  {why}  ({a['seconds']}s)")
    print("\n".join(lines))
    print(f"\n{passed}/{len(cases)} passed · cost ${cost:.2f} · answers in tests/results/")


if __name__ == "__main__":
    main()
