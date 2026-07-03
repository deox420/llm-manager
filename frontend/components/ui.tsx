"use client";

import { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const variants: Record<string, string> = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-500",
    secondary:
      "border border-surface-700 bg-surface-800 text-zinc-200 hover:bg-surface-700",
    danger: "bg-red-600/80 text-white hover:bg-red-600",
    ghost: "text-zinc-400 hover:bg-surface-800 hover:text-zinc-200",
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props} />
  );
}

export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-lg border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-indigo-500 ${className}`}
      {...props}
    />
  );
}

export function Textarea({
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full rounded-lg border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-indigo-500 ${className}`}
      {...props}
    />
  );
}

export function Select({
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full rounded-lg border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500 ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
      {children}
    </label>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-surface-700 bg-surface-850 p-4 ${className}`}
    >
      {children}
    </div>
  );
}

export function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">
      {message}
    </div>
  );
}

export function Spinner({ label = "Cargando…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-6 text-sm text-zinc-400">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-indigo-400" />
      {label}
    </div>
  );
}

export function Badge({
  children,
  color = "indigo",
}: {
  children: ReactNode;
  color?: "indigo" | "emerald" | "amber" | "zinc" | "red";
}) {
  const colors: Record<string, string> = {
    indigo: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
    emerald: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    amber: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    zinc: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
    red: "bg-red-500/15 text-red-300 border-red-500/30",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${colors[color]}`}
    >
      {children}
    </span>
  );
}
