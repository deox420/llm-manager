"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { SyncReport, Vault, VaultDocument } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  ErrorBox,
  Input,
  Label,
  Spinner,
} from "@/components/ui";

function VaultCard({
  vault,
  onDeleted,
  onError,
}: {
  vault: Vault;
  onDeleted: () => void;
  onError: (msg: string) => void;
}) {
  const [syncing, setSyncing] = useState(false);
  const [report, setReport] = useState<SyncReport | null>(null);
  const [documents, setDocuments] = useState<VaultDocument[] | null>(null);
  const [showDocs, setShowDocs] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(false);

  async function handleSync() {
    setSyncing(true);
    setReport(null);
    try {
      const res = await api<SyncReport>(`/api/vaults/${vault.id}/sync`, {
        method: "POST",
      });
      setReport(res);
      if (showDocs) await loadDocuments();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Error al sincronizar");
    } finally {
      setSyncing(false);
    }
  }

  async function loadDocuments() {
    setLoadingDocs(true);
    try {
      const docs = await api<VaultDocument[]>(
        `/api/vaults/${vault.id}/documents`,
      );
      setDocuments(docs);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Error al cargar documentos");
    } finally {
      setLoadingDocs(false);
    }
  }

  async function toggleDocs() {
    const next = !showDocs;
    setShowDocs(next);
    if (next && documents === null) await loadDocuments();
  }

  async function handleDelete() {
    if (!confirm(`¿Eliminar el vault "${vault.name}"?`)) return;
    try {
      await api<void>(`/api/vaults/${vault.id}`, { method: "DELETE" });
      onDeleted();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Error al eliminar el vault");
    }
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{vault.name}</h2>
          <p className="break-all text-xs text-zinc-500">{vault.repo_url}</p>
        </div>
        {vault.branch && <Badge color="zinc">{vault.branch}</Badge>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={handleSync} disabled={syncing}>
          {syncing ? "Sincronizando…" : "Sincronizar"}
        </Button>
        <Button variant="secondary" onClick={toggleDocs}>
          {showDocs ? "Ocultar documentos" : "Ver documentos"}
        </Button>
        <Button variant="danger" onClick={handleDelete}>
          Eliminar
        </Button>
      </div>
      {report && (
        <div className="rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">
          <p className="font-medium">Sincronización completada</p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            <li>{report.documents_indexed} documentos indexados</li>
            <li>{report.agents_synced} agentes sincronizados</li>
          </ul>
          {report.errors.length > 0 && (
            <div className="mt-2 rounded border border-red-800 bg-red-950/40 px-2 py-1 text-xs text-red-300">
              <p className="font-medium">Errores:</p>
              <ul className="list-disc pl-4">
                {report.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {showDocs &&
        (loadingDocs ? (
          <Spinner label="Cargando documentos…" />
        ) : documents && documents.length > 0 ? (
          <div className="max-h-64 overflow-y-auto rounded-lg border border-surface-700">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-surface-800 text-zinc-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Título</th>
                  <th className="px-3 py-2 font-medium">Ruta</th>
                  <th className="px-3 py-2 font-medium">Actualizado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-700">
                {documents.map((d) => (
                  <tr key={d.id} className="text-zinc-300">
                    <td className="px-3 py-1.5">{d.title ?? "—"}</td>
                    <td className="break-all px-3 py-1.5 text-zinc-500">
                      {d.path}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-zinc-500">
                      {new Date(d.updated_at).toLocaleDateString("es")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-zinc-500">
            Sin documentos indexados. Ejecuta una sincronización.
          </p>
        ))}
    </Card>
  );
}

export default function VaultsPage() {
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    repo_url: "",
    branch: "main",
    token: "",
  });

  const load = useCallback(async () => {
    try {
      setVaults(await api<Vault[]>("/api/vaults"));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar vaults");
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
    try {
      await api<Vault>("/api/vaults", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          repo_url: form.repo_url,
          branch: form.branch || undefined,
          token: form.token || undefined,
        }),
      });
      setForm({ name: "", repo_url: "", branch: "main", token: "" });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrar el vault");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Vaults de Obsidian</h1>
          {!showForm && (
            <Button onClick={() => setShowForm(true)}>+ Registrar vault</Button>
          )}
        </div>
        <ErrorBox message={error} />
        {showForm && (
          <Card>
            <h2 className="mb-4 text-base font-semibold">Registrar vault</h2>
            <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Nombre</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  placeholder="Mi segundo cerebro"
                />
              </div>
              <div>
                <Label>URL del repositorio git</Label>
                <Input
                  value={form.repo_url}
                  onChange={(e) =>
                    setForm({ ...form, repo_url: e.target.value })
                  }
                  required
                  placeholder="https://github.com/usuario/vault.git"
                />
              </div>
              <div>
                <Label>Rama</Label>
                <Input
                  value={form.branch}
                  onChange={(e) => setForm({ ...form, branch: e.target.value })}
                  placeholder="main"
                />
              </div>
              <div>
                <Label>Token de acceso (opcional, se guarda cifrado)</Label>
                <Input
                  type="password"
                  value={form.token}
                  onChange={(e) => setForm({ ...form, token: e.target.value })}
                  placeholder="ghp_…"
                  autoComplete="off"
                />
              </div>
              <div className="flex gap-2 md:col-span-2">
                <Button type="submit" disabled={saving}>
                  {saving ? "Registrando…" : "Registrar"}
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
        ) : vaults.length === 0 ? (
          <Card>
            <p className="text-sm text-zinc-400">
              No hay vaults registrados. Registra un repositorio git con tu
              vault de Obsidian para indexarlo y sincronizar agentes.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {vaults.map((v) => (
              <VaultCard
                key={v.id}
                vault={v}
                onDeleted={load}
                onError={setError}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
