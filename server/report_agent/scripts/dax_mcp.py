"""Read-only MCP server with one tool, run_dax, for Marine_Gold_Model. Registered in .mcp.json."""
import json
import sys
from pathlib import Path

from mcp.server.mcpserver import MCPServer

sys.path.insert(0, str(Path(__file__).parent))
import run_dax as dax  # noqa: E402

server = MCPServer("marine-dax", instructions="Read-only DAX queries against Marine_Gold_Model (DataSonic 3).")


@server.tool()
def run_dax(query: str) -> str:
    """Run a read-only DAX query (must start with EVALUATE or DEFINE) against Marine_Gold_Model.
    Returns JSON {row_count, rows, truncated}, or an error message to fix the query."""
    try:
        rows = dax.run(query)
    except SystemExit as e:
        return str(e)
    return json.dumps({"row_count": len(rows), "rows": rows[:dax.MAX_ROWS], "truncated": len(rows) > dax.MAX_ROWS},
                      ensure_ascii=False, default=str)


if __name__ == "__main__":
    server.run()
