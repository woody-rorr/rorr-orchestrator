import { useState } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { ScrollArea } from "@/shared/ui/scroll-area";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/shared/ui/collapsible";
import type { Chat } from "@/entities/chat/model";
import type { User } from "@/entities/user/model";
import type { McpErrorMap } from "@/features/mcp-errors/model";
import { cn, escapeHtml, fmtTime } from "@/shared/lib/utils";
import {
  Plus,
  Settings2,
  Activity,
  LogOut,
  Trash2,
  ChevronDown,
  ChevronUp,
  MessageSquare,
} from "lucide-react";

interface Props {
  chats: Chat[];
  currentId: string | null;
  user: User | null;
  mcpErrors: McpErrorMap;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onClearAllChats: () => void;
  onOpenSettings: () => void;
  onOpenStatus: () => void;
  onLogout: () => void;
  onClearErrors: () => void;
}

export function Sidebar({
  chats,
  currentId,
  user,
  mcpErrors,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  onClearAllChats,
  onOpenSettings,
  onOpenStatus,
  onLogout,
  onClearErrors,
}: Props) {
  const errorCount = Object.values(mcpErrors).reduce((a, b) => a + (b?.length ?? 0), 0);

  return (
    <aside className="w-[260px] shrink-0 flex flex-col h-full bg-[hsl(var(--card))] border-r border-[hsl(var(--border))]">
      {/* Header */}
      <div className="px-3 pt-4 pb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-[hsl(var(--foreground))]">RORR</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          onClick={onNewChat}
          title="새 대화"
        >
          <Plus size={16} />
        </Button>
      </div>

      <div className="px-3 pb-2">
        <div className="h-px bg-[hsl(var(--border))]" />
      </div>

      {/* Chat list */}
      <div className="px-3 pb-1 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
          최근 대화
        </span>
        {chats.length > 0 && (
          <button
            onClick={onClearAllChats}
            className="text-[10px] text-[hsl(var(--muted-foreground))] hover:text-destructive transition-colors"
          >
            전체 삭제
          </button>
        )}
      </div>

      <ScrollArea className="flex-1 px-2">
        <div className="py-1 space-y-0.5">
          {chats.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-[hsl(var(--muted-foreground))]">
              <MessageSquare size={20} strokeWidth={1.5} />
              <span className="text-xs">대화 없음</span>
            </div>
          )}
          {chats
            .slice()
            .reverse()
            .map((c) => (
              <ChatItem
                key={c.id}
                chat={c}
                active={c.id === currentId}
                onSelect={() => onSelectChat(c.id)}
                onDelete={() => onDeleteChat(c.id)}
              />
            ))}
        </div>
      </ScrollArea>

      {/* Bottom actions */}
      <div className="px-2 pb-2 pt-1 space-y-0.5">
        <div className="h-px bg-[hsl(var(--border))] mb-2" />

        <Button
          variant="ghost"
          className="w-full justify-start gap-2.5 h-9 text-sm font-normal text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]"
          onClick={onOpenSettings}
        >
          <Settings2 size={15} />
          MCP 도구 설정
        </Button>

        <Button
          variant="ghost"
          className="w-full justify-start gap-2.5 h-9 text-sm font-normal text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]"
          onClick={onOpenStatus}
        >
          <Activity size={15} />
          시스템 상태
        </Button>

        {/* MCP Error panel */}
        {errorCount > 0 && (
          <McpErrorPanel errors={mcpErrors} onClear={onClearErrors} />
        )}

      </div>

      {/* User profile */}
      <div className="px-3 py-3 border-t border-[hsl(var(--border))] flex items-center gap-2.5">
        <Avatar className="h-7 w-7 shrink-0">
          <AvatarImage src={user?.avatar} />
          <AvatarFallback className="text-xs bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]">
            {(user?.name ?? user?.login ?? "?")[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] text-[hsl(var(--foreground))] truncate leading-tight">
            {user?.name ?? user?.login ?? "…"}
          </div>
          {user?.login && (
            <div className="text-[11px] text-[hsl(var(--muted-foreground))] truncate leading-tight">
              @{user.login}
            </div>
          )}
        </div>
        <button
          onClick={onLogout}
          title="로그아웃"
          className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors shrink-0"
        >
          <LogOut size={15} />
        </button>
      </div>
    </aside>
  );
}

function ChatItem({
  chat,
  active,
  onSelect,
  onDelete,
}: {
  chat: Chat;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "group relative flex items-center gap-1.5 px-2.5 py-2 rounded-md text-[13px] cursor-pointer transition-colors",
        active
          ? "bg-[hsl(var(--accent))] text-[hsl(var(--foreground))]"
          : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]"
      )}
    >
      <span className="flex-1 truncate pr-4" onClick={onSelect}>
        {chat.title || "(제목 없음)"}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className={cn(
          "absolute right-2 shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity",
          "text-[hsl(var(--muted-foreground))] hover:text-destructive"
        )}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

function McpErrorPanel({
  errors,
  onClear,
}: {
  errors: McpErrorMap;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const servers = Object.keys(errors).filter((s) => (errors[s]?.length ?? 0) > 0);
  const total = servers.reduce((a, s) => a + (errors[s]?.length ?? 0), 0);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full flex items-center justify-between px-2.5 py-2 rounded-md text-[13px] text-destructive hover:bg-destructive/10 transition-colors">
        <span className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-destructive/20 text-[10px] font-bold">
            {total}
          </span>
          MCP 에러
        </span>
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 mb-1 max-h-[180px] overflow-y-auto space-y-1.5 px-1">
          {servers.map((srv) => (
            <McpErrorGroup key={srv} server={srv} items={errors[srv] ?? []} />
          ))}
        </div>
        <button
          onClick={onClear}
          className="w-full text-[11px] text-[hsl(var(--muted-foreground))] hover:text-destructive py-1 transition-colors"
        >
          에러 로그 지우기
        </button>
      </CollapsibleContent>
    </Collapsible>
  );
}

function McpErrorGroup({
  server,
  items,
}: {
  server: string;
  items: Array<{ tool: string; error: string; ts: number }>;
}) {
  return (
    <div className="rounded-md bg-destructive/8 border border-destructive/15 overflow-hidden">
      <div className="px-2.5 py-1.5 text-[11px] font-semibold text-destructive border-b border-destructive/15">
        <span dangerouslySetInnerHTML={{ __html: escapeHtml(server) }} />
        <span className="ml-1 text-destructive/60">({items.length})</span>
      </div>
      <div className="divide-y divide-destructive/10">
        {items
          .slice()
          .reverse()
          .slice(0, 3)
          .map((it, i) => (
            <div key={i} className="px-2.5 py-1.5">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{fmtTime(it.ts)}</span>
                <span className="text-[11px] font-mono text-destructive/80">{it.tool}</span>
              </div>
              <div className="text-[11px] text-destructive/60 whitespace-pre-wrap break-words line-clamp-2">
                {it.error}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
