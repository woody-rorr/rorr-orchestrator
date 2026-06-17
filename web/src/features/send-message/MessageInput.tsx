import { useRef, useState, useEffect, type KeyboardEvent, type DragEvent } from "react";
import { Paperclip, Send, StopCircle } from "lucide-react";
import { cn, escapeHtml } from "@/shared/lib/utils";
import { Textarea } from "@/shared/ui/textarea";
import type { PendingAttachment } from "@/entities/message/model";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  loading: boolean;
  attachments: PendingAttachment[];
  onAttach: () => void;
  onRemoveAttachment: (idx: number) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFileChange: (files: FileList) => void;
  quickReplies?: string[];
  onQuickReply?: (text: string) => void;
}

export function MessageInput({
  value,
  onChange,
  onSubmit,
  onStop,
  loading,
  attachments,
  onAttach,
  onRemoveAttachment,
  fileInputRef,
  onFileChange,
  quickReplies = [],
  onQuickReply,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const prevent = (e: globalThis.DragEvent) => e.preventDefault();
    window.addEventListener("dragover", prevent, true);
    window.addEventListener("drop", prevent, true);
    return () => {
      window.removeEventListener("dragover", prevent, true);
      window.removeEventListener("drop", prevent, true);
    };
  }, []);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onSubmit();
    }
  }

  function autoResize() {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }

  const canSend = value.trim().length > 0 || attachments.length > 0;

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      onFileChange(e.dataTransfer.files);
    }
  }

  return (
    <div className="px-4 pb-4 pt-2 max-w-[860px] w-full mx-auto shrink-0">
      {quickReplies.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {quickReplies.map((reply) => (
            <button
              key={reply}
              type="button"
              onClick={() => onQuickReply?.(reply)}
              className="px-3 py-1 text-xs rounded-full border border-[#3a3a42] bg-[#1e1e22] text-[#bbb] hover:border-accent hover:text-accent transition-colors"
            >
              {reply}
            </button>
          ))}
        </div>
      )}
      <div
        className={cn(
          "relative rounded-2xl border bg-[#1e1e22] transition-all duration-150",
          isDragging
            ? "border-accent shadow-[0_0_0_3px_rgba(78,140,255,0.2)]"
            : "border-[#333338] focus-within:border-[#555560] focus-within:shadow-[0_0_0_3px_rgba(78,140,255,0.12)]"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-[#1e1e22]/90 pointer-events-none">
            <div className="flex flex-col items-center gap-2 text-accent">
              <Paperclip size={22} />
              <span className="text-sm font-medium">여기에 놓으면 첨부됩니다</span>
            </div>
          </div>
        )}

        {/* 첨부 파일 칩 */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-4 pt-3 pb-1">
            {attachments.map((att, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 bg-[#2a2a30] border border-[#3a3a42] rounded-full pl-2.5 pr-1.5 py-0.5 text-xs text-[#ccc]"
              >
                <span className="text-[10px]">{att.isText ? "📄" : "🖼️"}</span>
                <span dangerouslySetInnerHTML={{ __html: escapeHtml(att.name) }} />
                <button
                  onClick={() => onRemoveAttachment(i)}
                  className="w-3.5 h-3.5 flex items-center justify-center rounded-full bg-[#3a3a42] hover:bg-[#555] text-[#888] hover:text-white transition-colors text-[10px] leading-none"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {/* 텍스트 입력 */}
        <div className="px-4 pt-3 pb-2">
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={autoResize}
            placeholder="메시지를 입력하세요..."
            rows={1}
            autoFocus
            className="w-full text-[14px] text-[#e8e8ec] placeholder:text-[#555560] leading-[1.6]"
            style={{ height: "auto", minHeight: "24px", maxHeight: "200px" }}
          />
        </div>

        {/* 하단 툴바 */}
        <div className="flex items-center justify-between px-3 pb-2.5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onAttach}
              title="이미지 / md 파일 첨부"
              className="w-7 h-7 flex items-center justify-center rounded-lg text-[#666] hover:text-[#aaa] hover:bg-[#2a2a30] transition-colors"
            >
              <Paperclip size={15} />
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.md,text/markdown"
            multiple
            hidden
            onChange={(e) => e.target.files && onFileChange(e.target.files)}
          />

          {loading ? (
            <button
              type="button"
              onClick={onStop}
              title="요청 중단"
              className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-[#3a1a1a] border border-[#7a2a2a] text-[#ff8a8a] hover:bg-[#4a2020] transition-colors text-xs font-medium"
            >
              <StopCircle size={13} />
              중단
            </button>
          ) : (
            <button
              type="button"
              onClick={onSubmit}
              disabled={!canSend}
              title="전송 (Enter)"
              className={cn(
                "w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-150",
                canSend
                  ? "bg-accent text-white hover:bg-accent-hover shadow-sm"
                  : "bg-[#2a2a30] text-[#555] cursor-not-allowed"
              )}
            >
              <Send size={13} />
            </button>
          )}
        </div>
      </div>

      <p className="text-center text-[11px] text-[#444] mt-1.5">
        Enter로 전송 · Shift+Enter로 줄바꿈
      </p>
    </div>
  );
}
