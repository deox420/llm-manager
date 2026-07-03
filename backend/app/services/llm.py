"""Núcleo de inferencia: resuelve modelos del catálogo y llama a litellm."""

import json
from typing import Any, AsyncGenerator

import litellm
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import LLMModel, Provider, UsageLog
from ..security import decrypt_secret

litellm.drop_params = True  # ignora params no soportados por cada proveedor


async def resolve_model(db: AsyncSession, name: str) -> tuple[LLMModel, Provider]:
    result = await db.execute(
        select(LLMModel, Provider)
        .join(Provider, LLMModel.provider_id == Provider.id)
        .where(LLMModel.name == name, LLMModel.enabled == True)  # noqa: E712
    )
    row = result.first()
    if not row:
        raise HTTPException(404, f"Modelo '{name}' no existe o está deshabilitado")
    return row[0], row[1]


def build_call_kwargs(model: LLMModel, provider: Provider) -> dict[str, Any]:
    kwargs: dict[str, Any] = {"model": model.litellm_model}
    if provider.api_key_encrypted:
        kwargs["api_key"] = decrypt_secret(provider.api_key_encrypted)
    if provider.base_url:
        kwargs["api_base"] = provider.base_url
    return kwargs


def compute_cost(model: LLMModel, prompt_tokens: int, completion_tokens: int) -> float:
    return (
        prompt_tokens / 1000 * model.input_cost_per_1k
        + completion_tokens / 1000 * model.output_cost_per_1k
    )


async def log_usage(
    db: AsyncSession,
    *,
    model: LLMModel,
    prompt_tokens: int,
    completion_tokens: int,
    user_id: str | None = None,
    virtual_key_id: str | None = None,
) -> None:
    db.add(
        UsageLog(
            user_id=user_id,
            virtual_key_id=virtual_key_id,
            model=model.name,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            cost_usd=compute_cost(model, prompt_tokens, completion_tokens),
        )
    )
    await db.commit()


async def complete(
    db: AsyncSession,
    model_name: str,
    messages: list[dict],
    *,
    temperature: float | None = None,
    max_tokens: int | None = None,
    tools: list[dict] | None = None,
    user_id: str | None = None,
    virtual_key_id: str | None = None,
) -> Any:
    """Llamada no-streaming. Devuelve la respuesta litellm (formato OpenAI)."""
    model, provider = await resolve_model(db, model_name)
    kwargs = build_call_kwargs(model, provider)
    if temperature is not None:
        kwargs["temperature"] = temperature
    if max_tokens is not None:
        kwargs["max_tokens"] = max_tokens
    if tools:
        kwargs["tools"] = tools

    response = await litellm.acompletion(messages=messages, **kwargs)

    usage = getattr(response, "usage", None)
    await log_usage(
        db,
        model=model,
        prompt_tokens=getattr(usage, "prompt_tokens", 0) or 0,
        completion_tokens=getattr(usage, "completion_tokens", 0) or 0,
        user_id=user_id,
        virtual_key_id=virtual_key_id,
    )
    return response


def _chunk_to_json(chunk: Any) -> str:
    if hasattr(chunk, "model_dump_json"):
        return chunk.model_dump_json()
    return json.dumps(chunk)


async def complete_stream(
    db: AsyncSession,
    model_name: str,
    messages: list[dict],
    *,
    temperature: float | None = None,
    max_tokens: int | None = None,
    user_id: str | None = None,
    virtual_key_id: str | None = None,
) -> AsyncGenerator[str, None]:
    """Streaming SSE. Emite líneas 'data: {...}' y 'data: [DONE]', registrando el uso al final."""
    model, provider = await resolve_model(db, model_name)
    kwargs = build_call_kwargs(model, provider)
    if temperature is not None:
        kwargs["temperature"] = temperature
    if max_tokens is not None:
        kwargs["max_tokens"] = max_tokens

    stream = await litellm.acompletion(
        messages=messages,
        stream=True,
        stream_options={"include_usage": True},
        **kwargs,
    )

    prompt_tokens = 0
    completion_tokens = 0
    collected = []
    async for chunk in stream:
        usage = getattr(chunk, "usage", None)
        if usage:
            prompt_tokens = getattr(usage, "prompt_tokens", 0) or 0
            completion_tokens = getattr(usage, "completion_tokens", 0) or 0
        try:
            delta = chunk.choices[0].delta.content or ""
            collected.append(delta)
        except (IndexError, AttributeError):
            pass
        yield f"data: {_chunk_to_json(chunk)}\n\n"
    yield "data: [DONE]\n\n"

    if not prompt_tokens and not completion_tokens:
        # el proveedor no devolvió usage en el stream: estimación con el contador de litellm
        try:
            prompt_tokens = litellm.token_counter(model=model.litellm_model, messages=messages)
            completion_tokens = litellm.token_counter(
                model=model.litellm_model, text="".join(collected)
            )
        except Exception:
            pass

    await log_usage(
        db,
        model=model,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        user_id=user_id,
        virtual_key_id=virtual_key_id,
    )


async def embed_texts(db: AsyncSession, model_name: str, texts: list[str]) -> list[list[float]]:
    model, provider = await resolve_model(db, model_name)
    kwargs = build_call_kwargs(model, provider)
    response = await litellm.aembedding(input=texts, **kwargs)
    return [item["embedding"] for item in response.data]
