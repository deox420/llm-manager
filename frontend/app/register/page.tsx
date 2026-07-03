"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, setToken } from "@/lib/api";
import type { AuthResponse } from "@/lib/types";
import { Button, Card, ErrorBox, Input, Label } from "@/components/ui";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api<AuthResponse>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      });
      setToken(res.token);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrarse");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-bold">LLM Manager</h1>
        <p className="mb-5 text-sm text-zinc-400">
          Crea tu cuenta. El primer usuario registrado será administrador.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Nombre</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              placeholder="Tu nombre"
            />
          </div>
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
              minLength={8}
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres"
            />
          </div>
          <ErrorBox message={error} />
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Creando cuenta…" : "Crear cuenta"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-zinc-400">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="text-indigo-400 hover:underline">
            Inicia sesión
          </Link>
        </p>
      </Card>
    </main>
  );
}
