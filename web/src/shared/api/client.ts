import type { User } from "@/entities/user/model";
import type { McpServer } from "@/entities/mcp/model";
import type { Message, ContentBlock } from "@/entities/message/model";

export interface FailedTool {
  tool: string;
  error: string;
}

export interface ChatFinalEvent {
  type: "final";
  content?: ContentBlock[];
  error?: string;
  failedTools?: FailedTool[];
}

export interface ChatLogEvent {
  type: "log";
  level?: string;
  text?: string;
  ts?: number;
}

export interface ChatStreamCallbacks {
  onLog?: (evt: ChatLogEvent) => void;
  onRequestId?: (id: string) => void;
  signal?: AbortSignal;
}

export async function fetchMe(): Promise<User> {
  const r = await fetch("/me");
  if (!r.ok) throw new Error("unauthorized");
  return r.json();
}

export async function fetchMcps(): Promise<McpServer[]> {
  const r = await fetch("/mcps");
  if (!r.ok) throw new Error("failed to load MCPs");
  return r.json();
}

export async function fetchStatus(): Promise<unknown> {
  const r = await fetch("/status");
  if (!r.ok) throw new Error("failed to load status");
  return r.json();
}

export async function cancelRequest(requestId: string): Promise<void> {
  await fetch("/chat/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ request_id: requestId }),
  });
}

export async function logout(): Promise<void> {
  await fetch("/auth/logout", { method: "POST" });
}

export async function sendChat(
  messages: Message[],
  opts: {
    enabledMcps: string[];
    disabledTools: string[];
    requestId: string;
  },
  callbacks: ChatStreamCallbacks
): Promise<ChatFinalEvent> {
  const r = await fetch("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      enabled_mcps: opts.enabledMcps,
      disabled_tools: opts.disabledTools,
      stream: true,
      request_id: opts.requestId,
    }),
    signal: callbacks.signal,
  });

  if (!r.ok || !r.body) {
    const raw = await r.text().catch(() => "");
    const snippet = raw.replace(/<[^>]+>/g, "").trim().slice(0, 300) || "(빈 응답)";
    let hint = "";
    if (r.status === 504) hint = "\n→ ALB idle timeout. Claude 응답이 60초를 초과.";
    else if (r.status === 502) hint = "\n→ 오케스트레이터 컨테이너가 응답 못 함.";
    throw new Error(`HTTP ${r.status}\n${snippet}${hint}`);
  }

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let finalEvt: ChatFinalEvent | null = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let evt: Record<string, unknown>;
      try { evt = JSON.parse(line); } catch { continue; }
      if (evt.type === "log") callbacks.onLog?.(evt as unknown as ChatLogEvent);
      else if (evt.type === "request_id") callbacks.onRequestId?.(evt.request_id as string);
      else if (evt.type === "final") finalEvt = evt as unknown as ChatFinalEvent;
    }
  }

  if (!finalEvt) throw new Error("스트림이 final 없이 종료됨");
  return finalEvt;
}
