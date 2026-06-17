import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { fetchStatus } from "@/shared/api/client";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function SystemStatusDialog({ open, onOpenChange }: Props) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const d = await fetchStatus();
      setData(d as Record<string, unknown>);
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>🩺 시스템 상태</DialogTitle>
          <DialogDescription>
            LLM, 자격증명, MCP 연결 상태를 한눈에 보여줍니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {loading && (
            <div className="text-text-dim text-center py-8">로딩 중...</div>
          )}
          {!loading && data && <StatusBody data={data} />}
          {!loading && !data && (
            <div className="text-danger text-center py-8">불러오기 실패</div>
          )}
        </div>

        <DialogFooter>
          <span className="text-sm text-text-muted" />
          <Button onClick={load} disabled={loading}>
            새로고침
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusBody({ data }: { data: Record<string, unknown> }) {
  const llm = data.llm as Record<string, unknown> | undefined;
  const mcps = data.mcps as Array<Record<string, unknown>> | undefined;

  return (
    <>
      {llm && (
        <div className="border border-border rounded-lg p-3">
          <div className="font-semibold mb-2 text-text-muted uppercase text-[11px] tracking-wider">LLM</div>
          <div className="grid grid-cols-2 gap-1 text-xs">
            <span className="text-text-dim">Provider</span>
            <span>{String(llm.provider ?? "")}</span>
            <span className="text-text-dim">Model</span>
            <span>{String(llm.model ?? "")}</span>
            <span className="text-text-dim">Claude CLI</span>
            <span>
              {llm.claude_ok ? (
                <Badge variant="active">OK — {String(llm.claude_ok)}</Badge>
              ) : (
                <Badge variant="warn">오류</Badge>
              )}
            </span>
          </div>
        </div>
      )}
      {mcps && mcps.length > 0 && (
        <div className="border border-border rounded-lg p-3">
          <div className="font-semibold mb-2 text-text-muted uppercase text-[11px] tracking-wider">MCP 서버</div>
          <div className="space-y-1">
            {mcps.map((m, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span>{String(m.label ?? m.name ?? "")}</span>
                <Badge variant={m.connected ? "active" : m.configured ? "warn" : "off"}>
                  {m.connected ? "활성" : m.configured ? "연결 실패" : "비활성"}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
