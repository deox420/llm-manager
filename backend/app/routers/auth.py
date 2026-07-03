from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user
from ..models import User
from ..schemas import LoginIn, RegisterIn, TokenOut, UserOut
from ..security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=TokenOut)
async def register(payload: RegisterIn, db: AsyncSession = Depends(get_db)):
    existing = (
        await db.execute(select(User).where(User.email == payload.email))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "Ya existe un usuario con ese email")

    total = (await db.execute(select(func.count(User.id)))).scalar_one()
    user = User(
        email=payload.email,
        name=payload.name,
        password_hash=hash_password(payload.password),
        role="admin" if total == 0 else "user",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return TokenOut(token=create_access_token(user.id, user.role), user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenOut)
async def login(payload: LoginIn, db: AsyncSession = Depends(get_db)):
    user = (
        await db.execute(select(User).where(User.email == payload.email))
    ).scalar_one_or_none()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Credenciales incorrectas")
    if not user.is_active:
        raise HTTPException(403, "Usuario desactivado")
    return TokenOut(token=create_access_token(user.id, user.role), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return user
