"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, setToken } from "@/lib/api";
import type { AuthResponse } from "@/lib/types";
import { Button, Card, ErrorBox, Input, Label } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api<AuthResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(res.token);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-bold">LLM Manager</h1>
        <p className="mb-5 text-sm text-zinc-400">Inicia sesión en tu cuenta</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="tu@correo.com"
            />
          </div>
          <div>
            <Label>Contraseña</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </div>
          <ErrorBox message={error} />
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Entrando…" : "Entrar"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-zinc-400">
          ¿No tienes cuenta?{" "}
          <Link href="/register" className="text-indigo-400 hover:underline">
            Regístrate
          </Link>
        </p>
      </Card>
    </main>
  );
}
