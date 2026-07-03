"use client";

/**
 * Mini-renderizador de Markdown sin dependencias.
 * Escapa primero todo el HTML y después aplica las transformaciones,
 * por lo que el resultado es seguro para dangerouslySetInnerHTML.
 * Soporta: bloques de código, código inline, encabezados, negrita,
 * cursiva, enlaces, listas, citas y líneas horizontales.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInline(text: string): string {
  let out = escapeHtml(text);
  // código inline
  out = out.replace(
    /`([^`]+)`/g,
    '<code class="rounded bg-surface-700 px-1 py-0.5 text-[0.85em] text-amber-200">$1</code>',
  );
  // negrita y cursiva
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  // enlaces [texto](url) — solo http(s)
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-indigo-400 underline hover:text-indigo-300">$1</a>',
  );
  return out;
}

function renderMarkdown(source: string): string {
  const lines = source.split("\n");
  const html: string[] = [];
  let inCode = false;
  let codeLines: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (inCode) {
        html.push(
          `<pre class="my-2 overflow-x-auto rounded-lg bg-black/50 p-3 text-sm"><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`,
        );
        codeLines = [];
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      const sizes: Record<number, string> = {
        1: "text-xl font-bold mt-3 mb-1",
        2: "text-lg font-bold mt-3 mb-1",
        3: "text-base font-semibold mt-2 mb-1",
        4: "text-sm font-semibold mt-2 mb-1",
      };
      html.push(
        `<h${level} class="${sizes[level]}">${renderInline(heading[2])}</h${level}>`,
      );
      continue;
    }

    if (/^\s*([-*+])\s+/.test(line)) {
      if (listType !== "ul") {
        closeList();
        html.push('<ul class="my-1 list-disc space-y-0.5 pl-5">');
        listType = "ul";
      }
      html.push(`<li>${renderInline(line.replace(/^\s*[-*+]\s+/, ""))}</li>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      if (listType !== "ol") {
        closeList();
        html.push('<ol class="my-1 list-decimal space-y-0.5 pl-5">');
        listType = "ol";
      }
      html.push(`<li>${renderInline(line.replace(/^\s*\d+\.\s+/, ""))}</li>`);
      continue;
    }

    if (/^\s*(---|\*\*\*)\s*$/.test(line)) {
      closeList();
      html.push('<hr class="my-3 border-surface-700" />');
      continue;
    }

    if (/^\s*&gt;|^\s*>/.test(line)) {
      closeList();
      html.push(
        `<blockquote class="my-1 border-l-2 border-indigo-500/60 pl-3 text-zinc-400">${renderInline(line.replace(/^\s*>\s?/, ""))}</blockquote>`,
      );
      continue;
    }

    if (line.trim() === "") {
      closeList();
      continue;
    }

    closeList();
    html.push(`<p class="my-1 leading-relaxed">${renderInline(line)}</p>`);
  }

  if (inCode && codeLines.length > 0) {
    // bloque de código sin cerrar (p. ej. durante el streaming)
    html.push(
      `<pre class="my-2 overflow-x-auto rounded-lg bg-black/50 p-3 text-sm"><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`,
    );
  }
  closeList();
  return html.join("\n");
}

export default function Markdown({ content }: { content: string }) {
  return (
    <div
      className="break-words text-sm text-zinc-200"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
    />
  );
}
