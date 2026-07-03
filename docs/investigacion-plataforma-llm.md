# Investigación: servicio web para centralizar, administrar y crear LLMs y agentes de IA

> Fecha: julio 2026 · Estado: investigación inicial para el proyecto **llm-manager**

## 1. Objetivo

Definir cómo construir (o ensamblar) un servicio desplegable en web que permita:

- **Centralizar** el acceso a múltiples LLMs (APIs comerciales como Anthropic/OpenAI/Google y modelos locales como Llama/Mistral vía Ollama o vLLM) detrás de un único punto de entrada.
- **Administrar** usuarios, claves de API, costes/presupuestos, límites de uso, logs y observabilidad.
- **Crear** agentes de IA (prompts de sistema, herramientas/tools, RAG sobre documentos, flujos multi-paso) y exponerlos como API o interfaz de chat.

## 2. Conclusión ejecutiva

El patrón estándar de la industria en 2026 separa el problema en **cuatro capas**, cada una con soluciones open-source maduras:

| Capa | Función | Opciones líderes |
|---|---|---|
| **Gateway LLM** | API unificada (formato OpenAI) hacia 100+ proveedores, con claves virtuales, presupuestos, routing y fallbacks | [LiteLLM](https://github.com/BerriAI/litellm), [Bifrost](https://www.getmaxim.ai/articles/5-best-open-source-llm-gateways-for-self-hosted-deployments-in-2026/), [Helicone](https://www.helicone.ai/blog/open-webui-alternatives), Kong AI Gateway |
| **Inferencia local** (opcional) | Servir modelos open-weight en tu hardware | Ollama (desarrollo / pocos usuarios), [vLLM](https://www.sitepoint.com/the-2026-definitive-guide-to-running-local-llms-in-production/) (producción multi-usuario, GPU) |
| **Constructor de agentes** | Crear agentes/flujos con RAG, tools y publicarlos como API | [Dify](https://blog.elest.io/dify-vs-langflow-vs-flowise-which-open-source-llm-app-builder-actually-ships-to-production/), Flowise, Langflow |
| **Interfaz de usuario** | Chat multi-modelo, gestión de usuarios y workspaces | [Open WebUI](https://toolhalla.ai/blog/open-webui-vs-anythingllm-vs-librechat-2026), LibreChat, AnythingLLM |

El pegamento entre capas son dos estándares de facto:

- **API compatible con OpenAI** (`/v1/chat/completions`): cualquier cliente habla "OpenAI" y el gateway traduce al proveedor real.
- **MCP (Model Context Protocol)**: estándar para conectar agentes con herramientas externas (GitHub, bases de datos, sistemas de archivos…). LiteLLM y los frameworks de agentes actuales ya lo soportan de forma nativa.

Hay tres rutas posibles (detalladas en §5): **ensamblar** piezas existentes con Docker Compose (días), **construir** una webapp propia sobre esas piezas (semanas, control total — encaja con el nombre de este repo), o un **híbrido** que es lo recomendado: empezar ensamblando y desarrollar el panel propio encima del gateway.

## 3. Análisis por capa

### 3.1 Gateway LLM (la pieza central para "centralizar")

Un gateway es un proxy que expone una única API estilo OpenAI y por detrás enruta a cualquier proveedor. Es la pieza que resuelve la centralización y gran parte de la administración:

- **LiteLLM** (Python, MIT + módulos enterprise): el más adoptado. Proxy self-hosted con claves virtuales por usuario/equipo, tracking de gasto, presupuestos, rate limits, load balancing, fallbacks entre proveedores, guardrails y logging. Se administra vía UI de admin y API. Soporta 100+ proveedores, incluidos Ollama y vLLM locales. También es usable como **librería Python** dentro de tu propia app.
- **Bifrost** (Go, Apache 2.0): alternativa reciente enfocada a rendimiento y gobernanza (claves virtuales, presupuestos, audit logs, gateway MCP). Arranque con `npx` o Docker/Kubernetes.
- **Helicone**: gateway + observabilidad (logs, costes, trazas) en una sola pieza.
- **Kong AI Gateway**: para quien ya opera Kong; enfoque enterprise (SSO, redacción de PII).

**Recomendación**: LiteLLM. Es open-source, self-hosted, con la comunidad más grande, y su doble naturaleza (proxy standalone *o* librería) da flexibilidad para las rutas B y C de §5.

### 3.2 Inferencia local (si quieres servir tus propios modelos)

- **Ollama**: instalación trivial, ideal para desarrollo o equipos pequeños. Basado en llama.cpp.
- **vLLM**: para producción compartida. Su *PagedAttention* y *continuous batching* aprovechan mucho mejor la GPU con múltiples usuarios concurrentes; las versiones 2025-2026 añaden arquitectura prefill/decode desagregada.

Ambos exponen API compatible con OpenAI, así que se registran en el gateway como un proveedor más. Esta capa es opcional: puedes lanzar solo con APIs comerciales y añadir modelos locales después sin cambiar nada del resto.

### 3.3 Constructores de agentes

- **Dify** (el más completo): plataforma full-stack con backend, base de datos, panel de administración, gestión de modelos y prompts, RAG integrado, y publicación de cada agente como API o webapp. Self-hosted sin limitaciones relevantes. Para la mayoría de equipos es el mejor punto de partida.
- **Flowise**: el más simple; nodos drag-and-drop sobre LangChain. Ideal para "chatbot con RAG" rápido.
- **Langflow**: IDE visual sobre LangChain/LangGraph con nodos Python custom; el que menos se queda corto al crecer, respaldado por DataStax.

Si en vez de low-code prefieres agentes **como código** (para la ruta B), los frameworks actuales relevantes son LangGraph, el **Claude Agent SDK** (Anthropic) y Pydantic AI, todos con soporte MCP.

### 3.4 Interfaz de chat / administración

- **Open WebUI** (~124K estrellas, MIT): la gestión multi-usuario más madura (roles admin/user/pending, grupos), frontend ideal para Ollama, extensible con tools, functions y pipelines en Python.
- **LibreChat**: el mejor para multi-proveedor (cambiar entre Claude/GPT/Gemini/locales en una conversación), auth empresarial (LDAP, OAuth) y tracking de tokens por usuario.
- **AnythingLLM**: centrado en RAG por workspaces; multi-usuario más limitado.

## 4. Estándares que conviene adoptar desde el día 1

1. **Formato OpenAI en toda la plataforma**: cualquier UI, SDK o integración existente funcionará contra tu servicio sin adaptadores.
2. **MCP para herramientas de agentes**: en lugar de inventar un sistema de plugins propio, los agentes consumen servidores MCP (oficiales o propios). Esto da acceso inmediato a un ecosistema enorme de integraciones.
3. **Claves virtuales**: los usuarios nunca ven las claves reales de los proveedores; reciben claves emitidas por la plataforma con presupuesto y permisos asociados.

## 5. Rutas de implementación

### Ruta A — Ensamblar (1-3 días, sin código propio)

Docker Compose con piezas existentes:

```
[Open WebUI o LibreChat]  ──►  [LiteLLM proxy]  ──►  APIs comerciales
[Dify (agentes + RAG)]    ──►       │           ──►  [Ollama / vLLM local]
                              [PostgreSQL]  [Redis]
```

- ✅ Cubre el 90% del objetivo sin escribir código; todo es open-source y self-hosted.
- ❌ La experiencia queda repartida entre 2-3 UIs distintas; personalización limitada.

### Ruta B — Construir webapp propia (4-8 semanas para un MVP sólido)

Stack recomendado si el objetivo del repo es desarrollar un producto propio:

| Componente | Elección | Por qué |
|---|---|---|
| Backend/API | **FastAPI** (Python) | Async nativo, streaming SSE trivial, tipado con Pydantic, y acceso directo al ecosistema IA en Python |
| Núcleo LLM | **LiteLLM como librería** | 100+ proveedores resueltos; no reimplementas routing ni traducción de APIs |
| Agentes | **LangGraph** o **Claude Agent SDK** + **MCP** para tools | Agentes definidos como grafos/config almacenables en BD |
| Base de datos | **PostgreSQL** (+ **pgvector** para RAG) | Un solo motor para datos relacionales y embeddings |
| Cola/caché | **Redis** | Rate limiting, caché de respuestas, tareas en background |
| Frontend | **Next.js/React** + Tailwind | SPA de administración + chat con streaming |
| Auth | JWT + OAuth (o **Keycloak** si hace falta SSO) | Multi-usuario con roles desde el inicio |
| Despliegue | **Docker Compose** (VPS) → Kubernetes si escala | Reproducible en cualquier proveedor |

Modelo de datos mínimo: `users`, `providers` (credenciales cifradas), `models` (catálogo + precios), `virtual_keys` (presupuesto, permisos), `agents` (system prompt, modelo, tools MCP, config RAG), `conversations`/`messages`, `usage_logs` (tokens y coste por request), `documents`/`chunks` (RAG).

Endpoints clave: `POST /v1/chat/completions` (compatible OpenAI, con clave virtual), CRUD de `/admin/providers|models|keys|users`, CRUD de `/agents` + `POST /agents/{id}/chat`, `GET /usage`.

### Ruta C — Híbrido (recomendada) ⭐

1. **Fase 1**: desplegar LiteLLM proxy + PostgreSQL + Redis (+ Ollama opcional) con Docker Compose. Con esto ya hay centralización, claves virtuales y control de gasto funcionando.
2. **Fase 2**: construir la webapp propia (FastAPI + Next.js) **encima** del proxy: panel de administración a medida, chat propio, gestión de usuarios. La app habla con LiteLLM por su API de admin y su endpoint OpenAI.
3. **Fase 3**: añadir el constructor de agentes propio (agentes en BD + ejecución con LangGraph/Agent SDK + tools MCP + RAG con pgvector), y exponer cada agente como endpoint API.

Ventaja: valor desde la primera semana, y el desarrollo propio se concentra donde de verdad diferencia (UX de administración y creación de agentes) en lugar de reimplementar el routing de LLMs, que es un problema ya resuelto.

## 6. Despliegue

- **VPS con Docker Compose** (Hetzner, Contabo, DigitalOcean…): la opción más simple y barata para self-hosted; suficiente hasta cientos de usuarios. GPU solo si sirves modelos locales con vLLM.
- **PaaS** (Railway, Render, Fly.io) o **Vercel + Supabase** para frontend/BD gestionados si se prefiere menos operación.
- **Kubernetes**: solo cuando haya necesidad real de escala; tanto LiteLLM como Bifrost y vLLM publican imágenes/charts oficiales.
- Añadir desde el inicio: HTTPS (Caddy/Traefik con certificados automáticos), backups de PostgreSQL, y observabilidad (los logs de uso del gateway + Langfuse u OpenTelemetry para trazas de LLM).

## 7. Riesgos y consideraciones

- **Seguridad de credenciales**: cifrar las claves de proveedores en BD; nunca exponerlas al frontend.
- **Costes descontrolados**: presupuestos y rate limits por clave virtual desde el día 1 (LiteLLM lo trae de serie).
- **Streaming**: toda la cadena (gateway → backend → frontend) debe soportar SSE; diseñarlo desde el principio.
- **Lock-in de frameworks de agentes**: guardar la definición de agentes como datos (prompt, modelo, tools) y no acoplada al framework de ejecución, para poder cambiar de motor.

## 8. Integración con Obsidian: el "segundo cerebro" de la plataforma

Obsidian encaja en la arquitectura de forma natural porque su formato es Markdown plano (sin base de datos propietaria) y porque ya existe un ecosistema MCP maduro a su alrededor. La integración tiene **cuatro roles complementarios**:

### 8.1 El vault como herramienta de los agentes (MCP)

Los agentes de la plataforma pueden leer, buscar, crear y editar notas del vault como una herramienta MCP más — exactamente el estándar ya elegido en §4. Opciones:

- **[Obsidian Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api)**: plugin que expone una API REST segura **con servidor MCP integrado en `/mcp/`**. Requiere Obsidian abierto; a cambio, Obsidian media todas las operaciones (respeta links, templates, etc.).
- **[obsidian-mcp-server (cyanheads)](https://github.com/cyanheads/obsidian-mcp-server)** o **[mcp-obsidian](https://github.com/MarkusPfundstein/mcp-obsidian)**: servidores MCP con operaciones de lectura/escritura/búsqueda (BM25), frontmatter y tags, vía STDIO o HTTP streamable.
- **Servidores MCP de sistema de archivos**: leen el Markdown directamente de disco, sin necesidad de que Obsidian esté abierto — la opción correcta para el lado servidor (§8.4).

### 8.2 El vault como base de conocimiento (RAG)

El vault se indexa en **pgvector** (la misma BD de la Fase 3) y cualquier agente puede hacer RAG sobre él: "responde usando mis notas". Pipeline: watcher/sync de archivos → chunking por nota/encabezado → embeddings → pgvector, con metadatos de frontmatter y wikilinks como señales de relevancia. Dentro de Obsidian, plugins como Smart Connections ofrecen esto en local, pero llevarlo a la plataforma lo hace accesible desde cualquier interfaz y agente.

### 8.3 El vault como fuente de configuración: **agentes como notas Markdown**

Esta es la pieza que resuelve "sincronizar agentes para diferentes LLMs": definir cada agente como una nota con frontmatter YAML en una carpeta `Agents/` del vault:

```markdown
---
type: agent
name: investigador
model: claude-fable-5        # o cualquier modelo del gateway; cambiable por nota
fallback_models: [gpt-5, llama-4-70b]
tools: [obsidian-vault, web-search]
rag_folders: [Proyectos/Investigacion]
temperature: 0.4
---
Eres un investigador que responde siempre citando las notas del vault...
```

llm-manager sincroniza esa carpeta y registra/actualiza los agentes automáticamente. Como la definición es **agnóstica del modelo** (el gateway resuelve `model` contra cualquier proveedor), el mismo agente corre sobre Claude, GPT o un modelo local cambiando una línea — y versionado junto al resto del conocimiento. Los proyectos siguen el mismo patrón: una carpeta `Proyectos/X/` con frontmatter que declara qué agentes y qué contexto RAG usa.

### 8.4 Sincronización vault ↔ servidor

Obsidian es local y la plataforma es un servicio web, así que hace falta un mecanismo de sync:

| Mecanismo | Cómo | Cuándo usarlo |
|---|---|---|
| **Git (plugin obsidian-git)** ⭐ | El vault es un repo; el servidor hace pull (webhook o polling) y reindexa los cambios | Recomendado: versionado, funciona con el servidor siempre encendido, multi-dispositivo |
| **Syncthing** | Réplica continua del vault en el servidor | Sync en tiempo casi real sin ciclo commit/push |
| **Local REST API + túnel** (Tailscale/Cloudflare) | El servidor llama al Obsidian del usuario en vivo | Acciones interactivas cuando el equipo del usuario está encendido |
| Obsidian Sync (oficial) | Propietario, **sin API** | No sirve para integración con servidor |

Diseño recomendado: **git como canal principal** (el servidor mantiene una réplica del vault, la indexa y escribe en ella los resultados de los agentes — resúmenes, notas de proyecto, logs de conversaciones — que vuelven al usuario en el siguiente pull), con Local REST API opcional para operaciones en vivo. La escritura de los agentes hacia el vault sigue el patrón "LLM Wiki" de Karpathy (compilar conocimiento en notas interconectadas y mantenerlas al día), popularizado por proyectos como [claude-obsidian](https://github.com/AgriciDaniel/claude-obsidian) y [obsidian-second-brain](https://github.com/eugeniughelbur/obsidian-second-brain).

### 8.5 Impacto en el plan de fases

- **Fase 2** añade: réplica git del vault + indexado RAG en pgvector + servidor MCP de vault (filesystem) registrado en la plataforma.
- **Fase 3** añade: sync bidireccional de `Agents/` y `Proyectos/` (notas → agentes registrados) y write-back de resultados al vault.
- Modelo de datos: se añaden tablas `vaults` (repo, credenciales, estado de sync) y `vault_documents` (ruta, hash, frontmatter, chunks→pgvector); `agents` gana una columna `source` (`db` | `vault`) para distinguir agentes creados en la UI de los definidos en notas.

## 9. Fuentes

- [5 Best Open-Source LLM Gateways for Self-Hosted Deployments in 2026 — Maxim AI](https://www.getmaxim.ai/articles/5-best-open-source-llm-gateways-for-self-hosted-deployments-in-2026/)
- [LiteLLM — GitHub](https://github.com/BerriAI/litellm) · [Docs](https://docs.litellm.ai/docs/)
- [Best LLM Gateways in 2026: Top LiteLLM Alternatives — Contabo](https://contabo.com/blog/best-llm-gateways/)
- [Comparing Open Source LLM Gateways: LiteLLM, Portkey, Kong — OpenZiti](https://blog.openziti.io/comparing-open-source-llm-gateways)
- [Dify vs Langflow vs Flowise: Which Open-Source LLM App Builder Actually Ships to Production? — Elestio](https://blog.elest.io/dify-vs-langflow-vs-flowise-which-open-source-llm-app-builder-actually-ships-to-production/)
- [Dify vs Flowise vs Langflow (2026) — ToolHalla](https://toolhalla.ai/blog/dify-vs-flowise-vs-langflow-2026)
- [Open WebUI vs AnythingLLM vs LibreChat (2026) — ToolHalla](https://toolhalla.ai/blog/open-webui-vs-anythingllm-vs-librechat-2026)
- [LibreChat vs Open WebUI — Portkey](https://portkey.ai/blog/librechat-vs-openwebui/)
- [Decoupling the AI Stack: How to Architect a Production-Grade Local LLM System — DEV](https://dev.to/chnghia/decoupling-the-ai-stack-how-to-architect-a-production-grade-local-llm-system-1a0c)
- [The 2026 Definitive Guide to Running Local LLMs in Production — SitePoint](https://www.sitepoint.com/the-2026-definitive-guide-to-running-local-llms-in-production/)
- [LLM Orchestration in 2026: Top 22 frameworks and gateways — AIMultiple](https://aimultiple.com/llm-orchestration)
- [Awesome-LLMOps — GitHub](https://github.com/tensorchord/Awesome-LLMOps)
- [Obsidian Local REST API (con servidor MCP integrado) — GitHub](https://github.com/coddingtonbear/obsidian-local-rest-api)
- [obsidian-mcp-server (cyanheads) — GitHub](https://github.com/cyanheads/obsidian-mcp-server)
- [mcp-obsidian (MarkusPfundstein) — GitHub](https://github.com/MarkusPfundstein/mcp-obsidian)
- [Obsidian MCP Setup 2026: Local REST API Complete Guide — MCP.Directory](https://mcp.directory/blog/obsidian-mcp-complete-guide-2026)
- [Obsidian AI Second Brain: Complete Guide (2026) — NxCode](https://www.nxcode.io/resources/news/obsidian-ai-second-brain-complete-guide-2026)
- [claude-obsidian: self-organizing AI second brain — GitHub](https://github.com/AgriciDaniel/claude-obsidian)
- [obsidian-second-brain: cross-CLI vault skill — GitHub](https://github.com/eugeniughelbur/obsidian-second-brain)
- [Build a Local AI Second Brain With Obsidian & Ollama — Vucense](https://vucense.com/ai-intelligence/local-llms/how-to-build-a-second-brain-powered-by-local-ai/)
