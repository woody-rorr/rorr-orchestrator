import type { ContentBlock } from "@/entities/message/model";
import type { FailedTool } from "@/shared/api/client";

const PR_RE = /https:\/\/github\.com\/[^\s<]+\/pull\/\d+/g;
const URL_RE = /(https?:\/\/\S+)/g;
const IMG_EXT_RE = /\.(png|jpe?g|gif|webp|svg)(\?[^\s]*)?$/i;

function TextWithLinks({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(URL_RE.source, "g");
  while ((match = re.exec(text)) !== null) {
    const url = match[0].replace(/[.,;:!?)]+$/, "");
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (IMG_EXT_RE.test(url)) {
      parts.push(
        <a key={match.index} href={url} target="_blank" rel="noreferrer">
          <img
            src={url}
            loading="lazy"
            className="max-w-[320px] rounded-lg my-1.5 block"
            alt=""
          />
        </a>
      );
    } else {
      parts.push(
        <a
          key={match.index}
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-[#6fa8ff] underline-offset-2 hover:underline"
        >
          {url}
        </a>
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function PrCard({ url }: { url: string }) {
  return (
    <div className="mt-2 flex items-start gap-2 bg-success/10 border border-success/40 text-success px-3.5 py-2.5 rounded-lg text-sm">
      <span>✅</span>
      <span>
        PR 생성:{" "}
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="underline text-success"
        >
          {url}
        </a>
      </span>
    </div>
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

export function ContentBlocks({
  blocks,
  failedTools = [],
}: {
  blocks: ContentBlock[] | string;
  failedTools?: FailedTool[];
}) {
  if (typeof blocks === "string") {
    return (
      <div className="whitespace-pre-wrap">
        <TextWithLinks text={blocks} />
      </div>
    );
  }

  const prUrls: string[] = [];
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === "text" && b.text) {
      // Extract PR URLs first
      let clean = b.text;
      const prMatches = clean.match(PR_RE) ?? [];
      for (const u of prMatches) prUrls.push(u);
      // Remove PR lines from plain text so they don't double-render
      clean = clean.replace(PR_RE, "").trim();
      if (clean) {
        elements.push(
          <div key={i} className="whitespace-pre-wrap">
            <TextWithLinks text={clean} />
          </div>
        );
      }
    } else if (b.type === "tool_use") {
      elements.push(
        <ToolCallBlock key={i} name={b.name ?? ""} input={b.input} />
      );
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
      {failedTools.length > 0 && (
        <div className="mt-2.5 bg-danger/8 border border-danger/40 text-[#ff9a9a] px-3 py-2 rounded-md text-xs">
          <div className="font-semibold mb-1 text-[#ffb0b0]">
            이번 응답에서 실패한 MCP 도구 {failedTools.length}건
          </div>
          <ul className="ml-4 space-y-0.5">
            {failedTools.map((f, i) => (
              <li key={i}>
                <code className="font-mono">{f.tool}</code> —{" "}
                {(f.error ?? "").slice(0, 200)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
