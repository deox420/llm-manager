# llm-manager

Servicio web self-hosted para **centralizar, administrar y crear LLMs y agentes de IA**: un único punto de acceso a múltiples proveedores (APIs comerciales y modelos locales), con gestión de usuarios, claves, costes y un constructor de agentes.

## Estado

🔬 **Fase de investigación.** El análisis del ecosistema, las alternativas evaluadas y la arquitectura propuesta están en:

➡️ [docs/investigacion-plataforma-llm.md](docs/investigacion-plataforma-llm.md)

## Resumen de la propuesta

Arquitectura en capas basada en estándares (API compatible con OpenAI + MCP para herramientas de agentes), con una ruta híbrida de implementación:

1. **Fase 1 — Centralización**: LiteLLM proxy + PostgreSQL + Redis vía Docker Compose (claves virtuales, presupuestos, routing a 100+ proveedores).
2. **Fase 2 — Panel propio**: webapp FastAPI + Next.js encima del gateway (administración, chat con streaming, usuarios y roles).
3. **Fase 3 — Agentes**: creación de agentes (system prompt, tools MCP, RAG con pgvector) expuestos como API.

Incluye integración con **Obsidian como segundo cerebro**: el vault actúa como herramienta MCP de los agentes, base de conocimiento RAG y fuente de configuración (agentes y proyectos definidos como notas Markdown con frontmatter, sincronizados vía git y agnósticos del modelo LLM).
