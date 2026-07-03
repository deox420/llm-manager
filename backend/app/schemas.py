from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field


# ---- Auth ----
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    name: str = ""


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class TokenOut(BaseModel):
    token: str
    user: UserOut


# ---- Catálogo / Admin ----
class ProviderIn(BaseModel):
    name: str
    kind: str
    base_url: str | None = None
    api_key: str | None = None


class ProviderPatch(BaseModel):
    name: str | None = None
    kind: str | None = None
    base_url: str | None = None
    api_key: str | None = None


class ProviderOut(BaseModel):
    id: str
    name: str
    kind: str
    base_url: str | None
    has_api_key: bool
    created_at: datetime


class ModelIn(BaseModel):
    name: str
    provider_id: str
    litellm_model: str
    input_cost_per_1k: float = 0.0
    output_cost_per_1k: float = 0.0
    enabled: bool = True


class ModelPatch(BaseModel):
    name: str | None = None
    provider_id: str | None = None
    litellm_model: str | None = None
    input_cost_per_1k: float | None = None
    output_cost_per_1k: float | None = None
    enabled: bool | None = None


class ModelOut(BaseModel):
    id: str
    name: str
    provider_id: str
    provider_name: str | None = None
    litellm_model: str
    input_cost_per_1k: float
    output_cost_per_1k: float
    enabled: bool


class CatalogModelOut(BaseModel):
    id: str
    name: str
    litellm_model: str
    provider_name: str
    input_cost_per_1k: float
    output_cost_per_1k: float


class KeyIn(BaseModel):
    name: str
    user_id: str | None = None
    budget_usd: float | None = None
    expires_at: datetime | None = None


class KeyPatch(BaseModel):
    name: str | None = None
    budget_usd: float | None = None
    expires_at: datetime | None = None
    is_active: bool | None = None


class KeyOut(BaseModel):
    id: str
    name: str
    key_prefix: str
    user_id: str | None
    budget_usd: float | None
    spent_usd: float = 0.0
    expires_at: datetime | None
    is_active: bool
    created_at: datetime


class KeyCreatedOut(KeyOut):
    key: str


class UserPatch(BaseModel):
    role: str | None = None
    is_active: bool | None = None


# ---- Agentes ----
class AgentIn(BaseModel):
    name: str
    description: str = ""
    model: str
    fallback_models: list[str] = []
    system_prompt: str = ""
    temperature: float = 0.7
    tools: list[str] = []
    rag_folders: list[str] = []


class AgentPatch(BaseModel):
    name: str | None = None
    description: str | None = None
    model: str | None = None
    fallback_models: list[str] | None = None
    system_prompt: str | None = None
    temperature: float | None = None
    tools: list[str] | None = None
    rag_folders: list[str] | None = None


class AgentOut(BaseModel):
    id: str
    name: str
    description: str
    model: str
    fallback_models: list
    system_prompt: str
    temperature: float
    tools: list
    rag_folders: list
    source: str
    vault_id: str | None
    vault_path: str | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AgentChatIn(BaseModel):
    messages: list[dict[str, Any]]
    stream: bool = False


# ---- Conversaciones ----
class ConversationIn(BaseModel):
    title: str | None = None
    model: str | None = None
    agent_id: str | None = None


class MessageOut(BaseModel):
    id: str
    role: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True


class ConversationOut(BaseModel):
    id: str
    title: str
    model: str | None
    agent_id: str | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ConversationDetailOut(ConversationOut):
    messages: list[MessageOut] = []


class SendMessageIn(BaseModel):
    content: str


# ---- Vaults ----
class VaultIn(BaseModel):
    name: str
    repo_url: str
    branch: str = "main"
    token: str | None = None


class VaultOut(BaseModel):
    id: str
    name: str
    repo_url: str
    branch: str
    last_synced_at: datetime | None
    created_at: datetime

    class Config:
        from_attributes = True


class VaultSyncOut(BaseModel):
    documents_indexed: int
    agents_synced: int
    errors: list[str] = []


class VaultDocumentOut(BaseModel):
    id: str
    path: str
    title: str
    updated_at: datetime

    class Config:
        from_attributes = True


class VaultNoteIn(BaseModel):
    path: str
    content: str
    message: str | None = None


# ---- RAG ----
class RagSearchIn(BaseModel):
    query: str
    vault_id: str | None = None
    folders: list[str] = []
    top_k: int = 5


class RagResultOut(BaseModel):
    path: str
    chunk: str
    score: float
