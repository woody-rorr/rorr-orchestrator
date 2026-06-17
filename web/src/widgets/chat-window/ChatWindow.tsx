import { useEffect, useRef } from "react";
import { fmtTs, escapeHtml } from "@/shared/lib/utils";
import { cn } from "@/shared/lib/utils";
import { ContentBlocks } from "./MessageRenderer";
import { ScrollArea } from "@/shared/ui/scroll-area";
import type { ContentBlock, Message, PendingAttachment } from "@/entities/message/model";
import type { FailedTool } from "@/shared/api/client";

export interface DisplayMessage {
  role: "user" | "assistant";
  content: ContentBlock[] | string;
  attachments?: PendingAttachment[];
  failedTools?: FailedTool[];
  ts?: number;
}

interface ChatWindowProps {
  messages: DisplayMessage[];
  loading?: boolean;
}

export function ChatWindow({ messages, loading }: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, loading]);

  return (
    <ScrollArea className="flex-1">
      <div className="px-6 py-6 max-w-[860px] w-full mx-auto">
        {messages.length === 0 && !loading && (
          <div className="text-center text-text-dimmer py-20 text-sm">
            메시지를 입력해 시작하세요.
          </div>
        )}

        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}

        {loading && <TypingIndicator />}

        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}

function MessageBubble({ message }: { message: DisplayMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("mb-4 flex flex-col", isUser ? "items-end" : "items-start")}>
      <div className="text-[11px] text-white mb-1 mx-1">{fmtTs(message.ts)}</div>

      <div
        className={cn(
          "px-3.5 py-3 rounded-xl text-sm leading-relaxed break-words",
          isUser
            ? "bg-[#2a2a2e] max-w-[80%] rounded-2xl"
            : "bg-[#e8e8ec] text-[#111] max-w-[92%] rounded-2xl"
        )}
      >
        {isUser ? (
          <UserContent content={message.content} attachments={message.attachments} />
        ) : (
          <ContentBlocks
            blocks={message.content}
            failedTools={message.failedTools}
          />
        )}
      </div>
    </div>
  );
}

function UserContent({
  content,
  attachments = [],
}: {
  content: ContentBlock[] | string;
  attachments?: PendingAttachment[];
}) {
  return (
    <div className="space-y-1">
      {attachments.map((att, i) => (
        <div key={i} className="inline-flex items-center gap-1.5 bg-[#1f1f25] rounded px-2 py-1 text-xs mr-1">
          {att.isText ? "📄" : "🖼️"}
          <span dangerouslySetInnerHTML={{ __html: escapeHtml(att.name) }} />
        </div>
      ))}
      {typeof content === "string" ? (
        <div className="whitespace-pre-wrap">{content}</div>
      ) : (
        content
          .filter((b) => b.type === "text" && b.text)
          .map((b, i) => (
            <div key={i} className="whitespace-pre-wrap">
              {b.text}
            </div>
          ))
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-3 mb-4 px-1">
      <span className="w-5 h-5 rounded-full border-2 border-[#333] border-t-accent animate-spin shrink-0" />
      <span className="text-sm text-text-dim">처리 중...</span>
    </div>
  );
}

// ChatPage에서 사용하는 메시지 빌더 헬퍼
export function buildUserMessage(
  text: string,
  attachments: PendingAttachment[]
): DisplayMessage {
  const contentBlocks: ContentBlock[] = [];
  for (const att of attachments) {
    if (att.isText) {
      contentBlocks.push({
        type: "text",
        text: `[첨부 파일: ${att.name}]\n\`\`\`markdown\n${att.textContent ?? ""}\n\`\`\``,
      });
    } else {
      contentBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: att.mediaType ?? "",
          data: att.base64 ?? "",
        },
      });
    }
  }
  if (text) contentBlocks.push({ type: "text", text });
  return {
    role: "user",
    content: contentBlocks,
    attachments,
  };
}

export function buildAssistantMessage(
  content: Message["content"],
  failedTools: FailedTool[]
): DisplayMessage {
  return {
    role: "assistant",
    content: Array.isArray(content) ? content : [{ type: "text", text: String(content ?? "") }],
    failedTools,
  };
}
