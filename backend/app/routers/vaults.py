import shutil

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user
from ..models import User, Vault, VaultDocument
from ..schemas import (
    RagResultOut,
    RagSearchIn,
    VaultDocumentOut,
    VaultIn,
    VaultNoteIn,
    VaultOut,
    VaultSyncOut,
)
from ..security import encrypt_secret
from ..services import rag, vault_sync

router = APIRouter(prefix="/api", tags=["vaults"])


async def _get_vault(db: AsyncSession, vault_id: str) -> Vault:
    vault = await db.get(Vault, vault_id)
    if not vault:
        raise HTTPException(404, "Vault no encontrado")
    return vault


@router.get("/vaults", response_model=list[VaultOut])
async def list_vaults(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    return (await db.execute(select(Vault).order_by(Vault.name))).scalars().all()


@router.post("/vaults", response_model=VaultOut, status_code=201)
async def create_vault(
    payload: VaultIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)
):
    existing = (
        await db.execute(select(Vault).where(Vault.name == payload.name))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "Ya existe un vault con ese nombre")
    vault = Vault(
        name=payload.name,
        repo_url=payload.repo_url,
        branch=payload.branch,
        token_encrypted=encrypt_secret(payload.token) if payload.token else None,
    )
    db.add(vault)
    await db.commit()
    await db.refresh(vault)
    return vault


@router.post("/vaults/{vault_id}/sync", response_model=VaultSyncOut)
async def sync_vault(
    vault_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)
):
    vault = await _get_vault(db, vault_id)
    try:
        report = await vault_sync.sync_vault(db, vault)
    except Exception as exc:
        raise HTTPException(502, f"Error sincronizando el vault: {exc}")
    return VaultSyncOut(**report)


@router.get("/vaults/{vault_id}/documents", response_model=list[VaultDocumentOut])
async def list_documents(
    vault_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)
):
    await _get_vault(db, vault_id)
    return (
        (
            await db.execute(
                select(VaultDocument)
                .where(VaultDocument.vault_id == vault_id)
                .order_by(VaultDocument.path)
            )
        )
        .scalars()
        .all()
    )


@router.post("/vaults/{vault_id}/notes", status_code=201)
async def write_note(
    vault_id: str,
    payload: VaultNoteIn,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    vault = await _get_vault(db, vault_id)
    try:
        await vault_sync.write_note(vault, payload.path, payload.content, payload.message)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    except Exception as exc:
        raise HTTPException(502, f"Error escribiendo en el vault: {exc}")
    return {"status": "ok", "path": payload.path}


@router.delete("/vaults/{vault_id}", status_code=204)
async def delete_vault(
    vault_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)
):
    vault = await _get_vault(db, vault_id)
    repo_path = vault_sync.vault_repo_path(vault.id)
    await db.delete(vault)
    await db.commit()
    shutil.rmtree(repo_path, ignore_errors=True)


@router.post("/rag/search", response_model=list[RagResultOut])
async def rag_search(
    payload: RagSearchIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)
):
    results = await rag.search(
        db,
        payload.query,
        vault_id=payload.vault_id,
        folders=payload.folders or None,
        top_k=payload.top_k,
    )
    return [RagResultOut(**r) for r in results]
