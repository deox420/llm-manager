"""Cliente MCP (experimental): conecta agentes con servidores MCP stdio declarados en un JSON.

Formato del archivo (LLMM_MCP_SERVERS_FILE):
{
  "obsidian": {"command": "npx", "args": ["-y", "obsidian-mcp-server"], "env": {"OBSIDIAN_API_KEY": "..."}}
}
"""

import json
from pathlib import Path

from ..config import get_settings


def load_server_config(name: str) -> dict | None:
    path = get_settings().mcp_servers_file
    if not path or not Path(path).exists():
        return None
    servers = json.loads(Path(path).read_text())
    return servers.get(name)


async def list_tools(server_name: str) -> list[dict]:
    """Devuelve las tools del servidor MCP en formato OpenAI function-calling."""
    config = load_server_config(server_name)
    if not config:
        return []
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client

    params = StdioServerParameters(
        command=config["command"], args=config.get("args", []), env=config.get("env")
    )
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.list_tools()
            return [
                {
                    "type": "function",
                    "function": {
                        "name": f"mcp__{server_name}__{tool.name}",
                        "description": tool.description or "",
                        "parameters": tool.inputSchema or {"type": "object", "properties": {}},
                    },
                }
                for tool in result.tools
            ]


async def call_tool(server_name: str, tool_name: str, arguments: dict) -> str:
    config = load_server_config(server_name)
    if not config:
        return f"Servidor MCP '{server_name}' no configurado"
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client

    params = StdioServerParameters(
        command=config["command"], args=config.get("args", []), env=config.get("env")
    )
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool(tool_name, arguments)
            parts = []
            for item in result.content:
                text = getattr(item, "text", None)
                parts.append(text if text is not None else str(item))
            return "\n".join(parts)
