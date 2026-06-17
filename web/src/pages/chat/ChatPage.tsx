import { useState, useEffect } from "react";
import { Sidebar } from "@/widgets/sidebar/Sidebar";
import { Header } from "@/widgets/header/Header";
import {
  ChatWindow,
  buildUserMessage,
  buildAssistantMessage,
  type DisplayMessage,
} from "@/widgets/chat-window/ChatWindow";
import { MessageInput } from "@/features/send-message/MessageInput";
import { LogPanel, type LogEntry } from "@/widgets/log-panel/LogPanel";
import { McpSettingsDialog } from "@/features/mcp-settings/McpSettingsDialog";
import { SystemStatusDialog } from "@/features/system-status/SystemStatusDialog";
import { useAttachFile } from "@/features/attach-file/useAttachFile";
import {
  loadMcpErrors,
  saveMcpErrors,
  recordFailedTools,
  type McpErrorMap,
} from "@/features/mcp-errors/model";
import type { Chat, TagType } from "@/entities/chat/model";
import { detectTags } from "@/entities/chat/model";
import type { McpServer } from "@/entities/mcp/model";
import type { User } from "@/entities/user/model";
import type { ContentBlock, Message } from "@/entities/message/model";
import { STORAGE_KEY, ENABLED_KEY, DISABLED_TOOLS_KEY } from "@/shared/config";
import { fetchMe, fetchMcps, sendChat, cancelRequest, logout } from "@/shared/api/client";
import { uid } from "@/shared/lib/utils";

