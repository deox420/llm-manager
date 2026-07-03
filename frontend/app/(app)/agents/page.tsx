"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Agent, CatalogModel } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  ErrorBox,
  Input,
  Label,
  Select,
  Spinner,
  Textarea,
} from "@/components/ui";

interface AgentFormState {
  name: string;
  description: string;
  model: string;
  system_prompt: string;
  temperature: string;
  tools: string;
  rag_folders: string;
}

const EMPTY_FORM: AgentFormState = {
  name: "",
  description: "",
  model: "",
  system_prompt: "",
  temperature: "0.7",
  tools: "",
  rag_folders: "",
};

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function AgentForm({
  initial,
  models,
  editing,
  onSaved,
  onCancel,
}: {
  initial: AgentFormState;
  models: CatalogModel[];
  editing: Agent | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<AgentFormState>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof AgentFormState>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const payload = {
      name: form.name,
      description: form.description || null,
      model: form.model,
      system_prompt: form.system_prompt || null,
      temperature: form.temperature === "" ? null : Number(form.temperature),
      tools: splitList(form.tools),
      rag_folders: splitList(form.rag_folders),
    };
    try {
      if (editing) {
        await api<Agent>(`/api/agents/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await api<Agent>("/api/agents", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar el agente");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-4 text-base font-semibold">
        {editing ? `Editar agente: ${editing.name}` : "Nuevo agente"}
      </h2>
      <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
        <div>
          <Label>Nombre</Label>
          <Input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            required
            placeholder="Nombre del agente"
          />
        </div>
        <div>
          <Label>Modelo</Label>
          <Select
            value={form.model}
            onChange={(e) => set("model", e.target.value)}
            required
          >
            <option value="" disabled>
              Selecciona un modelo
            </option>
            {models.map((m) => (
              <option key={m.id} value={m.name}>
                {m.name} · {m.provider_name}
              </option>
            ))}
          </Select>
        </div>
        <div className="md:col-span-2">
          <Label>Descripción</Label>
          <Input
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="¿Qué hace este agente?"
          />
        </div>
        <div className="md:col-span-2">
          <Label>System prompt</Label>
          <Textarea
            rows={5}
            value={form.system_prompt}
            onChange={(e) => set("system_prompt", e.target.value)}
            placeholder="Instrucciones del agente…"
          />
        </div>
        <div>
          <Label>Temperatura</Label>
          <Input
            type="number"
            step="0.1"
            min="0"
            max="2"
            value={form.temperature}
            onChange={(e) => set("temperature", e.target.value)}
          />
        </div>
        <div>
          <Label>Tools (separadas por comas)</Label>
          <Input
            value={form.tools}
            onChange={(e) => set("tools", e.target.value)}
            placeholder="web_search, calculator"
          />
        </div>
        <div className="md:col-span-2">
          <Label>Carpetas RAG (separadas por comas)</Label>
          <Input
            value={form.rag_folders}
            onChange={(e) => set("rag_folders", e.target.value)}
            placeholder="Notas/Proyectos, Referencias"
          />
        </div>
        <div className="flex gap-2 md:col-span-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear agente"}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
        {error && (
          <div className="md:col-span-2">
            <ErrorBox message={error} />
          </div>
        )}
      </form>
    </Card>
  );
}

export default function AgentsPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [models, setModels] = useState<CatalogModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Agent | null>(null);

  const load = useCallback(async () => {
    try {
      const [agentList, modelList] = await Promise.all([
        api<Agent[]>("/api/agents"),
        api<CatalogModel[]>("/api/models"),
      ]);
      setAgents(agentList);
      setModels(modelList);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar agentes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(agent: Agent) {
    if (!confirm(`¿Eliminar el agente "${agent.name}"?`)) return;
    try {
      await api<void>(`/api/agents/${agent.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar");
    }
  }

  function startEdit(agent: Agent) {
    setEditing(agent);
    setShowForm(true);
  }

  const formInitial: AgentFormState = editing
    ? {
        name: editing.name,
        description: editing.description ?? "",
        model: editing.model,
        system_prompt: editing.system_prompt ?? "",
        temperature: editing.temperature?.toString() ?? "",
        tools: editing.tools.join(", "),
        rag_folders: editing.rag_folders.join(", "),
      }
    : EMPTY_FORM;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Agentes</h1>
          {!showForm && (
            <Button
              onClick={() => {
                setEditing(null);
                setShowForm(true);
              }}
            >
              + Nuevo agente
            </Button>
          )}
        </div>
        <ErrorBox message={error} />
        {showForm && (
          <AgentForm
            key={editing?.id ?? "new"}
            initial={formInitial}
            models={models}
            editing={editing}
            onSaved={() => {
              setShowForm(false);
              setEditing(null);
              load();
            }}
            onCancel={() => {
              setShowForm(false);
              setEditing(null);
            }}
          />
        )}
        {loading ? (
          <Spinner />
        ) : agents.length === 0 ? (
          <Card>
            <p className="text-sm text-zinc-400">
              No hay agentes todavía. Crea uno con el botón de arriba o define
              notas con <code>type: agent</code> en tu vault de Obsidian.
            </p>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {agents.map((agent) => {
              const isVault = agent.source === "vault";
              return (
                <Card key={agent.id} className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-base font-semibold">{agent.name}</h2>
                    {isVault && <Badge color="amber">Vault</Badge>}
                  </div>
                  {agent.description && (
                    <p className="text-sm text-zinc-400">{agent.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    <Badge color="indigo">{agent.model}</Badge>
                    {agent.temperature != null && (
                      <Badge color="zinc">temp {agent.temperature}</Badge>
                    )}
                    {agent.tools.map((t) => (
                      <Badge key={t} color="emerald">
                        {t}
                      </Badge>
                    ))}
                    {agent.rag_folders.length > 0 && (
                      <Badge color="zinc">
                        RAG: {agent.rag_folders.join(", ")}
                      </Badge>
                    )}
                  </div>
                  {isVault && agent.vault_path && (
                    <p className="text-xs text-zinc-500">
                      Definido en {agent.vault_path} (solo lectura, edítalo en la
                      nota)
                    </p>
                  )}
                  <div className="mt-auto flex gap-2 pt-2">
                    <Button
                      variant="primary"
                      onClick={() => router.push(`/?agent=${agent.id}`)}
                    >
                      Probar
                    </Button>
                    {!isVault && (
                      <>
                        <Button variant="secondary" onClick={() => startEdit(agent)}>
                          Editar
                        </Button>
                        <Button variant="danger" onClick={() => handleDelete(agent)}>
                          Eliminar
                        </Button>
                      </>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
