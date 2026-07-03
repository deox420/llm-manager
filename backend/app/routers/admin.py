from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_admin_user
from ..models import LLMModel, Provider, UsageLog, User, VirtualKey
from ..schemas import (
    KeyCreatedOut,
    KeyIn,
    KeyOut,
    KeyPatch,
    ModelIn,
    ModelOut,
    ModelPatch,
    ProviderIn,
    ProviderOut,
    ProviderPatch,
    UserOut,
    UserPatch,
)
from ..security import encrypt_secret, generate_virtual_key, hash_virtual_key

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(get_admin_user)])

PROVIDER_KINDS = {"openai", "anthropic", "google", "ollama", "openai_compatible"}


def _provider_out(p: Provider) -> ProviderOut:
    return ProviderOut(
        id=p.id,
        name=p.name,
        kind=p.kind,
        base_url=p.base_url,
        has_api_key=bool(p.api_key_encrypted),
        created_at=p.created_at,
    )


# ---- Proveedores ----
@router.get("/providers", response_model=list[ProviderOut])
async def list_providers(db: AsyncSession = Depends(get_db)):
    providers = (await db.execute(select(Provider).order_by(Provider.name))).scalars().all()
    return [_provider_out(p) for p in providers]


@router.post("/providers", response_model=ProviderOut, status_code=201)
async def create_provider(payload: ProviderIn, db: AsyncSession = Depends(get_db)):
    if payload.kind not in PROVIDER_KINDS:
        raise HTTPException(422, f"kind debe ser uno de: {sorted(PROVIDER_KINDS)}")
    provider = Provider(
        name=payload.name,
        kind=payload.kind,
        base_url=payload.base_url,
        api_key_encrypted=encrypt_secret(payload.api_key) if payload.api_key else None,
    )
    db.add(provider)
    await db.commit()
    await db.refresh(provider)
    return _provider_out(provider)


@router.patch("/providers/{provider_id}", response_model=ProviderOut)
async def update_provider(
    provider_id: str, payload: ProviderPatch, db: AsyncSession = Depends(get_db)
):
    provider = await db.get(Provider, provider_id)
    if not provider:
        raise HTTPException(404, "Proveedor no encontrado")
    data = payload.model_dump(exclude_unset=True)
    if "api_key" in data:
        api_key = data.pop("api_key")
        provider.api_key_encrypted = encrypt_secret(api_key) if api_key else None
    if "kind" in data and data["kind"] not in PROVIDER_KINDS:
        raise HTTPException(422, f"kind debe ser uno de: {sorted(PROVIDER_KINDS)}")
    for field, value in data.items():
        setattr(provider, field, value)
    await db.commit()
    await db.refresh(provider)
    return _provider_out(provider)


@router.delete("/providers/{provider_id}", status_code=204)
async def delete_provider(provider_id: str, db: AsyncSession = Depends(get_db)):
    provider = await db.get(Provider, provider_id)
    if not provider:
        raise HTTPException(404, "Proveedor no encontrado")
    await db.delete(provider)
    await db.commit()


# ---- Modelos ----
def _model_out(m: LLMModel, provider_name: str | None = None) -> ModelOut:
    return ModelOut(
        id=m.id,
        name=m.name,
        provider_id=m.provider_id,
        provider_name=provider_name,
        litellm_model=m.litellm_model,
        input_cost_per_1k=m.input_cost_per_1k,
        output_cost_per_1k=m.output_cost_per_1k,
        enabled=m.enabled,
    )


@router.get("/models", response_model=list[ModelOut])
async def list_models(db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            select(LLMModel, Provider.name)
            .join(Provider, LLMModel.provider_id == Provider.id)
            .order_by(LLMModel.name)
        )
    ).all()
    return [_model_out(m, name) for m, name in rows]


