from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "llm-manager"
    version: str = "0.1.0"

    database_url: str = "postgresql+asyncpg://llm:llm@localhost:5432/llm_manager"
    redis_url: str = "redis://localhost:6379/0"

    # JWT
    secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7

    # Fernet key (base64, 32 bytes) para cifrar credenciales de proveedores y tokens de vault.
    # Generar con: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    encryption_key: str = ""

    # Embeddings para RAG. Vacío => el RAG cae a búsqueda de texto.
    embedding_model: str = ""
    embedding_dim: int = 1536

    # Directorio donde se clonan las réplicas de los vaults
    vault_data_dir: str = "/data/vaults"

    # Config de servidores MCP (JSON: {"nombre": {"command": "...", "args": [...], "env": {}}})
    mcp_servers_file: str = ""

    cors_origins: str = "http://localhost:3000"

    class Config:
        env_prefix = "LLMM_"
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
