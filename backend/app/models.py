import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .config import get_settings
from .db import Base

EMBEDDING_DIM = get_settings().embedding_dim


def _uuid() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    name: Mapped[str] = mapped_column(String, default="")
    password_hash: Mapped[str] = mapped_column(String)
    role: Mapped[str] = mapped_column(String, default="user")  # admin | user
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Provider(Base):
    __tablename__ = "providers"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String, unique=True)
    kind: Mapped[str] = mapped_column(String)  # openai | anthropic | google | ollama | openai_compatible
    base_url: Mapped[str | None] = mapped_column(String, nullable=True)
    api_key_encrypted: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    models: Mapped[list["LLMModel"]] = relationship(back_populates="provider", cascade="all, delete-orphan")


class LLMModel(Base):
    __tablename__ = "models"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String, unique=True)  # nombre público en el catálogo
    provider_id: Mapped[str] = mapped_column(ForeignKey("providers.id", ondelete="CASCADE"))
    litellm_model: Mapped[str] = mapped_column(String)  # ej. "anthropic/claude-fable-5"
    input_cost_per_1k: Mapped[float] = mapped_column(Float, default=0.0)
    output_cost_per_1k: Mapped[float] = mapped_column(Float, default=0.0)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    provider: Mapped[Provider] = relationship(back_populates="models")


class VirtualKey(Base):
    __tablename__ = "virtual_keys"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String)
    key_hash: Mapped[str] = mapped_column(String, unique=True, index=True)
    key_prefix: Mapped[str] = mapped_column(String)  # primeros caracteres, para mostrar en la UI
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    budget_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String, unique=True)
    description: Mapped[str] = mapped_column(Text, default="")
    model: Mapped[str] = mapped_column(String)  # nombre del catálogo
    fallback_models: Mapped[list] = mapped_column(JSON, default=list)
    system_prompt: Mapped[str] = mapped_column(Text, default="")
    temperature: Mapped[float] = mapped_column(Float, default=0.7)
    tools: Mapped[list] = mapped_column(JSON, default=list)  # ["vault_search", "mcp:<server>"]
    rag_folders: Mapped[list] = mapped_column(JSON, default=list)
    source: Mapped[str] = mapped_column(String, default="db")  # db | vault
    vault_id: Mapped[str | None] = mapped_column(ForeignKey("vaults.id", ondelete="SET NULL"), nullable=True)
    vault_path: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String, default="Nueva conversación")
    model: Mapped[str | None] = mapped_column(String, nullable=True)
    agent_id: Mapped[str | None] = mapped_column(ForeignKey("agents.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan", order_by="Message.created_at"
    )


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    conversation_id: Mapped[str] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String)  # user | assistant | system | tool
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    conversation: Mapped[Conversation] = relationship(back_populates="messages")


class UsageLog(Base):
    __tablename__ = "usage_logs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    virtual_key_id: Mapped[str | None] = mapped_column(
        ForeignKey("virtual_keys.id", ondelete="SET NULL"), nullable=True
    )
    model: Mapped[str] = mapped_column(String)
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class Vault(Base):
    __tablename__ = "vaults"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String, unique=True)
    repo_url: Mapped[str] = mapped_column(String)
    branch: Mapped[str] = mapped_column(String, default="main")
    token_encrypted: Mapped[str | None] = mapped_column(String, nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    documents: Mapped[list["VaultDocument"]] = relationship(
        back_populates="vault", cascade="all, delete-orphan"
    )


class VaultDocument(Base):
    __tablename__ = "vault_documents"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    vault_id: Mapped[str] = mapped_column(ForeignKey("vaults.id", ondelete="CASCADE"), index=True)
    path: Mapped[str] = mapped_column(String, index=True)
    title: Mapped[str] = mapped_column(String, default="")
    content_hash: Mapped[str] = mapped_column(String, default="")
    frontmatter: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    vault: Mapped[Vault] = relationship(back_populates="documents")
    chunks: Mapped[list["DocumentChunk"]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    document_id: Mapped[str] = mapped_column(
        ForeignKey("vault_documents.id", ondelete="CASCADE"), index=True
    )
    chunk_index: Mapped[int] = mapped_column(Integer, default=0)
    content: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list | None] = mapped_column(Vector(EMBEDDING_DIM), nullable=True)

    document: Mapped[VaultDocument] = relationship(back_populates="chunks")
