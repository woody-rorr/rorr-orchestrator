import { fmtTime, escapeHtml } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/shared/ui/collapsible";
import type { McpErrorMap } from "./model";
import { useState } from "react";

interface Props {
  errors: McpErrorMap;
  onClear: () => void;
}

export function McpErrorPanel({ errors, onClear }: Props) {
  const servers = Object.keys(errors).filter((s) => (errors[s]?.length ?? 0) > 0);

  return (
    <div className="border-t border-border mt-2.5 pt-2.5 max-h-[220px] overflow-y-auto">
      <div className="flex items-center justify-between text-[11px] text-text-dim uppercase tracking-wider mb-1.5">
        <span>MCP 에러 로그</span>
        <Button variant="outline" size="sm" onClick={onClear}>
          지우기
        </Button>
      </div>
      {servers.length === 0 ? (
        <div className="text-[11px] text-text-dimmer px-1">아직 에러 없음</div>
      ) : (
        servers.map((srv) => (
          <McpErrorGroup key={srv} server={srv} items={errors[srv] ?? []} />
        ))
      )}
    </div>
  );
}

function McpErrorGroup({
  server,
  items,
}: {
  server: string;
  items: Array<{ tool: string; error: string; ts: number }>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mb-1.5">
      <CollapsibleTrigger className="w-full flex justify-between items-center text-[12px] text-danger font-semibold px-1.5 py-1 bg-danger/8 rounded cursor-pointer">
        <span dangerouslySetInnerHTML={{ __html: escapeHtml(server) }} />
        <span>
          {items.length}건 {open ? "▴" : "▾"}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-1 px-1.5">
        {items
          .slice()
          .reverse()
          .map((it, i) => (
            <div
              key={i}
              className="text-[11px] text-[#d8a0a0] border-l-2 border-[#803030] pl-2 py-1 mb-1 bg-danger/4 rounded-r"
            >
              <div>
                <span className="text-text-dim text-[10px] mr-1">{fmtTime(it.ts)}</span>
                <span className="text-[#ffb0b0] font-mono">{it.tool}</span>
              </div>
              <div className="text-[#c89090] mt-0.5 whitespace-pre-wrap break-words">
                {it.error}
              </div>
            </div>
          ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
