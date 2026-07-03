"""Sincronización de vaults Obsidian: réplica git, indexado RAG y agentes-como-notas."""

import asyncio
import hashlib
import os
import re
from pathlib import Path
from urllib.parse import urlparse, urlunparse

import frontmatter
from git import Repo
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..models import Agent, DocumentChunk, Vault, VaultDocument
from ..security import decrypt_secret
from . import llm, rag

CHUNK_MAX_CHARS = 1500


# ---------- funciones puras (testeables sin BD) ----------

def authed_url(repo_url: str, token: str | None) -> str:
    """Inyecta un token en una URL https de git (formato x-access-token para GitHub/GitLab)."""
    if not token or not repo_url.startswith("http"):
        return repo_url
    parts = urlparse(repo_url)
    netloc = f"x-access-token:{token}@{parts.netloc}"
    return urlunparse(parts._replace(netloc=netloc))


def chunk_markdown(text: str, max_chars: int = CHUNK_MAX_CHARS) -> list[str]:
    """Trocea Markdown por encabezados y, si un bloque excede max_chars, por párrafos."""
    sections = re.split(r"(?m)^(?=#{1,6}\s)", text)
    chunks: list[str] = []
    for section in sections:
        section = section.strip()
        if not section:
            continue
        if len(section) <= max_chars:
            chunks.append(section)
            continue
        current = ""
        for para in section.split("\n\n"):
            if len(current) + len(para) + 2 > max_chars and current:
                chunks.append(current.strip())
                current = ""
            current += para + "\n\n"
        if current.strip():
            chunks.append(current.strip())
    return chunks


def parse_agent_note(fm: dict, body: str, path: str) -> dict | None:
    """Convierte una nota con frontmatter `type: agent` en la definición de un agente."""
    if fm.get("type") != "agent":
        return None
    name = fm.get("name") or Path(path).stem
    return {
        "name": str(name),
        "description": str(fm.get("description", "")),
        "model": str(fm.get("model", "")),
        "fallback_models": list(fm.get("fallback_models") or []),
        "system_prompt": body.strip(),
        "temperature": float(fm.get("temperature", 0.7)),
        "tools": list(fm.get("tools") or []),
        "rag_folders": list(fm.get("rag_folders") or []),
        "vault_path": path,
    }


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


# ---------- operaciones git (bloqueantes; se ejecutan en un hilo) ----------

def vault_repo_path(vault_id: str) -> Path:
    return Path(get_settings().vault_data_dir) / vault_id


def _clone_or_pull(vault: Vault, token: str | None) -> Path:
    path = vault_repo_path(vault.id)
    url = authed_url(vault.repo_url, token)
    if (path / ".git").exists():
        repo = Repo(path)
        with repo.git.custom_environment(GIT_TERMINAL_PROMPT="0"):
            repo.remotes.origin.set_url(url)
            repo.remotes.origin.pull(vault.branch)
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        Repo.clone_from(url, path, branch=vault.branch, env={"GIT_TERMINAL_PROMPT": "0"})
    return path


def _commit_and_push(vault: Vault, token: str | None, rel_path: str, message: str) -> None:
    path = vault_repo_path(vault.id)
    repo = Repo(path)
    repo.index.add([rel_path])
    repo.index.commit(message)
    with repo.git.custom_environment(GIT_TERMINAL_PROMPT="0"):
        repo.remotes.origin.set_url(authed_url(vault.repo_url, token))
        repo.remotes.origin.push(vault.branch)


# ---------- sincronización ----------

