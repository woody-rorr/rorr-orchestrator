import { Avatar, AvatarImage, AvatarFallback } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { McpErrorPanel } from "@/features/mcp-errors/McpErrorPanel";
import type { Chat, TagType } from "@/entities/chat/model";
import type { User } from "@/entities/user/model";
import type { McpErrorMap } from "@/features/mcp-errors/model";
import { cn } from "@/shared/lib/utils";
import { PowerIcon } from "lucide-react";

const tagLabel: Record<TagType, string> = {
  backend: "Backend API",
  web: "Web",
  extension: "Extension",
  notion: "Notion",
  infra: "Infra",
};

interface Props {
  chats: Chat[];
  currentId: string | null;
  user: User | null;
  mcpErrors: McpErrorMap;
  tags: TagType[];
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
  tags,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  onClearAllChats,
  onOpenSettings,
  onOpenStatus,
  onLogout,
  onClearErrors,
}: Props) {
  return (
    <aside className="w-[260px] shrink-0 bg-bg-sidebar border-r border-border flex flex-col py-3 px-3 overflow-hidden">
      <Button className="w-full justify-start font-semibold mb-2" onClick={onNewChat}>
        + 새 대화
      </Button>

      <div className="flex items-center justify-between text-[11px] text-text-dim uppercase tracking-wider my-4 mx-1">
        <span>최근 대화</span>
        <button
          onClick={onClearAllChats}
          className="text-[11px] text-text-dim hover:text-danger transition-colors"
        >
          전체 삭제
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {chats
          .slice()
          .reverse()
          .map((c) => (
            <RecentItem
              key={c.id}
              chat={c}
              active={c.id === currentId}
              onSelect={() => onSelectChat(c.id)}
              onDelete={() => onDeleteChat(c.id)}
            />
          ))}
      </div>

      <Button
        variant="outline"
        className="w-full justify-start mt-2"
        onClick={onOpenSettings}
      >
        ⚙ MCP 도구 설정
      </Button>

      {tags.length > 0 && (
        <div className="flex flex-row flex-wrap gap-x-3 gap-y-1 mt-2 px-1">
          {tags.map((t) => (
            <span key={t} className={cn("text-[11px] font-medium", {
              "text-[#b48aff]": t === "backend",
              "text-[#7aa4ff]": t === "web",
              "text-[#4dbda8]": t === "extension",
              "text-[#e0c060]": t === "notion",
              "text-[#f08060]": t === "infra",
            })}>
              {tagLabel[t]}
            </span>
          ))}
        </div>
      )}

      <Button
        variant="outline"
        className="w-full justify-start mt-2"
        onClick={onOpenStatus}
      >
        🩺 시스템 상태
      </Button>

      <McpErrorPanel errors={mcpErrors} onClear={onClearErrors} />

      <div className="border-t border-border pt-3 mt-2 flex items-center gap-2.5 text-sm text-text-muted">
        <Avatar>
          <AvatarImage src={user?.avatar} />
          <AvatarFallback>
            {(user?.name ?? user?.login ?? "?")[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] text-[#ccc] truncate">{user?.name ?? user?.login ?? "…"}</div>
          {user?.login && (
            <div className="text-[11px] text-text-dim">@{user.login}</div>
          )}
        </div>
        <button
          onClick={onLogout}
          title="로그아웃"
          className="text-text-dim hover:text-text transition-colors"
        >
          <PowerIcon size={16} />
        </button>
      </div>
    </aside>
  );
}

function RecentItem({
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
        "group flex items-center gap-1.5 px-2.5 py-2 rounded-md text-[13px] cursor-pointer mb-0.5",
        active ? "bg-[#2a2a30] text-white" : "text-[#ccc] hover:bg-[#1d1d22]"
      )}
    >
      <span className="flex-1 truncate" onClick={onSelect}>
        {chat.title || "(제목 없음)"}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="opacity-0 group-hover:opacity-100 text-text-dim hover:text-danger hover:bg-[#3a2020] rounded px-1 text-sm transition-all"
      >
        ✕
      </button>
    </div>
  );
}
