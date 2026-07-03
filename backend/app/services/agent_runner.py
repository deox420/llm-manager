"""Ejecución de agentes: system prompt + contexto RAG + bucle de tools (builtin y MCP)."""

import json
from typing import Any, AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Agent
from . import llm, mcp_client, rag

MAX_TOOL_ITERATIONS = 5

VAULT_SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "vault_search",
        "description": "Busca en las notas del vault Obsidian del usuario y devuelve los fragmentos más relevantes.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Consulta de búsqueda"},
            },
            "required": ["query"],
        },
    },
}


async def _build_tools(agent: Agent) -> list[dict]:
    tools: list[dict] = []
    for entry in agent.tools or []:
        if entry == "vault_search":
            tools.append(VAULT_SEARCH_TOOL)
        elif entry.startswith("mcp:"):
            tools.extend(await mcp_client.list_tools(entry.removeprefix("mcp:")))
    return tools


async def _execute_tool(db: AsyncSession, agent: Agent, name: str, arguments: dict) -> str:
    if name == "vault_search":
        results = await rag.search(
            db,
            arguments.get("query", ""),
            vault_id=agent.vault_id,
            folders=agent.rag_folders or None,
            top_k=5,
        )
        return rag.format_context(results) or "Sin resultados en el vault."
    if name.startswith("mcp__"):
        _, server, tool = name.split("__", 2)
        return await mcp_client.call_tool(server, tool, arguments)
    return f"Herramienta desconocida: {name}"


async def _build_messages(db: AsyncSession, agent: Agent, messages: list[dict]) -> list[dict]:
    system_parts = [agent.system_prompt] if agent.system_prompt else []
    if agent.rag_folders:
        last_user = next((m["content"] for m in reversed(messages) if m.get("role") == "user"), "")
        if last_user:
            results = await rag.search(
                db, last_user, vault_id=agent.vault_id, folders=agent.rag_folders, top_k=5
            )
            context = rag.format_context(results)
            if context:
                system_parts.append(context)
    built = [{"role": "system", "content": "\n\n".join(system_parts)}] if system_parts else []
    built.extend(m for m in messages if m.get("role") != "system")
    return built


def _candidate_models(agent: Agent) -> list[str]:
    return [agent.model] + [m for m in (agent.fallback_models or []) if m != agent.model]


async def run_agent(
    db: AsyncSession, agent: Agent, messages: list[dict], *, user_id: str | None = None
) -> Any:
    """Ejecuta el agente sin streaming, resolviendo tool calls hasta obtener respuesta final."""
    convo = await _build_messages(db, agent, messages)
    tools = await _build_tools(agent)

    last_error: Exception | None = None
    for model_name in _candidate_models(agent):
        try:
            return await _run_loop(db, agent, model_name, convo, tools, user_id)
        except Exception as exc:  # fallback al siguiente modelo
            last_error = exc
    raise last_error or RuntimeError("El agente no tiene modelos configurados")


async def _run_loop(
    db: AsyncSession,
    agent: Agent,
    model_name: str,
    convo: list[dict],
    tools: list[dict],
    user_id: str | None,
) -> Any:
    convo = list(convo)
    for _ in range(MAX_TOOL_ITERATIONS):
        response = await llm.complete(
            db,
            model_name,
            convo,
            temperature=agent.temperature,
            tools=tools or None,
            user_id=user_id,
        )
        message = response.choices[0].message
        tool_calls = getattr(message, "tool_calls", None)
        if not tool_calls:
            return response

        convo.append(
            {
                "role": "assistant",
                "content": message.content or "",
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                    }
                    for tc in tool_calls
                ],
            }
        )
        for tc in tool_calls:
            try:
                arguments = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                arguments = {}
            try:
                result = await _execute_tool(db, agent, tc.function.name, arguments)
            except Exception as exc:
                result = f"Error ejecutando la herramienta: {exc}"
            convo.append({"role": "tool", "tool_call_id": tc.id, "content": result})

    return await llm.complete(
        db, model_name, convo, temperature=agent.temperature, user_id=user_id
    )


async def run_agent_stream(
    db: AsyncSession, agent: Agent, messages: list[dict], *, user_id: str | None = None
) -> AsyncGenerator[str, None]:
    """Streaming SSE. Sin tools hace streaming real; con tools resuelve el bucle
    y emite la respuesta final como un único chunk (streaming simulado)."""
    tools = await _build_tools(agent)
    if not tools:
        convo = await _build_messages(db, agent, messages)
        last_error: Exception | None = None
        for model_name in _candidate_models(agent):
            try:
                async for line in llm.complete_stream(
                    db, model_name, convo, temperature=agent.temperature, user_id=user_id
                ):
                    yield line
                return
            except Exception as exc:
                last_error = exc
        raise last_error or RuntimeError("El agente no tiene modelos configurados")

    response = await run_agent(db, agent, messages, user_id=user_id)
    content = response.choices[0].message.content or ""
    chunk = {
        "id": getattr(response, "id", "agent"),
        "object": "chat.completion.chunk",
        "model": getattr(response, "model", agent.model),
        "choices": [{"index": 0, "delta": {"role": "assistant", "content": content}, "finish_reason": "stop"}],
    }
    yield f"data: {json.dumps(chunk)}\n\n"
    yield "data: [DONE]\n\n"
