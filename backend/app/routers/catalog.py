from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user
from ..models import LLMModel, Provider, User
from ..schemas import CatalogModelOut

router = APIRouter(prefix="/api", tags=["catalog"])


@router.get("/models", response_model=list[CatalogModelOut])
async def list_models(
    db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)
):
    rows = (
        await db.execute(
            select(LLMModel, Provider.name)
            .join(Provider, LLMModel.provider_id == Provider.id)
            .where(LLMModel.enabled == True)  # noqa: E712
            .order_by(LLMModel.name)
        )
    ).all()
    return [
        CatalogModelOut(
            id=m.id,
            name=m.name,
            litellm_model=m.litellm_model,
            provider_name=provider_name,
            input_cost_per_1k=m.input_cost_per_1k,
            output_cost_per_1k=m.output_cost_per_1k,
        )
        for m, provider_name in rows
    ]
