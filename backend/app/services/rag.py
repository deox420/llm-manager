"""Búsqueda RAG sobre los vaults: vectorial si hay modelo de embeddings, texto si no."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..models import DocumentChunk, VaultDocument
from . import llm


async def embeddings_available(db: AsyncSession) -> bool:
    name = get_settings().embedding_model
    if not name:
        return False
    try:
        await llm.resolve_model(db, name)
        return True
    except Exception:
        return False


async def search(
    db: AsyncSession,
    query: str,
    *,
    vault_id: str | None = None,
    folders: list[str] | None = None,
    top_k: int = 5,
) -> list[dict]:
    base = select(DocumentChunk, VaultDocument).join(
        VaultDocument, DocumentChunk.document_id == VaultDocument.id
    )
    if vault_id:
        base = base.where(VaultDocument.vault_id == vault_id)
    if folders:
        from sqlalchemy import or_

        base = base.where(or_(*[VaultDocument.path.like(f"{f.rstrip('/')}/%") for f in folders]))

    if await embeddings_available(db):
        qvec = (await llm.embed_texts(db, get_settings().embedding_model, [query]))[0]
        stmt = (
            base.where(DocumentChunk.embedding.is_not(None))
            .order_by(DocumentChunk.embedding.cosine_distance(qvec))
            .limit(top_k)
        )
        rows = (await db.execute(stmt)).all()
        return [
            {"path": doc.path, "chunk": chunk.content, "score": 1.0}
            for chunk, doc in rows
        ]

    # Fallback: búsqueda de texto simple por palabras de la consulta
    words = [w for w in query.split() if len(w) > 2][:5] or [query]
    from sqlalchemy import or_

    stmt = base.where(or_(*[DocumentChunk.content.ilike(f"%{w}%") for w in words])).limit(top_k)
    rows = (await db.execute(stmt)).all()
    return [{"path": doc.path, "chunk": chunk.content, "score": 0.0} for chunk, doc in rows]


def format_context(results: list[dict]) -> str:
    if not results:
        return ""
    parts = [f"[{r['path']}]\n{r['chunk']}" for r in results]
    return (
        "Contexto recuperado de las notas del vault del usuario "
        "(cita la ruta de la nota cuando la uses):\n\n" + "\n\n---\n\n".join(parts)
    )
