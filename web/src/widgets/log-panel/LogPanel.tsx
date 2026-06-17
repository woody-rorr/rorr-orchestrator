import { useEffect, useRef, useState } from "react";
import { fmtTime } from "@/shared/lib/utils";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

export interface LogEntry {
  level?: string;
  text?: string;
  ts?: number;
}

interface Props {
  entries: LogEntry[];
  onClear: () => void;
}

export function LogPanel({ entries, onClear }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [entries.length]);

  return (
    <aside
      className={cn(
        "flex-shrink-0 bg-bg-logpanel border-l border-border-subtle flex flex-col overflow-hidden transition-[width] duration-150",
        collapsed ? "w-8" : "w-[360px]"
      )}
    >
      <div
        className={cn(
          "flex items-center border-b border-border-subtle px-3 py-2.5",
          collapsed ? "justify-center" : "justify-between"
        )}
      >
        {!collapsed && (
          <span className="text-[12px] text-text-dim uppercase tracking-wider">
            실시간 로그
          </span>
        )}
        <div className="flex gap-1">
          {!collapsed && (
            <Button variant="ghost" size="icon" onClick={onClear} title="비우기" className="h-6 w-6 text-xs">
              ×
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? "펼치기" : "접기"}
            className="h-6 w-6 text-xs"
          >
            {collapsed ? "⇤" : "⇥"}
          </Button>
        </div>
      </div>

      {!collapsed && (
        <div
          ref={bodyRef}
          className="flex-1 overflow-y-auto p-2 font-mono text-[11.5px] leading-[1.55] text-[#bcbcc2] whitespace-pre-wrap break-all"
        >
          {entries.length === 0 && (
            <div className="text-text-dimmer italic">로그가 없습니다.</div>
          )}
          {entries.map((e, i) => {
            const text = String(e.text ?? "");
            const level = e.level ?? "info";
            const isWarn = level === "warn";
            const isError = level === "error";
            const isRoute = text.startsWith("[route]");
            return (
              <div
                key={i}
                className={cn(
                  "py-0.5 border-b border-dashed border-[#161619]",
                  isWarn && "text-[#e0c060]",
                  isError && "text-danger",
                  isRoute && "text-[#8ab4ff]"
                )}
              >
                <span className="text-text-dim mr-1.5">{fmtTime(e.ts)}</span>
                {text}
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
