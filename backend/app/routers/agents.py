from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user
from ..models import Agent, User
from ..schemas import AgentChatIn, AgentIn, AgentOut, AgentPatch
from ..services import agent_runner

router = APIRouter(prefix="/api/agents", tags=["agents"])


async def _get_agent(db: AsyncSession, agent_id: str) -> Agent:
    agent = await db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(404, "Agente no encontrado")
    return agent


@router.get("", response_model=list[AgentOut])
async def list_agents(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    return (await db.execute(select(Agent).order_by(Agent.name))).scalars().all()


@router.post("", response_model=AgentOut, status_code=201)
async def create_agent(
    payload: AgentIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)
):
    existing = (
        await db.execute(select(Agent).where(Agent.name == payload.name))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "Ya existe un agente con ese nombre")
    agent = Agent(source="db", **payload.model_dump())
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    return agent


@router.get("/{agent_id}", response_model=AgentOut)
async def get_agent(
    agent_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)
):
    return await _get_agent(db, agent_id)


@router.patch("/{agent_id}", response_model=AgentOut)
async def update_agent(
    agent_id: str,
    payload: AgentPatch,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    agent = await _get_agent(db, agent_id)
    if agent.source == "vault":
        raise HTTPException(409, "Este agente se define en una nota del vault; edítalo allí")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(agent, field, value)
    await db.commit()
    await db.refresh(agent)
    return agent


@router.delete("/{agent_id}", status_code=204)
async def delete_agent(
    agent_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)
):
    agent = await _get_agent(db, agent_id)
    if agent.source == "vault":
        raise HTTPException(409, "Este agente se define en una nota del vault; bórralo allí")
    await db.delete(agent)
    await db.commit()


@router.post("/{agent_id}/chat")
async def chat_with_agent(
    agent_id: str,
    payload: AgentChatIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    agent = await _get_agent(db, agent_id)
    if payload.stream:
        return StreamingResponse(
            agent_runner.run_agent_stream(db, agent, payload.messages, user_id=user.id),
            media_type="text/event-stream",
        )
    response = await agent_runner.run_agent(db, agent, payload.messages, user_id=user.id)
    return response.model_dump() if hasattr(response, "model_dump") else response
