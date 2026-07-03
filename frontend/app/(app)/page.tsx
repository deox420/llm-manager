"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, apiStream } from "@/lib/api";
import type {
  Agent,
  CatalogModel,
  Conversation,
  ConversationDetail,
  Message,
} from "@/lib/types";
import Markdown from "@/components/Markdown";
import { Button, ErrorBox, Select, Spinner } from "@/components/ui";

interface ChatMessage extends Omit<Message, "id" | "created_at"> {
  id: number | string;
  created_at?: string;
}

function NewConversationPanel({
  models,
  agents,
  onCreate,
  onClose,
}: {
  models: CatalogModel[];
  agents: Agent[];
  onCreate: (payload: { model?: string; agent_id?: number }) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"model" | "agent">("model");
  const [model, setModel] = useState(models[0]?.name ?? "");
  const [agentId, setAgentId] = useState<number | "">(agents[0]?.id ?? "");

  return (
    <div className="space-y-3 rounded-xl border border-surface-700 bg-surface-850 p-3">
      <div className="flex gap-1 rounded-lg bg-surface-900 p-1">
        {(
          [
            ["model", "Modelo"],
            ["agent", "Agente"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setMode(value)}
            className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              mode === value
                ? "bg-indigo-600 text-white"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "model" ? (
        models.length > 0 ? (
          <Select value={model} onChange={(e) => setModel(e.target.value)}>
            {models.map((m) => (
              <option key={m.id} value={m.name}>
                {m.name} · {m.provider_name}
              </option>
            ))}
          </Select>
        ) : (
          <p className="text-xs text-zinc-500">
            No hay modelos habilitados en el catálogo.
          </p>
        )
      ) : agents.length > 0 ? (
        <Select
          value={agentId}
          onChange={(e) => setAgentId(Number(e.target.value))}
        >
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      ) : (
        <p className="text-xs text-zinc-500">Aún no hay agentes creados.</p>
      )}
      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={mode === "model" ? !model : agentId === ""}
          onClick={() =>
            onCreate(
              mode === "model"
                ? { model }
                : { agent_id: agentId as number },
            )
          }
        >
          Crear
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function ChatPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [models, setModels] = useState<CatalogModel[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [showNew, setShowNew] = useState(false);

  const [current, setCurrent] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingConv, setLoadingConv] = useState(false);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const currentIdRef = useRef<number | null>(null);

  const refreshConversations = useCallback(async () => {
    try {
      const list = await api<Conversation[]>("/api/conversations");
      setConversations(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar conversaciones");
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    refreshConversations();
    api<CatalogModel[]>("/api/models").then(setModels).catch(() => {});
    api<Agent[]>("/api/agents").then(setAgents).catch(() => {});
  }, [refreshConversations]);

  const openConversation = useCallback(async (id: number) => {
    currentIdRef.current = id;
    setLoadingConv(true);
    setError(null);
    try {
      const detail = await api<ConversationDetail>(`/api/conversations/${id}`);
      if (currentIdRef.current !== id) return;
      setCurrent(detail);
      setMessages(detail.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar la conversación");
    } finally {
      setLoadingConv(false);
    }
  }, []);

  const createConversation = useCallback(
    async (payload: { model?: string; agent_id?: number }) => {
      setError(null);
      try {
        const conv = await api<Conversation>("/api/conversations", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setShowNew(false);
        await refreshConversations();
        await openConversation(conv.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al crear la conversación");
      }
    },
    [refreshConversations, openConversation],
  );

  // "Probar" desde /agents llega como /?agent={id}
  useEffect(() => {
    const agentParam = searchParams.get("agent");
    if (agentParam) {
      router.replace("/");
      createConversation({ agent_id: Number(agentParam) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  async function deleteConversation(id: number) {
    if (!confirm("¿Eliminar esta conversación?")) return;
    try {
      await api<void>(`/api/conversations/${id}`, { method: "DELETE" });
      if (current?.id === id) {
        setCurrent(null);
        setMessages([]);
        currentIdRef.current = null;
      }
      await refreshConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar");
    }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!current || !input.trim() || streaming) return;
    const content = input.trim();
    setInput("");
    setError(null);
    setStreaming(true);

    const convId = current.id;
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", content };
    const assistantId = `a-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: assistantId, role: "assistant", content: "" },
    ]);

    try {
      await apiStream(
        `/api/conversations/${convId}/messages`,
        { content },
        (delta) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + delta } : m,
            ),
          );
        },
      );
      refreshConversations(); // el backend puede actualizar el título
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al enviar el mensaje");
      setMessages((prev) => prev.filter((m) => m.id !== assistantId || m.content !== ""));
    } finally {
      setStreaming(false);
    }
  }

  function conversationLabel(c: Conversation): string {
    if (c.title) return c.title;
    if (c.agent_id) {
      const agent = agents.find((a) => a.id === c.agent_id);
      if (agent) return `Agente: ${agent.name}`;
    }
    return c.model ?? "Conversación";
  }

  const headerLabel = current
    ? current.agent_id
      ? `Agente: ${agents.find((a) => a.id === current.agent_id)?.name ?? current.agent_id}`
      : current.model ?? ""
    : "";

  return (
    <div className="flex h-full">
      {/* Lista de conversaciones */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-surface-700 bg-surface-900/50">
        <div className="p-3">
          {showNew ? (
            <NewConversationPanel
              models={models}
              agents={agents}
              onCreate={createConversation}
              onClose={() => setShowNew(false)}
            />
          ) : (
            <Button className="w-full" onClick={() => setShowNew(true)}>
              + Nueva conversación
            </Button>
          )}
        </div>
        <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
          {loadingList ? (
            <Spinner label="Cargando…" />
          ) : conversations.length === 0 ? (
            <p className="px-2 py-4 text-xs text-zinc-500">
              Sin conversaciones todavía. Crea una para empezar.
            </p>
          ) : (
            conversations.map((c) => (
              <div
                key={c.id}
                className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition-colors ${
                  current?.id === c.id
                    ? "bg-indigo-600/15 text-indigo-200"
                    : "text-zinc-300 hover:bg-surface-800"
                }`}
              >
                <button
                  onClick={() => openConversation(c.id)}
                  className="min-w-0 flex-1 truncate text-left"
                  title={conversationLabel(c)}
                >
                  {conversationLabel(c)}
                </button>
                <button
                  onClick={() => deleteConversation(c.id)}
                  className="hidden shrink-0 rounded p-0.5 text-zinc-500 hover:text-red-400 group-hover:block"
                  title="Eliminar conversación"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Panel principal */}
      <section className="flex min-w-0 flex-1 flex-col">
        {current ? (
          <>
            <header className="flex items-center justify-between border-b border-surface-700 px-4 py-3">
              <h1 className="truncate text-sm font-semibold">
                {current.title ?? "Conversación"}
              </h1>
              <span className="ml-2 shrink-0 text-xs text-zinc-500">
                {headerLabel}
              </span>
            </header>
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {loadingConv ? (
                <Spinner />
              ) : (
                <div className="mx-auto max-w-3xl space-y-4">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                          m.role === "user"
                            ? "bg-indigo-600 text-white"
                            : "border border-surface-700 bg-surface-850"
                        }`}
                      >
                        {m.role === "assistant" ? (
                          m.content ? (
                            <Markdown content={m.content} />
                          ) : (
                            <span className="inline-block h-4 w-2 animate-pulse rounded-sm bg-zinc-400" />
                          )
                        ) : (
                          <p className="whitespace-pre-wrap break-words text-sm">
                            {m.content}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                  <div ref={bottomRef} />
                </div>
              )}
            </div>
            <footer className="border-t border-surface-700 p-3">
              <div className="mx-auto max-w-3xl space-y-2">
                <ErrorBox message={error} />
                <form onSubmit={sendMessage} className="flex gap-2">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Escribe un mensaje…"
                    disabled={streaming}
                    className="flex-1 rounded-xl border border-surface-700 bg-surface-900 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-indigo-500"
                  />
                  <Button type="submit" disabled={streaming || !input.trim()}>
                    {streaming ? "Generando…" : "Enviar"}
                  </Button>
                </form>
              </div>
            </footer>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
            <p className="text-4xl" aria-hidden>
              💬
            </p>
            <h1 className="text-lg font-semibold">Bienvenido a LLM Manager</h1>
            <p className="max-w-sm text-sm text-zinc-400">
              Selecciona una conversación de la lista o crea una nueva con un
              modelo del catálogo o con uno de tus agentes.
            </p>
            <ErrorBox message={error} />
          </div>
        )}
      </section>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ChatPageInner />
    </Suspense>
  );
}
