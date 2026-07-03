export interface User {
  id: number;
  email: string;
  name: string;
  role: "admin" | "user";
  is_active: boolean;
  created_at: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface CatalogModel {
  id: number;
  name: string;
  litellm_model: string;
  provider_name: string;
  input_cost_per_1k: number;
  output_cost_per_1k: number;
}

export interface Conversation {
  id: number;
  title: string | null;
  model: string | null;
  agent_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

export interface ConversationDetail extends Conversation {
  messages: Message[];
}

export interface Agent {
  id: number;
  name: string;
  description: string | null;
  model: string;
  fallback_models: string[];
  system_prompt: string | null;
  temperature: number | null;
  tools: string[];
  rag_folders: string[];
  source: "db" | "vault";
  vault_id: number | null;
  vault_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface Vault {
  id: number;
  name: string;
  repo_url: string;
  branch: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface VaultDocument {
  id: number;
  path: string;
  title: string | null;
  updated_at: string;
}

export interface SyncReport {
  documents_indexed: number;
  agents_synced: number;
  errors: string[];
}

export interface Provider {
  id: number;
  name: string;
  kind: "openai" | "anthropic" | "google" | "ollama" | "openai_compatible";
  base_url: string | null;
}

export interface AdminModel {
  id: number;
  name: string;
  provider_id: number;
  litellm_model: string;
  input_cost_per_1k: number;
  output_cost_per_1k: number;
  enabled: boolean;
}

export interface VirtualKey {
  id: number;
  name: string;
  user_id: number | null;
  budget_usd: number | null;
  expires_at: string | null;
  spent_usd: number;
  created_at?: string;
}

export interface CreatedKey extends VirtualKey {
  key: string;
}

export interface UsageSummary {
  total_usd: number;
  total_tokens: number;
  by_model: { model: string; requests: number; tokens: number; usd: number }[];
  by_day: { date: string; usd: number; tokens: number }[];
  by_user?: { user: string; usd: number }[];
}
