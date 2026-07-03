from fastapi import Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_db
from .models import UsageLog, User, VirtualKey
from .security import VIRTUAL_KEY_PREFIX, decode_access_token, hash_virtual_key


def _bearer_token(request: Request) -> str:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Falta cabecera Authorization Bearer")
    return auth.removeprefix("Bearer ").strip()


async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    token = _bearer_token(request)
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(401, "Token inválido o caducado")
    user = await db.get(User, payload["sub"])
    if not user or not user.is_active:
        raise HTTPException(401, "Usuario no válido")
    return user


async def get_admin_user(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(403, "Requiere rol de administrador")
    return user


class Caller:
    """Identidad de quien llama a /v1: usuario con JWT o clave virtual."""

    def __init__(self, user: User | None, virtual_key: VirtualKey | None):
        self.user = user
        self.virtual_key = virtual_key

    @property
    def user_id(self) -> str | None:
        if self.user:
            return self.user.id
        if self.virtual_key:
            return self.virtual_key.user_id
        return None


async def get_caller(request: Request, db: AsyncSession = Depends(get_db)) -> Caller:
    token = _bearer_token(request)

    if token.startswith(VIRTUAL_KEY_PREFIX):
        result = await db.execute(
            select(VirtualKey).where(VirtualKey.key_hash == hash_virtual_key(token))
        )
        vk = result.scalar_one_or_none()
        if not vk or not vk.is_active:
            raise HTTPException(401, "Clave virtual no válida")
        if vk.expires_at is not None:
            from datetime import datetime, timezone

            if vk.expires_at < datetime.now(timezone.utc):
                raise HTTPException(401, "Clave virtual caducada")
        if vk.budget_usd is not None:
            spent = (
                await db.execute(
                    select(func.coalesce(func.sum(UsageLog.cost_usd), 0.0)).where(
                        UsageLog.virtual_key_id == vk.id
                    )
                )
            ).scalar_one()
            if spent >= vk.budget_usd:
                raise HTTPException(402, "Presupuesto de la clave agotado")
        return Caller(None, vk)

    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(401, "Token inválido")
    user = await db.get(User, payload["sub"])
    if not user or not user.is_active:
        raise HTTPException(401, "Usuario no válido")
    return Caller(user, None)
