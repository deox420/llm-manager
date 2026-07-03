# Contrato de API — llm-manager backend

Base: el backend sirve en `:8000`. Autenticación: JWT Bearer (`Authorization: Bearer <token>`) salvo donde se indique. Errores: JSON `{"detail": "..."}` con códigos HTTP estándar.

## Auth

| Método | Ruta | Body | Respuesta |
|---|---|---|---|
| POST | `/api/auth/register` | `{email, password, name}` | `{token, user}` — el **primer** usuario registrado es `admin` |
| POST | `/api/auth/login` | `{email, password}` | `{token, user}` |
| GET | `/api/auth/me` | — | `user` |

`user = {id, email, name, role: "admin"|"user", is_active, created_at}`

## Catálogo (usuario autenticado)

| GET | `/api/models` | → `[{id, name, litellm_model, provider_name, input_cost_per_1k, output_cost_per_1k}]` (solo habilitados) |
|---|---|---|

## Chat compatible OpenAI

`POST /v1/chat/completions` — Bearer JWT **o** clave virtual (`sk-lm-...`).

Body formato OpenAI: `{model, messages, stream?, temperature?, max_tokens?, tools?}`. `model` es el `name` del catálogo.

- `stream: false` → respuesta OpenAI estándar con `usage`.
- `stream: true` → SSE: líneas `data: {chunk OpenAI}` y final `data: [DONE]`.

Registra uso y coste en `usage_logs`; si la clave virtual tiene presupuesto agotado → `402`.

## Conversaciones (persistencia del chat de la UI)

| GET | `/api/conversations` | → `[{id, title, model, agent_id, created_at, updated_at}]` |
|---|---|---|
| POST | `/api/conversations` | `{title?, model?, agent_id?}` → conversación |
| GET | `/api/conversations/{id}` | → `{...conversación, messages: [{id, role, content, created_at}]}` |
| POST | `/api/conversations/{id}/messages` | `{content}` → **SSE** con la respuesta del asistente (guarda ambos mensajes). Usa el `model` o `agent_id` de la conversación. |
| DELETE | `/api/conversations/{id}` | → `204` |

## Agentes

`agent = {id, name, description, model, fallback_models: [], system_prompt, temperature, tools: [], rag_folders: [], source: "db"|"vault", vault_id?, vault_path?, created_at, updated_at}`

| GET/POST | `/api/agents` | CRUD (POST solo campos editables; `source` siempre `db` al crear por API) |
|---|---|---|
| GET/PATCH/DELETE | `/api/agents/{id}` | Los de `source: "vault"` no se editan por API (409) — se editan en la nota |
| POST | `/api/agents/{id}/chat` | `{messages: [{role, content}], stream?}` → SSE u objeto OpenAI. Aplica system_prompt, RAG y tools del agente. |

## Vaults (Obsidian)

| GET/POST | `/api/vaults` | `{name, repo_url, branch?, token?}` (token write-only, cifrado) |
|---|---|---|
| POST | `/api/vaults/{id}/sync` | → `{documents_indexed, agents_synced, errors: []}` — pull + reindex + upsert de agentes `Agents/*.md` |
| GET | `/api/vaults/{id}/documents` | → `[{id, path, title, updated_at}]` |
| POST | `/api/vaults/{id}/notes` | `{path, content, message?}` → escribe la nota, commit y push (write-back) |
| DELETE | `/api/vaults/{id}` | → `204` |

## RAG

| POST | `/api/rag/search` | `{query, vault_id?, folders?: [], top_k?: 5}` → `[{path, chunk, score}]` |
|---|---|---|

## Admin (rol `admin`)

| GET/POST, PATCH/DELETE `/{id}` | `/api/admin/providers` | `{name, kind: "openai"|"anthropic"|"google"|"ollama"|"openai_compatible", base_url?, api_key?}` — `api_key` write-only |
|---|---|---|
| GET/POST, PATCH/DELETE `/{id}` | `/api/admin/models` | `{name, provider_id, litellm_model, input_cost_per_1k, output_cost_per_1k, enabled}` |
| GET/POST, PATCH/DELETE `/{id}` | `/api/admin/keys` | `{name, user_id?, budget_usd?, expires_at?}` → al crear devuelve `{key: "sk-lm-..."}` **una sola vez**; GET devuelve `{..., spent_usd}` |
| GET, PATCH `/{id}` | `/api/admin/users` | PATCH `{role?, is_active?}` |

## Uso

| GET | `/api/usage/summary?days=30` | → `{total_usd, total_tokens, by_model: [{model, requests, tokens, usd}], by_day: [{date, usd, tokens}], by_user: [{user, usd}] (solo admin)}` |
|---|---|---|

## Salud

| GET | `/api/health` | → `{status: "ok", version}` |
|---|---|---|