function loadChats(): Chat[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveChats(chats: Chat[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
}

function loadEnabledMcps(catalog: McpServer[]): Set<string> {
  const raw = localStorage.getItem(ENABLED_KEY);
  if (raw) {
    try { return new Set(JSON.parse(raw)); } catch {}
  }
  return new Set(catalog.filter((m) => m.connected).map((m) => m.name));
}

function persistEnabledMcps(s: Set<string>) {
  localStorage.setItem(ENABLED_KEY, JSON.stringify([...s]));
}

function loadDisabledTools(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISABLED_TOOLS_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

function persistDisabledTools(s: Set<string>) {
  localStorage.setItem(DISABLED_TOOLS_KEY, JSON.stringify([...s]));
}

export function ChatPage() {
  const [chats, setChats] = useState<Chat[]>(() => loadChats());
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>([]);
  const [title, setTitle] = useState("새 대화");
  const [tags, setTags] = useState<TagType[]>([]);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [mcpCatalog, setMcpCatalog] = useState<McpServer[]>([]);
  const [enabledMcps, setEnabledMcps] = useState<Set<string>>(new Set());
  const [disabledTools, setDisabledTools] = useState<Set<string>>(loadDisabledTools);
  const [mcpErrors, setMcpErrors] = useState<McpErrorMap>(loadMcpErrors);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const attach = useAttachFile();

  useEffect(() => {
    fetchMe()
      .then(setUser)
      .catch(() => { window.location.href = "/login.html"; });

    fetchMcps()
      .then((catalog) => {
        setMcpCatalog(catalog);
        setEnabledMcps(loadEnabledMcps(catalog));
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    const stored = loadChats();
    if (stored.length === 0) {
      createNewChat();
    } else {
      setChats(stored);
      loadChatById(stored[stored.length - 1].id, stored);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function createNewChat(existingChats?: Chat[]) {
    const id = uid();
    const newChat: Chat = { id, title: "새 대화", history: [] };
    setChats((prev) => {
      const next = existingChats ? [...existingChats, newChat] : [...prev, newChat];
      saveChats(next);
      return next;
    });
    setCurrentId(id);
    setDisplayMessages([]);
    setTitle("새 대화");
    setTags([]);
    return id;
  }

  function loadChatById(id: string, chatList?: Chat[]) {
    const list = chatList ?? chats;
    const chat = list.find((c) => c.id === id);
    if (!chat) return;
    setCurrentId(id);
    setTitle(chat.title || "새 대화");
    setTags(detectTags(chat.history));
    const msgs: DisplayMessage[] = chat.history.map((m) => ({
      role: m.role === "user" ? "user" as const : "assistant" as const,
      content: Array.isArray(m.content)
        ? m.content
        : [{ type: "text" as const, text: String(m.content) }],
      failedTools: [],
      ts: m.ts,
    }));
    setDisplayMessages(msgs);
  }

  function deleteChat(id: string) {
    const target = chats.find((c) => c.id === id);
    if (!confirm(`'${target?.title ?? "(제목 없음)"}' 대화를 삭제할까요?`)) return;
    const next = chats.filter((c) => c.id !== id);
    setChats(next);
    saveChats(next);
    if (currentId === id) {
      if (next.length > 0) loadChatById(next[next.length - 1].id, next);
      else createNewChat(next);
    }
  }

  function clearAllChats() {
    if (!confirm(`최근 대화 ${chats.length}개를 모두 삭제할까요?`)) return;
    setChats([]);
    saveChats([]);
    setCurrentId(null);
    setDisplayMessages([]);
    setTitle("새 대화");
    setTags([]);
    createNewChat([]);
  }

  function appendLog(entry: LogEntry) {
    setLogEntries((prev) => [...prev, { ...entry, ts: entry.ts ?? Date.now() }]);
  }

  async function handleSubmit() {
    const text = inputValue.trim();
    if (!text && attach.pending.length === 0) return;
    if (loading) return;

    let chatId = currentId ?? createNewChat();
    let currentChats = chats;

    const userContent: ContentBlock[] = [];
    for (const att of attach.pending) {
      if (att.isText) {
        userContent.push({ type: "text", text: `[첨부 파일: ${att.name}]\n\`\`\`markdown\n${att.textContent ?? ""}\n\`\`\`` });
      } else {
        userContent.push({ type: "image", source: { type: "base64", media_type: att.mediaType ?? "", data: att.base64 ?? "" } });
      }
    }
    if (text) userContent.push({ type: "text", text });

    const userTs = Date.now();
    const userMsg: Message = { role: "user", content: userContent, ts: userTs };
    const userDisplay = buildUserMessage(text, attach.pending);
    userDisplay.ts = userTs;

    setChats((prev) => {
      const next = prev.map((c) => {
        if (c.id !== chatId) return c;
        return {
          ...c,
          title: c.title === "새 대화" && text ? text.slice(0, 30) : c.title,
          history: [...c.history, userMsg],
        };
      });
      currentChats = next;
      saveChats(next);
      return next;
    });

    if (title === "새 대화" && text) setTitle(text.slice(0, 30));
    setDisplayMessages((prev) => [...prev, userDisplay]);
    setInputValue("");
    attach.clear();
    setLoading(true);

    const reqId = `${Date.now()}-${uid()}`;
    const ac = new AbortController();
    setCurrentRequestId(reqId);
    setAbortController(ac);

    appendLog({ level: "info", text: "[client] → /chat", ts: Date.now() });

    try {
      const finalEvt = await sendChat(
        currentChats.find((c) => c.id === chatId)?.history ?? [],
        { enabledMcps: [...enabledMcps], disabledTools: [...disabledTools], requestId: reqId },
        { onLog: appendLog, signal: ac.signal }
      );

      if (finalEvt.error) {
        setDisplayMessages((prev) => [
          ...prev,
          buildAssistantMessage([{ type: "text", text: `에러: ${finalEvt.error}` }], []),
        ]);
      } else {
        const failed = finalEvt.failedTools ?? [];
        const asstTs = Date.now();
        const asstDisplay = buildAssistantMessage(finalEvt.content ?? [], failed);
        asstDisplay.ts = asstTs;

        if (failed.length) {
          setMcpErrors((prev) => {
            const next = recordFailedTools(prev, failed);
            saveMcpErrors(next);
            return next;
          });
        }

        setDisplayMessages((prev) => [...prev, asstDisplay]);

        const asstMsg: Message = { role: "assistant", content: finalEvt.content ?? [], ts: asstTs };
        setChats((prev) => {
          const next = prev.map((c) => {
            if (c.id !== chatId) return c;
            const updated = { ...c, history: [...c.history, asstMsg] };
            return updated;
          });
          saveChats(next);
          const chat = next.find((c) => c.id === chatId);
          if (chat) setTags(detectTags(chat.history));
          return next;
        });
      }
    } catch (e) {
      const err = e as Error;
      const errText = err.name === "AbortError"
        ? "🛑 사용자가 요청을 취소했습니다."
        : `에러: ${err.message}`;
      setDisplayMessages((prev) => [
        ...prev,
        buildAssistantMessage([{ type: "text", text: errText }], []),
      ]);
    } finally {
      setLoading(false);
      setCurrentRequestId(null);
      setAbortController(null);
    }
  }

  async function handleStop() {
    abortController?.abort();
    if (currentRequestId) {
      try { await cancelRequest(currentRequestId); } catch {}
    }
  }

  async function handleLogout() {
    await logout();
    window.location.href = "/login.html";
  }

  function handleToggleMcp(name: string, enabled: boolean) {
    setEnabledMcps((prev) => {
      const next = new Set(prev);
      if (enabled) next.add(name); else next.delete(name);
      persistEnabledMcps(next);
      return next;
    });
  }

  function handleToggleTool(key: string, enabled: boolean) {
    setDisabledTools((prev) => {
      const next = new Set(prev);
      if (enabled) next.delete(key); else next.add(key);
      persistDisabledTools(next);
      return next;
    });
  }

  const currentChat = chats.find((c) => c.id === currentId);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        chats={chats}
        currentId={currentId}
        user={user}
        mcpErrors={mcpErrors}
        onNewChat={() => createNewChat()}
        onSelectChat={(id) => loadChatById(id)}
        onDeleteChat={deleteChat}
        onClearAllChats={clearAllChats}
        onOpenSettings={() => {
          if (!mcpCatalog.length) fetchMcps().then(setMcpCatalog).catch(console.error);
          setSettingsOpen(true);
        }}
        onOpenStatus={() => setStatusOpen(true)}
        onLogout={handleLogout}
        onClearErrors={() => { setMcpErrors({}); saveMcpErrors({}); }}
      />

      <main className="flex-1 flex flex-col overflow-hidden bg-bg-base">
        <Header title={currentChat?.title ?? title} tags={tags} />
        <ChatWindow messages={displayMessages} loading={loading} />
        <MessageInput
          value={inputValue}
          onChange={setInputValue}
          onSubmit={handleSubmit}
          onStop={handleStop}
          loading={loading}
          attachments={attach.pending}
          onAttach={attach.open}
          onRemoveAttachment={attach.remove}
          fileInputRef={attach.inputRef}
          onFileChange={attach.handleFiles}
        />
      </main>

      <LogPanel entries={logEntries} onClear={() => setLogEntries([])} />

      <McpSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        catalog={mcpCatalog}
        enabledMcps={enabledMcps}
        disabledTools={disabledTools}
        onToggleMcp={handleToggleMcp}
        onToggleTool={handleToggleTool}
        onSave={() => { persistEnabledMcps(enabledMcps); setSettingsOpen(false); }}
      />

      <SystemStatusDialog open={statusOpen} onOpenChange={setStatusOpen} />
    </div>
  );
}
