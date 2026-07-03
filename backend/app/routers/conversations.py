import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..db import get_db
from ..deps import get_current_user
from ..models import Agent, Conversation, Message, User
from ..schemas import ConversationDetailOut, ConversationIn, ConversationOut, SendMessageIn
from ..services import agent_runner, llm

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


async def _get_conversation(db: AsyncSession, user: User, conversation_id: str) -> Conversation:
    convo = (
        await db.execute(
            select(Conversation)
            .options(selectinload(Conversation.messages))
            .where(Conversation.id == conversation_id, Conversation.user_id == user.id)
        )
    ).scalar_one_or_none()
    if not convo:
        raise HTTPException(404, "Conversación no encontrada")
    return convo


@router.get("", response_model=list[ConversationOut])
async def list_conversations(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    return (
        (
            await db.execute(
                select(Conversation)
                .where(Conversation.user_id == user.id)
                .order_by(Conversation.updated_at.desc())
            )
        )
        .scalars()
        .all()
    )


@router.post("", response_model=ConversationOut, status_code=201)
async def create_conversation(
    payload: ConversationIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not payload.model and not payload.agent_id:
        raise HTTPException(422, "Indica un modelo o un agente")
    convo = Conversation(
        user_id=user.id,
        title=payload.title or "Nueva conversación",
        model=payload.model,
        agent_id=payload.agent_id,
    )
    db.add(convo)
    await db.commit()
    await db.refresh(convo)
    return convo


@router.get("/{conversation_id}", response_model=ConversationDetailOut)
async def get_conversation(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await _get_conversation(db, user, conversation_id)


@router.delete("/{conversation_id}", status_code=204)
async def delete_conversation(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    convo = await _get_conversation(db, user, conversation_id)
    await db.delete(convo)
    await db.commit()


@router.post("/{conversation_id}/messages")
async def send_message(
    conversation_id: str,
    payload: SendMessageIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    convo = await _get_conversation(db, user, conversation_id)

    history = [{"role": m.role, "content": m.content} for m in convo.messages if m.role != "tool"]
    history.append({"role": "user", "content": payload.content})

    db.add(Message(conversation_id=convo.id, role="user", content=payload.content))
    if convo.title == "Nueva conversación":
        convo.title = payload.content[:60]
    await db.commit()

    async def stream():
        collected: list[str] = []
        try:
            if convo.agent_id:
                agent = await db.get(Agent, convo.agent_id)
                if not agent:
                    raise HTTPException(404, "El agente de esta conversación ya no existe")
                source = agent_runner.run_agent_stream(db, agent, history, user_id=user.id)
            else:
                source = llm.complete_stream(db, convo.model, history, user_id=user.id)

            async for line in source:
                if line.startswith("data: ") and "[DONE]" not in line:
                    try:
                        chunk = json.loads(line.removeprefix("data: ").strip())
                        delta = chunk["choices"][0]["delta"].get("content") or ""
                        collected.append(delta)
                    except (json.JSONDecodeError, KeyError, IndexError):
                        pass
                yield line
        except Exception as exc:
            error_chunk = {
                "object": "chat.completion.chunk",
                "choices": [
                    {"index": 0, "delta": {"content": f"\n\n[Error: {exc}]"}, "finish_reason": "stop"}
                ],
            }
            yield f"data: {json.dumps(error_chunk)}\n\n"
            yield "data: [DONE]\n\n"
        finally:
            text = "".join(collected)
            if text:
                db.add(Message(conversation_id=convo.id, role="assistant", content=text))
                await db.commit()

    return StreamingResponse(stream(), media_type="text/event-stream")
