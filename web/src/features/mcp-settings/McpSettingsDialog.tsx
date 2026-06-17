import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Switch } from "@/shared/ui/switch";
import { Badge } from "@/shared/ui/badge";
import type { McpServer, McpStatusType } from "@/entities/mcp/model";
import { mcpStatus } from "@/entities/mcp/model";
import { cn, escapeHtml } from "@/shared/lib/utils";

function iconFor(domain: string): string {
  const map: Record<string, string> = {
    infra: "☁",
    frontend: "🖥",
    backend: "⚙",
  };
  return map[domain] ?? "🧩";
}

const statusVariant: Record<McpStatusType, "active" | "warn" | "off"> = {
  active: "active",
  warn: "warn",
  off: "off",
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  catalog: McpServer[];
  enabledMcps: Set<string>;
  disabledTools: Set<string>;
  onToggleMcp: (name: string, enabled: boolean) => void;
  onToggleTool: (key: string, enabled: boolean) => void;
  onSave: () => void;
}

export function McpSettingsDialog({
  open,
  onOpenChange,
  catalog,
  enabledMcps,
  disabledTools,
  onToggleMcp,
  onToggleTool,
  onSave,
}: Props) {
  const internal = catalog.filter((m) => !m.external);
  const external = catalog.filter((m) => m.external);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>MCP 도구 설정</DialogTitle>
          <DialogDescription>
            사용할 도구를 선택하세요. 권한이 있는 항목만 표시됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          {internal.length > 0 && (
            <>
              <SectionLabel label="내부 MCP" kind="internal" />
              {internal.map((m) => (
                <McpRow
                  key={m.name}
                  mcp={m}
                  enabled={enabledMcps.has(m.name)}
                  disabledTools={disabledTools}
                  onToggleMcp={onToggleMcp}
                  onToggleTool={onToggleTool}
                />
              ))}
            </>
          )}
          {external.length > 0 && (
            <>
              <SectionLabel label="외부 MCP" kind="external" />
              {external.map((m) => (
                <McpRow
                  key={m.name}
                  mcp={m}
                  enabled={enabledMcps.has(m.name)}
                  disabledTools={disabledTools}
                  onToggleMcp={onToggleMcp}
                  onToggleTool={onToggleTool}
                />
              ))}
            </>
          )}
        </div>

        <DialogFooter>
          <span className="text-sm text-text-muted">활성 도구 {enabledMcps.size}개</span>
          <Button onClick={onSave}>저장하고 채팅 시작</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SectionLabel({ label, kind }: { label: string; kind: "internal" | "external" }) {
  return (
    <div
      className={cn(
        "text-[11px] uppercase tracking-[0.6px] px-1 py-3 border-b mb-1.5",
        kind === "external"
          ? "text-[#f0a868] border-[rgba(240,168,104,0.25)] before:content-['🌐  ']"
          : "text-text-dim border-border-input before:content-['🏠  ']"
      )}
    >
      {label}
    </div>
  );
}

function McpRow({
  mcp,
  enabled,
  disabledTools,
  onToggleMcp,
  onToggleTool,
}: {
  mcp: McpServer;
  enabled: boolean;
  disabledTools: Set<string>;
  onToggleMcp: (name: string, enabled: boolean) => void;
  onToggleTool: (key: string, enabled: boolean) => void;
}) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const { label: statusLabel, type: statusType } = mcpStatus(mcp);
  const toolNames = mcp.toolNames ?? [];

  return (
    <div className="border border-border rounded-[10px] p-3.5 mb-2">
      <div className="flex items-center gap-3.5">
        <div className="w-10 h-10 rounded-[10px] bg-mcp-iconbg flex items-center justify-center text-mcp-icon text-lg shrink-0">
          {iconFor(mcp.domain)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">{mcp.label}</div>
          <div className="text-xs text-text-dim">
            {mcp.desc}
            {mcp.connected ? ` · ${mcp.tools} tools` : ""}
          </div>
        </div>
        <Badge variant={statusVariant[statusType]}>{statusLabel}</Badge>
        {toolNames.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setToolsOpen((v) => !v)}
          >
            {toolsOpen ? "▴ 접기" : "▾ 도구"}
          </Button>
        )}
        <Switch
          checked={enabled}
          disabled={!mcp.connected}
          onCheckedChange={(v) => onToggleMcp(mcp.name, v)}
        />
      </div>

      {toolNames.length > 0 && toolsOpen && (
        <div className="mt-2 pt-2 border-t border-border">
          {toolNames.map((t) => {
            const key = `${mcp.name}__${t}`;
            const isDisabled = disabledTools.has(key);
            return (
              <label
                key={key}
                className={cn(
                  "flex items-center gap-2 text-xs py-1 px-1.5 cursor-pointer",
                  isDisabled && "line-through text-text-dim"
                )}
              >
                <input
                  type="checkbox"
                  checked={!isDisabled}
                  onChange={(e) => onToggleTool(key, e.target.checked)}
                  className="cursor-pointer"
                />
                <span
                  dangerouslySetInnerHTML={{ __html: escapeHtml(t) }}
                />
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