@router.post("/models", response_model=ModelOut, status_code=201)
async def create_model(payload: ModelIn, db: AsyncSession = Depends(get_db)):
    if not await db.get(Provider, payload.provider_id):
        raise HTTPException(422, "provider_id no existe")
    model = LLMModel(**payload.model_dump())
    db.add(model)
    await db.commit()
    await db.refresh(model)
    return _model_out(model)


@router.patch("/models/{model_id}", response_model=ModelOut)
async def update_model(model_id: str, payload: ModelPatch, db: AsyncSession = Depends(get_db)):
    model = await db.get(LLMModel, model_id)
    if not model:
        raise HTTPException(404, "Modelo no encontrado")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(model, field, value)
    await db.commit()
    await db.refresh(model)
    return _model_out(model)


@router.delete("/models/{model_id}", status_code=204)
async def delete_model(model_id: str, db: AsyncSession = Depends(get_db)):
    model = await db.get(LLMModel, model_id)
    if not model:
        raise HTTPException(404, "Modelo no encontrado")
    await db.delete(model)
    await db.commit()


# ---- Claves virtuales ----
async def _key_out(db: AsyncSession, vk: VirtualKey) -> KeyOut:
    spent = (
        await db.execute(
            select(func.coalesce(func.sum(UsageLog.cost_usd), 0.0)).where(
                UsageLog.virtual_key_id == vk.id
            )
        )
    ).scalar_one()
    return KeyOut(
        id=vk.id,
        name=vk.name,
        key_prefix=vk.key_prefix,
        user_id=vk.user_id,
        budget_usd=vk.budget_usd,
        spent_usd=round(spent, 6),
        expires_at=vk.expires_at,
        is_active=vk.is_active,
        created_at=vk.created_at,
    )


@router.get("/keys", response_model=list[KeyOut])
async def list_keys(db: AsyncSession = Depends(get_db)):
    keys = (
        (await db.execute(select(VirtualKey).order_by(VirtualKey.created_at.desc())))
        .scalars()
        .all()
    )
    return [await _key_out(db, vk) for vk in keys]


@router.post("/keys", response_model=KeyCreatedOut, status_code=201)
async def create_key(payload: KeyIn, db: AsyncSession = Depends(get_db)):
    raw_key = generate_virtual_key()
    vk = VirtualKey(
        name=payload.name,
        key_hash=hash_virtual_key(raw_key),
        key_prefix=raw_key[:14] + "...",
        user_id=payload.user_id,
        budget_usd=payload.budget_usd,
        expires_at=payload.expires_at,
    )
    db.add(vk)
    await db.commit()
    await db.refresh(vk)
    base = await _key_out(db, vk)
    return KeyCreatedOut(**base.model_dump(), key=raw_key)


@router.patch("/keys/{key_id}", response_model=KeyOut)
async def update_key(key_id: str, payload: KeyPatch, db: AsyncSession = Depends(get_db)):
    vk = await db.get(VirtualKey, key_id)
    if not vk:
        raise HTTPException(404, "Clave no encontrada")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(vk, field, value)
    await db.commit()
    await db.refresh(vk)
    return await _key_out(db, vk)


@router.delete("/keys/{key_id}", status_code=204)
async def delete_key(key_id: str, db: AsyncSession = Depends(get_db)):
    vk = await db.get(VirtualKey, key_id)
    if not vk:
        raise HTTPException(404, "Clave no encontrada")
    await db.delete(vk)
    await db.commit()


# ---- Usuarios ----
@router.get("/users", response_model=list[UserOut])
async def list_users(db: AsyncSession = Depends(get_db)):
    return (await db.execute(select(User).order_by(User.created_at))).scalars().all()


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(user_id: str, payload: UserPatch, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Usuario no encontrado")
    data = payload.model_dump(exclude_unset=True)
    if data.get("role") not in (None, "admin", "user"):
        raise HTTPException(422, "role debe ser 'admin' o 'user'")
    for field, value in data.items():
        setattr(user, field, value)
    await db.commit()
    await db.refresh(user)
    return user
