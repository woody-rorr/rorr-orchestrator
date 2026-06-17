import { useEffect, useState } from "react";
import { RefreshCw, X, Cpu, Server, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
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
import { Badge } from "@/shared/ui/badge";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { fetchStatus } from "@/shared/api/client";
import { cn } from "@/shared/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function SystemStatusDialog({ open, onOpenChange }: Props) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const d = await fetchStatus();
      setData(d as Record<string, unknown>);
      setLastUpdated(new Date());
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col gap-0 p-0 max-h-[82vh]">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="text-base font-semibold">시스템 상태</DialogTitle>
              <DialogDescription className="mt-0.5 text-xs">
                LLM, 자격증명, MCP 연결 상태를 한눈에 확인합니다.
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
          <div className="px-4 py-3">
            {loading && <LoadingState />}
            {!loading && data && <StatusBody data={data} />}
            {!loading && !data && <ErrorState onRetry={load} />}
          </div>
        </ScrollArea>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t border-border shrink-0">
          <span className="text-xs text-text-dim">
            {lastUpdated
              ? `마지막 업데이트 ${lastUpdated.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
              : ""}
          </span>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            새로고침
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-text-dim">
      <RefreshCw className="h-6 w-6 animate-spin opacity-40" />
      <span className="text-sm">상태 조회 중...</span>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <XCircle className="h-8 w-8 text-danger opacity-60" />
      <span className="text-sm text-text-dim">상태 정보를 불러올 수 없습니다.</span>
      <Button variant="outline" size="sm" onClick={onRetry} className="mt-1 gap-1.5">
        <RefreshCw className="h-3.5 w-3.5" />
        다시 시도
      </Button>
    </div>
  );
}

function StatusBody({ data }: { data: Record<string, unknown> }) {
  const llm = data.llm as Record<string, unknown> | undefined;
  const mcps = data.mcps as Array<Record<string, unknown>> | undefined;

  return (
    <div className="space-y-3">
      {llm && <LlmSection llm={llm} />}
      {mcps && mcps.length > 0 && <McpSection mcps={mcps} />}
    </div>
  );
}

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-2 text-[11px] font-medium uppercase tracking-[0.5px] text-text-dim">
      {icon}
      <span>{label}</span>
    </div>
  );
}

function LlmSection({ llm }: { llm: Record<string, unknown> }) {
  const ok = Boolean(llm.claude_ok);
  return (
    <div className="rounded-lg border border-border bg-bg-card p-3.5">
      <SectionHeader icon={<Cpu className="h-3 w-3" />} label="LLM" />
      <div className="space-y-2">
        <Row label="Provider" value={String(llm.provider ?? "—")} />
        <Row label="Model" value={String(llm.model ?? "—")} mono />
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-dim">Claude CLI</span>
          {ok ? (
            <span className="flex items-center gap-1.5 text-success">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>정상 — {String(llm.claude_ok)}</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-danger">
              <XCircle className="h-3.5 w-3.5" />
              <span>오류</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function McpSection({ mcps }: { mcps: Array<Record<string, unknown>> }) {
  const activeCount = mcps.filter((m) => m.connected).length;
  return (
    <div className="rounded-lg border border-border bg-bg-card p-3.5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.5px] text-text-dim">
          <Server className="h-3 w-3" />
          <span>MCP 서버</span>
        </div>
        <span className="text-[11px] text-text-dim tabular-nums">
          {activeCount}/{mcps.length} 활성
        </span>
      </div>
      <div className="space-y-1.5">
        {mcps.map((m, i) => {
          const connected = Boolean(m.connected);
          const configured = Boolean(m.configured);
          return (
            <div key={i} className="flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                {connected ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                ) : configured ? (
                  <AlertCircle className="h-3.5 w-3.5 text-warn shrink-0" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-text-dim shrink-0" />
                )}
                <span className="truncate">{String(m.label ?? m.name ?? "")}</span>
              </div>
              <Badge variant={connected ? "active" : configured ? "warn" : "off"}>
                {connected ? "활성" : configured ? "연결 실패" : "비활성"}
              </Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-xs gap-3">
      <span className="text-text-dim shrink-0">{label}</span>
      <span className={cn("truncate text-right", mono && "font-mono text-[11px]")}>{value}</span>
    </div>
  );
}
