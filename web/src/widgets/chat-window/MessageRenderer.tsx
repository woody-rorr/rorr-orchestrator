import type { ContentBlock } from "@/entities/message/model";
import type { FailedTool } from "@/shared/api/client";

const PR_RE = /https:\/\/github\.com\/[^\s<]+\/pull\/\d+/g;

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInline(raw: string): string {
  let s = escHtml(raw);
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong class="font-semibold">$1</strong>');
  s = s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>");
  s = s.replace(
    /`([^`\n]+)`/g,
    '<code class="bg-[#252528] px-1 py-0.5 rounded text-[11px] font-mono text-[#c4b5fd]">$1</code>'
  );
  s = s.replace(
    /(https?:\/\/[^\s<"&]+)/g,
    '<a href="$1" target="_blank" rel="noreferrer" class="text-[#6fa8ff] underline-offset-2 hover:underline">$1</a>'
  );
  return s;
}

function MarkdownBlock({ text }: { text: string }) {
  const lines = text.split("\n");
  const parts: string[] = [];
  let inCodeBlock = false;
  let codeLang = "";
  let codeLines: string[] = [];
  let inList = false;

  function flushList() {
    if (inList) {
      parts.push("</ul>");
      inList = false;
    }
  }

  for (const line of lines) {
    if (!inCodeBlock && line.startsWith("```")) {
      flushList();
      inCodeBlock = true;
      codeLang = line.slice(3).trim();
      codeLines = [];
      continue;
    }
    if (inCodeBlock) {
      if (line.startsWith("```")) {
        inCodeBlock = false;
        const code = codeLines.map(escHtml).join("\n");
        const langLabel = codeLang
          ? `<span class="text-[#6fa8ff] text-[10px] mb-1 block">${escHtml(codeLang)}</span>`
          : "";
        parts.push(
          `<pre class="bg-[#161618] border border-[#2a2a2e] rounded-lg p-3 my-2 overflow-x-auto">${langLabel}<code class="text-xs font-mono text-[#d4d4d8]">${code}</code></pre>`
        );
        codeLines = [];
      } else {
        codeLines.push(line);
      }
      continue;
    }

    if (line.startsWith("# ")) {
      flushList();
      parts.push(
        `<h1 class="text-lg font-bold mt-4 mb-2 text-[#f0f0f0]">${renderInline(line.slice(2))}</h1>`
      );
    } else if (line.startsWith("## ")) {
      flushList();
      parts.push(
        `<h2 class="text-base font-semibold mt-3 mb-1.5 pb-1 border-b border-[#2d2d32] text-[#e8e8ec]">${renderInline(line.slice(3))}</h2>`
      );
    } else if (line.startsWith("### ")) {
      flushList();
      parts.push(
        `<h3 class="text-sm font-semibold mt-2.5 mb-1 text-[#bbb]">${renderInline(line.slice(4))}</h3>`
      );
    } else if (/^[-*] /.test(line)) {
      if (!inList) {
        parts.push('<ul class="my-1 space-y-0.5 ml-1">');
        inList = true;
      }
      parts.push(
        `<li class="flex gap-2 text-sm"><span class="text-[#666] shrink-0 mt-0.5">•</span><span>${renderInline(line.slice(2))}</span></li>`
      );
    } else if (line.trim() === "") {
      flushList();
      parts.push('<div class="h-1.5"></div>');
    } else {
      flushList();
      parts.push(`<p class="text-sm leading-relaxed">${renderInline(line)}</p>`);
    }
  }

  flushList();
  if (inCodeBlock && codeLines.length) {
    const code = codeLines.map(escHtml).join("\n");
    parts.push(
      `<pre class="bg-[#161618] rounded-lg p-3 my-2 overflow-x-auto"><code class="text-xs font-mono">${code}</code></pre>`
    );
  }

  return <div className="leading-relaxed" dangerouslySetInnerHTML={{ __html: parts.join("") }} />;
}

function PrCard({ url }: { url: string }) {
  const m = url.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
  const label = m ? `${m[1]} #${m[2]}` : url;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="mt-2 flex items-center gap-2.5 bg-success/20 border border-success/50 text-success px-3.5 py-2.5 rounded-lg text-sm hover:bg-success/30 transition-colors no-underline"
    >
      <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" className="shrink-0 opacity-80">
        <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354Z" />
      </svg>
      <span className="font-medium">{label}</span>
      <span className="ml-auto text-success/70 text-xs">Pull Request →</span>
    </a>
  );
}

function ToolCallBlock({ name, input }: { name: string; input: unknown }) {
  const inputStr = (() => {
    try {
      const s = JSON.stringify(input ?? {});
      return s.length > 80 ? s.slice(0, 80) + "…" : s;
    } catch {
      return "(unserializable)";
    }
  })();
  return (
    <div className="my-2 flex items-start gap-2 bg-gradient-to-r from-toolcall/10 to-transparent border-l-[3px] border-toolcall pl-3 pr-2 py-2 rounded-r text-xs text-[#9ab8e8] font-mono">
      🔧 {name}({inputStr})
    </div>
  );
}

function ImageBlock({ mediaType, data }: { mediaType: string; data: string }) {
  return (
    <img
      src={`data:${mediaType};base64,${data}`}
      className="max-w-[320px] rounded-lg my-1.5 block"
      alt=""
    />
  );
}

function FailedToolsBlock({ tools }: { tools: FailedTool[] }) {
  return (
    <div className="mt-2.5 bg-danger/8 border border-danger/40 text-[#ff9a9a] px-3 py-2 rounded-md text-xs">
      <div className="font-semibold mb-1 text-[#ffb0b0]">
        이번 응답에서 실패한 MCP 도구 {tools.length}건
      </div>
      <ul className="ml-4 space-y-0.5">
        {tools.map((f, i) => (
          <li key={i}>
            <code className="font-mono">{f.tool}</code> —{" "}
            {(f.error ?? "").slice(0, 200)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ContentBlocks({
  blocks,
  failedTools = [],
}: {
  blocks: ContentBlock[] | string;
  failedTools?: FailedTool[];
}) {
  if (typeof blocks === "string") {
    const prMatches = blocks.match(PR_RE) ?? [];
    const clean = blocks.replace(PR_RE, "").trim();
    return (
      <div className="space-y-0.5">
        {clean && <MarkdownBlock text={clean} />}
        {prMatches.map((u, i) => (
          <PrCard key={`pr-${i}`} url={u} />
        ))}
        {failedTools.length > 0 && <FailedToolsBlock tools={failedTools} />}
      </div>
    );
  }

  const prUrls: string[] = [];
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === "text" && b.text) {
      const prMatches = b.text.match(PR_RE) ?? [];
      for (const u of prMatches) prUrls.push(u);
      const clean = b.text.replace(PR_RE, "").trim();
      if (clean) {
        elements.push(<MarkdownBlock key={i} text={clean} />);
      }
    } else if (b.type === "tool_use") {
      elements.push(<ToolCallBlock key={i} name={b.name ?? ""} input={b.input} />);
    } else if (b.type === "image" && b.source?.data) {
      elements.push(
        <ImageBlock key={i} mediaType={b.source.media_type} data={b.source.data} />
      );
    }
  }

  return (
    <div className="space-y-0.5">
      {elements}
      {prUrls.map((u, i) => (
        <PrCard key={`pr-${i}`} url={u} />
      ))}
      {failedTools.length > 0 && <FailedToolsBlock tools={failedTools} />}
    </div>
  );
}
