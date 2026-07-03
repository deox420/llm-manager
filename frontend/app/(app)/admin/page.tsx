"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useUser } from "@/lib/auth-context";
import type {
  AdminModel,
  CreatedKey,
  Provider,
  User,
  VirtualKey,
} from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  ErrorBox,
  Input,
  Label,
  Select,
  Spinner,
} from "@/components/ui";

const PROVIDER_KINDS = [
  "openai",
  "anthropic",
  "google",
  "ollama",
  "openai_compatible",
] as const;

/* ------------------------------ Proveedores ------------------------------ */

function ProvidersTab() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    kind: "openai" as string,
    base_url: "",
    api_key: "",
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setProviders(await api<Provider[]>("/api/admin/providers"));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar proveedores");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({ name: "", kind: "openai", base_url: "", api_key: "" });
    setShowForm(true);
  }

  function openEdit(p: Provider) {
    setEditing(p);
    setForm({ name: p.name, kind: p.kind, base_url: p.base_url ?? "", api_key: "" });
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload: Record<string, unknown> = {
      name: form.name,
      kind: form.kind,
      base_url: form.base_url || null,
    };
    if (form.api_key) payload.api_key = form.api_key;
    try {
      if (editing) {
        await api(`/api/admin/providers/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await api("/api/admin/providers", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(p: Provider) {
    if (!confirm(`¿Eliminar el proveedor "${p.name}"?`)) return;
    try {
      await api<void>(`/api/admin/providers/${p.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {!showForm && <Button onClick={openCreate}>+ Nuevo proveedor</Button>}
      </div>
      <ErrorBox message={error} />
      {showForm && (
        <Card>
          <h3 className="mb-3 text-sm font-semibold">
            {editing ? `Editar proveedor: ${editing.name}` : "Nuevo proveedor"}
          </h3>
          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Nombre</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                placeholder="openai-principal"
              />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
              >
                {PROVIDER_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Base URL (opcional)</Label>
              <Input
                value={form.base_url}
                onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                placeholder="http://localhost:11434"
              />
            </div>
            <div>
              <Label>
                API key {editing ? "(dejar vacío para no cambiarla)" : ""}
              </Label>
              <Input
                type="password"
                value={form.api_key}
                onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                placeholder="sk-…"
                autoComplete="off"
              />
            </div>
            <div className="flex gap-2 md:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Guardando…" : "Guardar"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowForm(false)}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}
      {loading ? (
        <Spinner />
      ) : providers.length === 0 ? (
        <p className="text-sm text-zinc-400">No hay proveedores configurados.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-surface-700">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-800 text-xs text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-medium">Nombre</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Base URL</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-700">
              {providers.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2 font-medium">{p.name}</td>
                  <td className="px-3 py-2">
                    <Badge color="indigo">{p.kind}</Badge>
                  </td>
                  <td className="break-all px-3 py-2 text-zinc-500">
                    {p.base_url ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" onClick={() => openEdit(p)}>
                        Editar
                      </Button>
                      <Button variant="danger" onClick={() => handleDelete(p)}>
                        Eliminar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* -------------------------------- Modelos -------------------------------- */

function ModelsTab() {
  const [models, setModels] = useState<AdminModel[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminModel | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    provider_id: "",
    litellm_model: "",
    input_cost_per_1k: "0",
    output_cost_per_1k: "0",
    enabled: true,
  });

  const load = useCallback(async () => {
    try {
      const [ms, ps] = await Promise.all([
        api<AdminModel[]>("/api/admin/models"),
        api<Provider[]>("/api/admin/providers"),
      ]);
      setModels(ms);
      setProviders(ps);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar modelos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({
      name: "",
      provider_id: providers[0]?.id.toString() ?? "",
      litellm_model: "",
      input_cost_per_1k: "0",
      output_cost_per_1k: "0",
      enabled: true,
    });
    setShowForm(true);
  }

  function openEdit(m: AdminModel) {
    setEditing(m);
    setForm({
      name: m.name,
      provider_id: m.provider_id.toString(),
      litellm_model: m.litellm_model,
      input_cost_per_1k: m.input_cost_per_1k.toString(),
      output_cost_per_1k: m.output_cost_per_1k.toString(),
      enabled: m.enabled,
    });
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      name: form.name,
      provider_id: Number(form.provider_id),
      litellm_model: form.litellm_model,
      input_cost_per_1k: Number(form.input_cost_per_1k),
      output_cost_per_1k: Number(form.output_cost_per_1k),
      enabled: form.enabled,
    };
    try {
      if (editing) {
        await api(`/api/admin/models/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await api("/api/admin/models", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(m: AdminModel) {
    try {
      await api(`/api/admin/models/${m.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !m.enabled }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar");
    }
  }

  async function handleDelete(m: AdminModel) {
    if (!confirm(`¿Eliminar el modelo "${m.name}"?`)) return;
    try {
      await api<void>(`/api/admin/models/${m.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar");
    }
  }

  const providerName = (id: number) =>
    providers.find((p) => p.id === id)?.name ?? `#${id}`;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {!showForm && <Button onClick={openCreate}>+ Nuevo modelo</Button>}
      </div>
      <ErrorBox message={error} />
      {showForm && (
        <Card>
          <h3 className="mb-3 text-sm font-semibold">
            {editing ? `Editar modelo: ${editing.name}` : "Nuevo modelo"}
          </h3>
          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Nombre (en el catálogo)</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                placeholder="gpt-4o"
              />
            </div>
            <div>
              <Label>Proveedor</Label>
              <Select
                value={form.provider_id}
                onChange={(e) =>
                  setForm({ ...form, provider_id: e.target.value })
                }
                required
              >
                <option value="" disabled>
                  Selecciona un proveedor
                </option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Modelo LiteLLM</Label>
              <Input
                value={form.litellm_model}
                onChange={(e) =>
                  setForm({ ...form, litellm_model: e.target.value })
                }
                required
                placeholder="openai/gpt-4o"
              />
            </div>
            <div>
              <Label>Coste entrada / 1K tokens (USD)</Label>
              <Input
                type="number"
                step="0.000001"
                min="0"
                value={form.input_cost_per_1k}
                onChange={(e) =>
                  setForm({ ...form, input_cost_per_1k: e.target.value })
                }
              />
            </div>
            <div>
              <Label>Coste salida / 1K tokens (USD)</Label>
              <Input
                type="number"
                step="0.000001"
                min="0"
                value={form.output_cost_per_1k}
                onChange={(e) =>
                  setForm({ ...form, output_cost_per_1k: e.target.value })
                }
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-300 md:col-span-2">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) =>
                  setForm({ ...form, enabled: e.target.checked })
                }
                className="h-4 w-4 rounded border-surface-700 bg-surface-900 accent-indigo-600"
              />
              Habilitado en el catálogo
            </label>
            <div className="flex gap-2 md:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Guardando…" : "Guardar"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowForm(false)}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}
      {loading ? (
        <Spinner />
      ) : models.length === 0 ? (
        <p className="text-sm text-zinc-400">
          No hay modelos. Añade primero un proveedor y luego sus modelos.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-surface-700">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-800 text-xs text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-medium">Nombre</th>
                <th className="px-3 py-2 font-medium">Proveedor</th>
                <th className="px-3 py-2 font-medium">LiteLLM</th>
                <th className="px-3 py-2 font-medium">$/1K in</th>
                <th className="px-3 py-2 font-medium">$/1K out</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-700">
              {models.map((m) => (
                <tr key={m.id}>
                  <td className="px-3 py-2 font-medium">{m.name}</td>
                  <td className="px-3 py-2">{providerName(m.provider_id)}</td>
                  <td className="px-3 py-2 text-zinc-500">{m.litellm_model}</td>
                  <td className="px-3 py-2">{m.input_cost_per_1k}</td>
                  <td className="px-3 py-2">{m.output_cost_per_1k}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => toggleEnabled(m)} title="Cambiar estado">
                      <Badge color={m.enabled ? "emerald" : "zinc"}>
                        {m.enabled ? "Habilitado" : "Deshabilitado"}
                      </Badge>
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" onClick={() => openEdit(m)}>
                        Editar
                      </Button>
                      <Button variant="danger" onClick={() => handleDelete(m)}>
                        Eliminar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* --------------------------------- Claves -------------------------------- */

function KeysTab() {
  const [keys, setKeys] = useState<VirtualKey[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({
    name: "",
    user_id: "",
    budget_usd: "",
    expires_at: "",
  });

  const load = useCallback(async () => {
    try {
      const [ks, us] = await Promise.all([
        api<VirtualKey[]>("/api/admin/keys"),
        api<User[]>("/api/admin/users"),
      ]);
      setKeys(ks);
      setUsers(us);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar claves");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload: Record<string, unknown> = { name: form.name };
    if (form.user_id) payload.user_id = Number(form.user_id);
    if (form.budget_usd) payload.budget_usd = Number(form.budget_usd);
    if (form.expires_at)
      payload.expires_at = new Date(form.expires_at).toISOString();
    try {
      const res = await api<CreatedKey>("/api/admin/keys", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setCreatedKey(res.key);
      setCopied(false);
      setShowForm(false);
      setForm({ name: "", user_id: "", budget_usd: "", expires_at: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear la clave");
    } finally {
      setSaving(false);
    }
  }

  async function copyKey() {
    if (!createdKey) return;
    try {
      await navigator.clipboard.writeText(createdKey);
      setCopied(true);
    } catch {
      setError("No se pudo copiar al portapapeles");
    }
  }

  async function handleDelete(k: VirtualKey) {
    if (!confirm(`¿Revocar la clave "${k.name}"?`)) return;
    try {
      await api<void>(`/api/admin/keys/${k.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar");
    }
  }

  const userName = (id: number | null) =>
    id == null ? "—" : (users.find((u) => u.id === id)?.email ?? `#${id}`);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {!showForm && <Button onClick={() => setShowForm(true)}>+ Nueva clave</Button>}
      </div>
      <ErrorBox message={error} />
      {createdKey && (
        <div className="space-y-2 rounded-xl border border-amber-700 bg-amber-950/40 p-4">
          <p className="text-sm font-semibold text-amber-200">
            Clave creada. Cópiala ahora: no volverá a mostrarse.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-lg bg-black/40 px-3 py-2 text-sm text-amber-100">
              {createdKey}
            </code>
            <Button variant="secondary" onClick={copyKey}>
              {copied ? "Copiada ✓" : "Copiar"}
            </Button>
          </div>
          <Button variant="ghost" onClick={() => setCreatedKey(null)}>
            Cerrar
          </Button>
        </div>
      )}
      {showForm && (
        <Card>
          <h3 className="mb-3 text-sm font-semibold">Nueva clave virtual</h3>
          <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Nombre</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                placeholder="clave-ci"
              />
            </div>
            <div>
              <Label>Usuario (opcional)</Label>
              <Select
                value={form.user_id}
                onChange={(e) => setForm({ ...form, user_id: e.target.value })}
              >
                <option value="">Sin asignar</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.email}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Presupuesto USD (opcional)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.budget_usd}
                onChange={(e) =>
                  setForm({ ...form, budget_usd: e.target.value })
                }
                placeholder="10.00"
              />
            </div>
            <div>
              <Label>Expira (opcional)</Label>
              <Input
                type="datetime-local"
                value={form.expires_at}
                onChange={(e) =>
                  setForm({ ...form, expires_at: e.target.value })
                }
              />
            </div>
            <div className="flex gap-2 md:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Creando…" : "Crear clave"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowForm(false)}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}
      {loading ? (
        <Spinner />
      ) : keys.length === 0 ? (
        <p className="text-sm text-zinc-400">No hay claves virtuales.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-surface-700">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-800 text-xs text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-medium">Nombre</th>
                <th className="px-3 py-2 font-medium">Usuario</th>
                <th className="px-3 py-2 font-medium">Gastado</th>
                <th className="px-3 py-2 font-medium">Presupuesto</th>
                <th className="px-3 py-2 font-medium">Expira</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-700">
              {keys.map((k) => (
                <tr key={k.id}>
                  <td className="px-3 py-2 font-medium">{k.name}</td>
                  <td className="px-3 py-2 text-zinc-400">
                    {userName(k.user_id)}
                  </td>
                  <td className="px-3 py-2">${k.spent_usd.toFixed(4)}</td>
                  <td className="px-3 py-2">
                    {k.budget_usd != null ? `$${k.budget_usd.toFixed(2)}` : "∞"}
                  </td>
                  <td className="px-3 py-2 text-zinc-400">
                    {k.expires_at
                      ? new Date(k.expires_at).toLocaleString("es")
                      : "Nunca"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="danger" onClick={() => handleDelete(k)}>
                      Revocar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* -------------------------------- Usuarios ------------------------------- */

function UsersTab() {
  const me = useUser();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setUsers(await api<User[]>("/api/admin/users"));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar usuarios");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function patchUser(u: User, patch: { role?: string; is_active?: boolean }) {
    try {
      await api(`/api/admin/users/${u.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar el usuario");
    }
  }

  return (
    <div className="space-y-4">
      <ErrorBox message={error} />
      {loading ? (
        <Spinner />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-surface-700">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-800 text-xs text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-medium">Nombre</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Rol</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium">Alta</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-700">
              {users.map((u) => {
                const isMe = me?.id === u.id;
                return (
                  <tr key={u.id}>
                    <td className="px-3 py-2 font-medium">
                      {u.name}
                      {isMe && (
                        <span className="ml-1 text-xs text-zinc-500">(tú)</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-zinc-400">{u.email}</td>
                    <td className="px-3 py-2">
                      <Badge color={u.role === "admin" ? "indigo" : "zinc"}>
                        {u.role}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge color={u.is_active ? "emerald" : "red"}>
                        {u.is_active ? "Activo" : "Inactivo"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-zinc-500">
                      {new Date(u.created_at).toLocaleDateString("es")}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {!isMe && (
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="secondary"
                            onClick={() =>
                              patchUser(u, {
                                role: u.role === "admin" ? "user" : "admin",
                              })
                            }
                          >
                            {u.role === "admin" ? "Hacer user" : "Hacer admin"}
                          </Button>
                          <Button
                            variant={u.is_active ? "danger" : "primary"}
                            onClick={() =>
                              patchUser(u, { is_active: !u.is_active })
                            }
                          >
                            {u.is_active ? "Desactivar" : "Activar"}
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* --------------------------------- Página -------------------------------- */

const TABS = [
  { id: "providers", label: "Proveedores" },
  { id: "models", label: "Modelos" },
  { id: "keys", label: "Claves" },
  { id: "users", label: "Usuarios" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function AdminPage() {
  const user = useUser();
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("providers");

  useEffect(() => {
    if (user && user.role !== "admin") router.replace("/");
  }, [user, router]);

  if (!user || user.role !== "admin") {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-zinc-400">
          Acceso restringido a administradores.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <h1 className="text-xl font-bold">Administración</h1>
        <div className="flex gap-1 rounded-xl border border-surface-700 bg-surface-900 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === t.id
                  ? "bg-indigo-600 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === "providers" && <ProvidersTab />}
        {tab === "models" && <ModelsTab />}
        {tab === "keys" && <KeysTab />}
        {tab === "users" && <UsersTab />}
      </div>
    </div>
  );
}
