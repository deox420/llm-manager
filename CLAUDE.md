# llm-manager

Servicio web self-hosted para centralizar, administrar y crear LLMs y agentes de IA, con Obsidian como "segundo cerebro" (vault git sincronizado, agentes definidos como notas Markdown, RAG sobre el vault).

## Arquitectura

- `backend/` — FastAPI (Python 3.12, async). Es el gateway: expone `POST /v1/chat/completions` compatible con OpenAI y enruta a cualquier proveedor usando **LiteLLM como librería** (no como proxy). Credenciales de proveedores cifradas en BD (Fernet). Claves virtuales con presupuesto. Agentes, RAG (pgvector) y sync de vaults Obsidian (git).
- `frontend/` — Next.js (App Router, TypeScript, Tailwind). Chat con streaming SSE, panel de administración, agentes, uso/costes.
- `litellm/` — config opcional del proxy LiteLLM standalone (perfil `gateway` de compose); el backend NO depende de él.
- `docs/` — investigación (`investigacion-plataforma-llm.md`), arquitectura (`arquitectura.md`) y contrato de API (`api.md`).

## Comandos

- Levantar todo: `cp .env.example .env` (editar claves) y `docker compose up -d --build`
- Backend en local: `cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload` (necesita Postgres con pgvector y Redis; ver `.env.example`)
- Tests backend: `cd backend && python -m pytest tests/ -q` (tests unitarios puros, no requieren BD)
- Frontend en local: `cd frontend && npm install && npm run dev` (`NEXT_PUBLIC_API_URL` apunta al backend)

## Convenciones

- El contrato de API vive en `docs/api.md`; frontend y backend deben mantenerse consistentes con él. Si cambias un endpoint, actualiza el contrato.
- Formato OpenAI en todo lo que sea inferencia (`/v1/chat/completions`, SSE con `data: {...}` y `data: [DONE]`).
- Los agentes se guardan como datos (fila en `agents`), nunca acoplados a un framework de ejecución. `source` distingue `db` (creados en UI) de `vault` (definidos como nota Markdown con frontmatter `type: agent`).
- Esquema de BD por `create_all` en startup (sin Alembic todavía); si añades una migración destructiva, documenta cómo aplicarla.
- Español en docs y UI; código e identificadores en inglés.

## Estado / pendientes conocidos

- Ejecución de tools MCP: implementada para servidores stdio en `backend/app/services/mcp_client.py`, marcada experimental.
- Embeddings opcionales: si `EMBEDDING_MODEL` no está configurado, el RAG cae a búsqueda de texto (ILIKE).
