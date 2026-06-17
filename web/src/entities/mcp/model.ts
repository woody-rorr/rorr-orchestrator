export interface McpServer {
  name: string;
  label: string;
  domain: string;
  desc: string;
  configured: boolean;
  connected: boolean;
  tools: number;
  toolNames: string[];
  external?: boolean;
}

export type McpStatusType = "active" | "warn" | "off";

export function mcpStatus(m: McpServer): { label: string; type: McpStatusType } {
  if (!m.configured) return { label: "비활성", type: "off" };
  if (!m.connected) return { label: "연결 실패", type: "warn" };
  return { label: "활성", type: "active" };
}

export function mcpServerOf(toolName: string): string {
  const m = String(toolName ?? "").match(/^([^_]+)__/);
  return m ? m[1] : "(직접 도구)";
}
