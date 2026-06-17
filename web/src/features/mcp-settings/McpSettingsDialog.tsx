import { useState } from "react";
import { ChevronDown, Check, Globe, Server, Wrench, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Switch } from "@/shared/ui/switch";
import { Badge } from "@/shared/ui/badge";
import { ScrollArea } from "@/shared/ui/scroll-area";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/shared/ui/collapsible";
import type { McpServer, McpStatusType } from "@/entities/mcp/model";
import { mcpStatus } from "@/entities/mcp/model";
import { cn, escapeHtml } from "@/shared/lib/utils";

function domainIcon(domain: string) {
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
  const totalTools = catalog
    .filter((m) => enabledMcps.has(m.name))
    .reduce((acc, m) => acc + (m.tools ?? 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col gap-0 p-0 max-h-[82vh]">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="text-base font-semibold">MCP 도구 설정</DialogTitle>
              <DialogDescription className="mt-0.5 text-xs">
                사용할 MCP 서버와 도구를 선택하세요. 권한이 있는 항목만 표시됩니다.
              </DialogDescription>
            </div>
            <DialogClose asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 -mt-0.5 -mr-1">
                <X className="h-4 w-4" />
              </Button>
            </DialogClose>
          </div>
        </DialogHeader>

        {/* Body */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-4 py-3 space-y-4">
            {internal.length > 0 && (
              <Section
                label="내부 MCP"
                icon={<Server className="h-3 w-3" />}
                count={internal.length}
              >
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
              </Section>
            )}
            {external.length > 0 && (
              <Section
                label="외부 MCP"
                icon={<Globe className="h-3 w-3" />}
                count={external.length}
                accent
              >
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
              </Section>
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t border-border shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-text-dim">
            <Wrench className="h-3.5 w-3.5" />
            <span>활성 MCP {enabledMcps.size}개 · 도구 {totalTools}개</span>
          </div>
          <Button variant="accent" size="md" onClick={onSave}>
            저장하고 채팅 시작
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  label,
  icon,
  count,
  accent,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  count: number;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1.5 mb-2 text-[11px] font-medium uppercase tracking-[0.5px]",
          accent ? "text-[#f0a868]" : "text-text-dim"
        )}
      >
        {icon}
        <span>{label}</span>
        <span
          className={cn(
            "ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
            accent
              ? "bg-[rgba(240,168,104,0.15)] text-[#f0a868]"
              : "bg-border-input text-text-dim"
          )}
        >
          {count}
        </span>
      </div>
      <div className="space-y-2">{children}</div>
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
  const [open, setOpen] = useState(false);
  const { label: statusLabel, type: statusType } = mcpStatus(mcp);
  const toolNames = mcp.toolNames ?? [];
  const enabledCount = toolNames.filter((t) => !disabledTools.has(`${mcp.name}__${t}`)).length;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          "rounded-lg border transition-colors",
          enabled
            ? "border-border bg-bg-card"
            : "border-border-subtle bg-bg-card/50 opacity-60"
        )}
      >
        {/* Main row */}
        <div className="flex items-center gap-3 px-3.5 py-3">
          <div className="w-9 h-9 rounded-lg bg-mcp-iconbg flex items-center justify-center text-mcp-icon text-base shrink-0">
            {domainIcon(mcp.domain)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">{mcp.label}</span>
              <Badge variant={statusVariant[statusType]}>{statusLabel}</Badge>
            </div>
            <p className="text-xs text-text-dim truncate mt-0.5">{mcp.desc}</p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {toolNames.length > 0 && (
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 gap-1 text-text-dim hover:text-text"
                >
                  <Wrench className="h-3 w-3" />
                  <span className="text-xs tabular-nums">
                    {enabledCount}/{toolNames.length}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 transition-transform duration-200",
                      open && "rotate-180"
                    )}
                  />
                </Button>
              </CollapsibleTrigger>
            )}
            <Switch
              checked={enabled}
              disabled={!mcp.connected}
              onCheckedChange={(v) => onToggleMcp(mcp.name, v)}
            />
          </div>
        </div>

        {/* Tool list */}
        {toolNames.length > 0 && (
          <CollapsibleContent>
            <div className="border-t border-border px-3.5 py-2 grid grid-cols-1 gap-0.5">
              {toolNames.map((t) => {
                const key = `${mcp.name}__${t}`;
                const checked = !disabledTools.has(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onToggleTool(key, !checked)}
                    className={cn(
                      "flex items-center gap-2.5 text-xs py-1.5 px-2 rounded-md text-left",
                      "transition-colors hover:bg-border-subtle",
                      !checked && "text-text-dim"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                        checked
                          ? "bg-accent border-accent text-white"
                          : "border-border-input bg-transparent"
                      )}
                    >
                      {checked && <Check className="h-2.5 w-2.5" />}
                    </span>
                    <span
                      className={cn("font-mono truncate", !checked && "line-through")}
                      dangerouslySetInnerHTML={{ __html: escapeHtml(t) }}
                    />
                  </button>
                );
              })}
            </div>
          </CollapsibleContent>
        )}
      </div>
    </Collapsible>
  );
}
