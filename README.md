# llm-manager

Servicio web self-hosted para **centralizar, administrar y crear LLMs y agentes de IA**, con **Obsidian como segundo cerebro**: un único punto de acceso a múltiples proveedores (APIs comerciales y modelos locales), gestión de usuarios, claves virtuales con presupuesto, seguimiento de costes, agentes con herramientas MCP y RAG sobre tu vault.

## Características

- **Gateway compatible OpenAI** (`POST /v1/chat/completions`): un solo endpoint para 100+ proveedores vía LiteLLM (Anthropic, OpenAI, Google, Ollama, vLLM, cualquier API compatible). Streaming SSE incluido.
- **Administración**: usuarios con roles, proveedores con credenciales cifradas (Fernet), catálogo de modelos con precios, claves virtuales `sk-lm-...` con presupuesto y caducidad, y panel de uso/costes por modelo, día y usuario.
- **Agentes**: system prompt + modelo (con fallbacks) + herramientas (builtin y **MCP**) + RAG. Creables desde la UI o **como notas Markdown en tu vault de Obsidian** (frontmatter `type: agent`) — agnósticos del modelo: el mismo agente corre sobre Claude, GPT o un modelo local cambiando una línea.
- **Obsidian / segundo cerebro**: sincronización del vault vía git, indexado RAG (pgvector, con fallback a búsqueda de texto), búsqueda desde cualquier agente (`vault_search`) y write-back (los agentes pueden escribir notas con commit+push).
- **Chat web** con conversaciones persistentes, selector de modelo o agente y respuestas en streaming.

## Arranque rápido

```bash
cp .env.example .env
# 1) genera LLMM_ENCRYPTION_KEY:
#    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# 2) pon un LLMM_SECRET_KEY aleatorio
docker compose up -d --build
```

- Frontend: http://localhost:3000 — **el primer usuario registrado es admin**.
- API: http://localhost:8000 (salud en `/api/health`, OpenAPI en `/docs`).

Primeros pasos en la UI: **Admin → Proveedores** (añade p. ej. Anthropic con tu API key) → **Admin → Modelos** (p. ej. `claude-fable-5` → `anthropic/claude-fable-5`) → ya puedes chatear, crear claves virtuales y agentes.

Perfiles opcionales:

```bash
docker compose --profile local-llm up -d   # añade Ollama para modelos locales
docker compose --profile gateway up -d     # añade el proxy LiteLLM standalone en :4000
```

## Agentes como notas de Obsidian

Registra tu vault (repo git) en **Vaults** y pulsa *Sincronizar*. Cualquier nota con este frontmatter se convierte en un agente:

```markdown
---
type: agent
name: investigador
model: claude-fable-5
fallback_models: [gpt-5]
temperature: 0.4
tools: [vault_search]
rag_folders: [Proyectos/Investigacion]
---
Eres un investigador que responde citando las notas del vault.
```

## Estructura

```
backend/    FastAPI · gateway OpenAI · agentes · RAG (pgvector) · sync de vaults
frontend/   Next.js · chat · agentes · vaults · admin · uso
litellm/    config opcional del proxy LiteLLM standalone
docs/       investigación, contrato de API
```

- Contrato de API: [docs/api.md](docs/api.md)
- Investigación y arquitectura: [docs/investigacion-plataforma-llm.md](docs/investigacion-plataforma-llm.md)

## Desarrollo

```bash
# backend (necesita Postgres con pgvector y Redis; ver .env.example)
cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload
# tests
cd backend && python -m pytest tests/ -q
# frontend
cd frontend && npm install && npm run dev
```
