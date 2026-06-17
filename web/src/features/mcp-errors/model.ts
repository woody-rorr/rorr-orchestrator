import { mcpServerOf } from "@/entities/mcp/model";
import { MCP_ERRORS_KEY } from "@/shared/config";

export interface McpErrorEntry {
  tool: string;
  error: string;
  ts: number;
}

export type McpErrorMap = Record<string, McpErrorEntry[]>;

export function loadMcpErrors(): McpErrorMap {
  try {
    return JSON.parse(localStorage.getItem(MCP_ERRORS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function saveMcpErrors(map: McpErrorMap): void {
  localStorage.setItem(MCP_ERRORS_KEY, JSON.stringify(map));
}

export function recordFailedTools(
  prev: McpErrorMap,
  list: Array<{ tool: string; error?: string }>
): McpErrorMap {
  if (!list.length) return prev;
  const now = Date.now();
  const next = { ...prev };
  for (const f of list) {
    const srv = mcpServerOf(f.tool);
    const entries = [...(next[srv] ?? [])];
    entries.push({ tool: f.tool, error: f.error ?? "", ts: now });
    next[srv] = entries.slice(-50);
  }
  return next;
}
