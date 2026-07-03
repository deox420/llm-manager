"""Endpoint compatible OpenAI: POST /v1/chat/completions (JWT o clave virtual)."""

from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import Caller, get_caller
from ..services import llm

router = APIRouter(tags=["openai"])


class ChatCompletionIn(BaseModel):
    model: str
    messages: list[dict[str, Any]]
    stream: bool = False
    temperature: float | None = None
    max_tokens: int | None = None
    tools: list[dict] | None = None

    class Config:
        extra = "allow"


@router.post("/v1/chat/completions")
async def chat_completions(
    payload: ChatCompletionIn,
    caller: Caller = Depends(get_caller),
    db: AsyncSession = Depends(get_db),
):
    vk_id = caller.virtual_key.id if caller.virtual_key else None

    if payload.stream:
        return StreamingResponse(
            llm.complete_stream(
                db,
                payload.model,
                payload.messages,
                temperature=payload.temperature,
                max_tokens=payload.max_tokens,
                user_id=caller.user_id,
                virtual_key_id=vk_id,
            ),
            media_type="text/event-stream",
        )

    response = await llm.complete(
        db,
        payload.model,
        payload.messages,
        temperature=payload.temperature,
        max_tokens=payload.max_tokens,
        tools=payload.tools,
        user_id=caller.user_id,
        virtual_key_id=vk_id,
    )
    return response.model_dump() if hasattr(response, "model_dump") else response