async def sync_vault(db: AsyncSession, vault: Vault) -> dict:
    token = decrypt_secret(vault.token_encrypted) if vault.token_encrypted else None
    root = await asyncio.to_thread(_clone_or_pull, vault, token)

    errors: list[str] = []
    seen_paths: set[str] = set()
    seen_agents: set[str] = set()
    documents_indexed = 0
    agents_synced = 0

    use_embeddings = await rag.embeddings_available(db)
    embedding_model = get_settings().embedding_model

    existing_docs = {
        d.path: d
        for d in (
            await db.execute(select(VaultDocument).where(VaultDocument.vault_id == vault.id))
        ).scalars()
    }

    for file in sorted(root.rglob("*.md")):
        rel = file.relative_to(root).as_posix()
        if rel.startswith(".obsidian/") or "/.obsidian/" in rel:
            continue
        seen_paths.add(rel)
        try:
            post = frontmatter.load(file)
        except Exception as exc:  # nota corrupta: se reporta y se sigue
            errors.append(f"{rel}: {exc}")
            continue

        fm = dict(post.metadata)
        body = post.content
        digest = content_hash(file.read_text(encoding="utf-8", errors="replace"))

        doc = existing_docs.get(rel)
        changed = doc is None or doc.content_hash != digest
        if doc is None:
            doc = VaultDocument(vault_id=vault.id, path=rel)
            db.add(doc)
        if changed:
            doc.title = str(fm.get("title") or Path(rel).stem)
            doc.content_hash = digest
            doc.frontmatter = {k: _jsonable(v) for k, v in fm.items()}
            await db.flush()
            await db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == doc.id))
            chunks = chunk_markdown(body)
            embeddings: list[list[float] | None] = [None] * len(chunks)
            if use_embeddings and chunks:
                try:
                    embeddings = await llm.embed_texts(db, embedding_model, chunks)
                except Exception as exc:
                    errors.append(f"embeddings {rel}: {exc}")
            for i, chunk in enumerate(chunks):
                db.add(
                    DocumentChunk(
                        document_id=doc.id, chunk_index=i, content=chunk, embedding=embeddings[i]
                    )
                )
            documents_indexed += 1

        # agentes definidos como notas
        agent_def = parse_agent_note(fm, body, rel)
        if agent_def:
            if not agent_def["model"]:
                errors.append(f"{rel}: el agente no declara 'model'")
            else:
                await _upsert_vault_agent(db, vault.id, agent_def)
                seen_agents.add(agent_def["name"])
                agents_synced += 1

    # limpiar documentos y agentes cuyo archivo ya no existe
    for path, doc in existing_docs.items():
        if path not in seen_paths:
            await db.delete(doc)
    stale_agents = (
        await db.execute(
            select(Agent).where(Agent.source == "vault", Agent.vault_id == vault.id)
        )
    ).scalars()
    for agent in stale_agents:
        if agent.name not in seen_agents:
            await db.delete(agent)

    from datetime import datetime, timezone

    vault.last_synced_at = datetime.now(timezone.utc)
    await db.commit()
    return {
        "documents_indexed": documents_indexed,
        "agents_synced": agents_synced,
        "errors": errors,
    }


def _jsonable(value):
    import datetime

    if isinstance(value, (datetime.date, datetime.datetime)):
        return value.isoformat()
    if isinstance(value, list):
        return [_jsonable(v) for v in value]
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    return value


async def _upsert_vault_agent(db: AsyncSession, vault_id: str, definition: dict) -> None:
    existing = (
        await db.execute(select(Agent).where(Agent.name == definition["name"]))
    ).scalar_one_or_none()
    if existing and existing.source == "db":
        # no pisar agentes creados en la UI con el mismo nombre
        definition = {**definition, "name": f"{definition['name']} (vault)"}
        existing = (
            await db.execute(select(Agent).where(Agent.name == definition["name"]))
        ).scalar_one_or_none()
    if existing:
        for field in (
            "description",
            "model",
            "fallback_models",
            "system_prompt",
            "temperature",
            "tools",
            "rag_folders",
            "vault_path",
        ):
            setattr(existing, field, definition[field])
        existing.vault_id = vault_id
    else:
        db.add(Agent(source="vault", vault_id=vault_id, **definition))


async def write_note(vault: Vault, rel_path: str, content: str, message: str | None) -> None:
    token = decrypt_secret(vault.token_encrypted) if vault.token_encrypted else None
    root = vault_repo_path(vault.id)
    if not (root / ".git").exists():
        await asyncio.to_thread(_clone_or_pull, vault, token)
    target = (root / rel_path).resolve()
    if not str(target).startswith(str(root.resolve()) + os.sep):
        raise ValueError("Ruta fuera del vault")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    await asyncio.to_thread(
        _commit_and_push, vault, token, rel_path, message or f"llm-manager: actualizar {rel_path}"
    )
