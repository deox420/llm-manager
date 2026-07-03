from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user
from ..models import UsageLog, User

router = APIRouter(prefix="/api/usage", tags=["usage"])


@router.get("/summary")
async def usage_summary(
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    base_filter = [UsageLog.created_at >= since]
    if user.role != "admin":
        base_filter.append(UsageLog.user_id == user.id)

    total_tokens = func.sum(UsageLog.prompt_tokens + UsageLog.completion_tokens)

    totals = (
        await db.execute(
            select(func.coalesce(func.sum(UsageLog.cost_usd), 0.0), func.coalesce(total_tokens, 0)).where(
                *base_filter
            )
        )
    ).one()

    by_model = (
        await db.execute(
            select(
                UsageLog.model,
                func.count(UsageLog.id),
                func.coalesce(total_tokens, 0),
                func.coalesce(func.sum(UsageLog.cost_usd), 0.0),
            )
            .where(*base_filter)
            .group_by(UsageLog.model)
            .order_by(func.sum(UsageLog.cost_usd).desc())
        )
    ).all()

    day = func.date_trunc("day", UsageLog.created_at)
    by_day = (
        await db.execute(
            select(day, func.coalesce(func.sum(UsageLog.cost_usd), 0.0), func.coalesce(total_tokens, 0))
            .where(*base_filter)
            .group_by(day)
            .order_by(day)
        )
    ).all()

    result = {
        "total_usd": round(totals[0], 6),
        "total_tokens": int(totals[1]),
        "by_model": [
            {"model": m, "requests": int(r), "tokens": int(t), "usd": round(c, 6)}
            for m, r, t, c in by_model
        ],
        "by_day": [
            {"date": d.date().isoformat(), "usd": round(c, 6), "tokens": int(t)}
            for d, c, t in by_day
        ],
    }

    if user.role == "admin":
        by_user = (
            await db.execute(
                select(User.email, func.coalesce(func.sum(UsageLog.cost_usd), 0.0))
                .join(User, UsageLog.user_id == User.id)
                .where(UsageLog.created_at >= since)
                .group_by(User.email)
                .order_by(func.sum(UsageLog.cost_usd).desc())
            )
        ).all()
        result["by_user"] = [{"user": email, "usd": round(c, 6)} for email, c in by_user]

    return result
