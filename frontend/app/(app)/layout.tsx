"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api, clearToken, getToken } from "@/lib/api";
import type { User } from "@/lib/types";
import { AuthContext } from "@/lib/auth-context";
import { Spinner } from "@/components/ui";

const NAV_ITEMS = [
  { href: "/", label: "Chat", icon: "💬" },
  { href: "/agents", label: "Agentes", icon: "🤖" },
  { href: "/vaults", label: "Vaults", icon: "📚" },
  { href: "/usage", label: "Uso", icon: "📊" },
];

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    api<User>("/api/auth/me")
      .then((u) => setUser(u))
      .catch(() => {
        // el helper ya redirige en 401; cualquier otro fallo vuelve a login
        clearToken();
        router.replace("/login");
      })
      .finally(() => setChecking(false));
  }, [router]);

  function handleLogout() {
    clearToken();
    router.replace("/login");
  }

  if (checking || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Verificando sesión…" />
      </div>
    );
  }

  const items = [...NAV_ITEMS];
  if (user.role === "admin") {
    items.push({ href: "/admin", label: "Admin", icon: "⚙️" });
  }

  return (
    <AuthContext.Provider value={user}>
      <div className="flex h-screen overflow-hidden">
        <aside className="flex w-56 shrink-0 flex-col border-r border-surface-700 bg-surface-900">
          <div className="border-b border-surface-700 px-4 py-4">
            <Link href="/" className="text-lg font-bold tracking-tight">
              LLM <span className="text-indigo-400">Manager</span>
            </Link>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto p-3">
            {items.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-indigo-600/15 text-indigo-300"
                      : "text-zinc-400 hover:bg-surface-800 hover:text-zinc-200"
                  }`}
                >
                  <span aria-hidden>{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-surface-700 p-3">
            <div className="mb-2 px-2">
              <p className="truncate text-sm font-medium text-zinc-200">
                {user.name}
              </p>
              <p className="truncate text-xs text-zinc-500">{user.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-surface-800 hover:text-red-300"
            >
              <span aria-hidden>🚪</span>
              Salir
            </button>
          </div>
        </aside>
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </AuthContext.Provider>
  );
}
