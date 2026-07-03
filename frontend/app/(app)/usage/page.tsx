"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { UsageSummary } from "@/lib/types";
import { Card, ErrorBox, Select, Spinner } from "@/components/ui";

const DAY_OPTIONS = [7, 30, 90];

function formatUsd(value: number): string {
  return `$${value.toFixed(value < 1 ? 4 : 2)}`;
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toString();
}

function BarList({
  items,
}: {
  items: { label: string; value: number; detail?: string }[];
}) {
  const max = Math.max(...items.map((i) => i.value), 0);
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-0.5 flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate text-zinc-300">{item.label}</span>
            <span className="shrink-0 text-xs text-zinc-400">
              {formatUsd(item.value)}
              {item.detail ? ` · ${item.detail}` : ""}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-800">
            <div
              className="h-full rounded-full bg-indigo-500"
              style={{
                width: max > 0 ? `${(item.value / max) * 100}%` : "0%",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function UsagePage() {
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api<UsageSummary>(`/api/usage/summary?days=${days}`)
      .then((s) => {
        setSummary(s);
        setError(null);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Error al cargar el uso"),
      )
      .finally(() => setLoading(false));
  }, [days]);

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold">Uso y costes</h1>
          <div className="w-40">
            <Select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              {DAY_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  Últimos {d} días
                </option>
              ))}
            </Select>
          </div>
        </div>
        <ErrorBox message={error} />
        {loading ? (
          <Spinner />
        ) : summary ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Card>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Coste total
                </p>
                <p className="mt-1 text-3xl font-bold text-indigo-300">
                  {formatUsd(summary.total_usd)}
                </p>
              </Card>
              <Card>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Tokens totales
                </p>
                <p className="mt-1 text-3xl font-bold text-emerald-300">
                  {formatTokens(summary.total_tokens)}
                </p>
              </Card>
            </div>

            <Card>
              <h2 className="mb-3 text-sm font-semibold">Coste por modelo</h2>
              {summary.by_model.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  Sin uso registrado en este periodo.
                </p>
              ) : (
                <BarList
                  items={summary.by_model.map((m) => ({
                    label: m.model,
                    value: m.usd,
                    detail: `${m.requests} req · ${formatTokens(m.tokens)} tokens`,
                  }))}
                />
              )}
            </Card>

            <Card>
              <h2 className="mb-3 text-sm font-semibold">Coste por día</h2>
              {summary.by_day.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  Sin uso registrado en este periodo.
                </p>
              ) : (
                <BarList
                  items={summary.by_day.map((d) => ({
                    label: d.date,
                    value: d.usd,
                    detail: `${formatTokens(d.tokens)} tokens`,
                  }))}
                />
              )}
            </Card>

            {summary.by_user && summary.by_user.length > 0 && (
              <Card>
                <h2 className="mb-3 text-sm font-semibold">
                  Coste por usuario
                </h2>
                <BarList
                  items={summary.by_user.map((u) => ({
                    label: u.user,
                    value: u.usd,
                  }))}
                />
              </Card>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
