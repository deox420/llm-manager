export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const TOKEN_KEY = "llm_manager_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function handleUnauthorized(): never {
  clearToken();
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
  throw new ApiError("Sesión expirada. Inicia sesión de nuevo.", 401);
}

async function extractDetail(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (data && data.detail) {
      return typeof data.detail === "string"
        ? data.detail
        : JSON.stringify(data.detail);
    }
  } catch {
    // cuerpo no JSON
  }
  return `Error ${res.status}`;
}

/**
 * Llamada JSON a la API. Adjunta el token JWT si existe y redirige a /login
 * ante un 401.
 */
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  if (options.body !== undefined && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 401) handleUnauthorized();
  if (!res.ok) throw new ApiError(await extractDetail(res), res.status);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

interface OpenAIChunk {
  choices?: { delta?: { content?: string | null } }[];
}

/**
 * POST que consume una respuesta SSE en formato OpenAI
 * (`data: {chunk}` ... `data: [DONE]`) e invoca `onDelta` con cada
 * fragmento de texto del asistente.
 */
export async function apiStream(
  path: string,
  body: unknown,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (res.status === 401) handleUnauthorized();
  if (!res.ok) throw new ApiError(await extractDetail(res), res.status);
  if (!res.body) throw new ApiError("Respuesta sin cuerpo", res.status);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const processLine = (line: string): boolean => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return false;
    const payload = trimmed.slice(5).trim();
    if (payload === "[DONE]") return true;
    try {
      const chunk = JSON.parse(payload) as OpenAIChunk;
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) onDelta(delta);
    } catch {
      // línea SSE no parseable: la ignoramos
    }
    return false;
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (processLine(line)) return;
    }
  }
  if (buffer) processLine(buffer);
}
