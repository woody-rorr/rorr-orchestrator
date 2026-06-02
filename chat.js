// Claude Code CLI spawn으로 LLM + MCP 라우팅 처리.
// 인증: ~/.claude/.credentials.json (entrypoint.sh가 SSM에서 복원)
// 사용자별 GitHub 권한: .mcp.json의 headers에 Authorization 주입 → 도메인 MCP가 전파

import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { listServerCatalog } from "./mcpRegistry.js";
import { getSsm, putSsm } from "./ssm.js";
import { notifyTeams, teamsEnabled } from "./notifyTeams.js";

// GitHub PR URL 추출 (도메인 MCP 결과/최종 텍스트에서 PR 생성 성공 감지용)
const PR_URL_RE = /https?:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/g;
function extractPrUrls(s) {
  if (!s) return [];
  return String(s).match(PR_URL_RE) || [];
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = path.join(__dirname, "prompts");

function loadSystemPrompt() {
  return fs.readdirSync(PROMPTS_DIR)
    .filter(f => f.endsWith(".md"))
    .sort()
    .map(f => fs.readFileSync(path.join(PROMPTS_DIR, f), "utf8").trim())
    .join("\n\n");
}

const TIMEOUT_MS = parseInt(process.env.CLAUDE_TIMEOUT_MS || "1000000", 10);
const MODEL = process.env.LLM_MODEL || "";
const SSM_CLAUDE_PATH = process.env.SSM_CLAUDE_PATH || "/rorr-mcp-infra/claude-credentials";
const CLAUDE_CREDS_FILE = path.join(os.homedir(), ".claude", ".credentials.json");

let _syncing = false;
async function syncClaudeCredentialsIfRefreshed() {
  if (_syncing) return;
  _syncing = true;
  try {
    if (!fs.existsSync(CLAUDE_CREDS_FILE)) return;
    const localText = fs.readFileSync(CLAUDE_CREDS_FILE, "utf8");
    const localExp = JSON.parse(localText)?.claudeAiOauth?.expiresAt;
    if (!localExp) return;

    const remote = await getSsm(SSM_CLAUDE_PATH, { cached: false });
    const remoteExp = remote ? (JSON.parse(remote)?.claudeAiOauth?.expiresAt ?? 0) : 0;

    if (localExp > remoteExp) {
      await putSsm(SSM_CLAUDE_PATH, localText);
      console.log(`[claude-sync] SSM updated (expiresAt ${remoteExp} → ${localExp})`);
    }
  } catch (e) {
    console.warn("[claude-sync] failed:", e.message);
  } finally {
    _syncing = false;
  }
}

// console.log(`[llm] provider=claude-code model=${MODEL || "(default)"}`);

const SYSTEM_PROMPT = loadSystemPrompt();

function buildMcpConfig({ userToken } = {}) {
  const servers = {};
  for (const c of listServerCatalog()) {
    if (!c.url) continue;
    const entry = { type: "http", url: c.url };
    const headers = {};
    if (userToken && !c.skipUserAuth) headers.Authorization = `Bearer ${userToken}`;
    if (c.staticHeaders) Object.assign(headers, c.staticHeaders);
    if (Object.keys(headers).length) entry.headers = headers;
    servers[c.name] = entry;
  }
  return { mcpServers: servers };
}

function mcpServerOf(toolName) {
  // tool 이름은 보통 `<server>__<tool>` 형태 (예: infra__handle_infra_request, migration__convert_handlers)
  const m = String(toolName || "").match(/^([^_]+)__/);
  return m ? m[1] : "(직접 도구)";
}

function serializeMessages(messages) {
  const parts = [];
  for (const m of messages) {
    if (typeof m.content === "string") {
      parts.push(`[${m.role}] ${m.content}`);
      continue;
    }
    for (const block of m.content ?? []) {
      if (block.type === "text") parts.push(`[${m.role}] ${block.text}`);
      else if (block.type === "image") parts.push(`[${m.role}] (image attached)`);
    }
  }
  return parts.join("\n\n");
}

export async function runChat({ messages, userToken, disabledTools = [], onLog }) {
  const log = (level, msg) => {
    if (level === "warn") console.warn(msg);
    else if (level === "error") console.error(msg);
    else console.log(msg);
    try { onLog?.({ level, text: String(msg), ts: Date.now() }); } catch {}
  };
  const prompt = serializeMessages(messages);
  // 알림 컨텍스트용: 마지막 사용자 텍스트
  let lastUserMsg = "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    if (typeof m.content === "string") { lastUserMsg = m.content; break; }
    const t = (m.content || []).filter((b) => b.type === "text").map((b) => b.text).join(" ").trim();
    if (t) { lastUserMsg = t; break; }
  }
  const mcpConfig = buildMcpConfig({ userToken });
  const disabledList = Array.isArray(disabledTools) ? disabledTools.filter(Boolean) : [];
  const dynamicSystem = disabledList.length
    ? SYSTEM_PROMPT + `\n\n# 비활성 도구 (사용 금지)\n다음 도구는 이번 요청에서 절대 호출하지 마세요:\n${disabledList.map(t => `- ${t}`).join("\n")}`
    : SYSTEM_PROMPT;

  const tmpFile = path.join(os.tmpdir(), `mcp-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify(mcpConfig), { mode: 0o600 });

  const args = [
    "-p", prompt,
    "--output-format", "stream-json",
    "--verbose",
    "--append-system-prompt", dynamicSystem,
    "--mcp-config", tmpFile,
    "--dangerously-skip-permissions",
  ];
  if (MODEL) args.push("--model", MODEL);

  return new Promise((resolve) => {
    let stderr = "";
    let buf = "";
    const toolUseById = new Map();
    const failedTools = [];
    const prUrls = new Set(); // 도메인 MCP가 생성한 PR URL (성공 감지)
    let toolIdx = 0;
    let resultEvent = null;
    let lastAssistantText = "";
    const child = spawn("claude", args, { stdio: ["ignore", "pipe", "pipe"] });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      log("error", `[chat] claude CLI timeout (${TIMEOUT_MS}ms)`);
      finalize({ final: [{ type: "text", text: `❌ Claude CLI 타임아웃 (${TIMEOUT_MS}ms)\n→ CLAUDE_TIMEOUT_MS 환경변수로 조정 가능.` }], failedTools: [] });
    }, TIMEOUT_MS);

    let resolved = false;
    function finalize(out) {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      try { fs.unlinkSync(tmpFile); } catch {}
      syncClaudeCredentialsIfRefreshed().catch(() => {});
      resolve(out);
    }

    function handleBlock(b) {
      if (b?.type === "tool_use" && b.id) {
        toolIdx++;
        const server = mcpServerOf(b.name);
        let inputStr = "";
        try {
          inputStr = JSON.stringify(b.input || {});
          if (inputStr.length > 300) inputStr = inputStr.slice(0, 300) + "…";
        } catch { inputStr = "(unserializable)"; }
        toolUseById.set(b.id, { name: b.name, idx: toolIdx });
        log("info", `[route] #${toolIdx} → mcp=${server} tool=${b.name} input=${inputStr}`);
      }
      if (b?.type === "tool_result" && b.tool_use_id) {
        const meta = toolUseById.get(b.tool_use_id) || { name: "(unknown)", idx: "?" };
        const status = b.is_error ? "ERROR" : "ok";
        log(b.is_error ? "error" : "info", `[route] #${meta.idx} ← mcp=${mcpServerOf(meta.name)} tool=${meta.name} status=${status}`);
        const content = Array.isArray(b.content)
          ? b.content.map(c => c.text || JSON.stringify(c)).join(" ")
          : (typeof b.content === "string" ? b.content : JSON.stringify(b.content));
        if (b.is_error) {
          failedTools.push({ tool: meta.name, error: (content || "").slice(0, 500) });
        } else {
          for (const u of extractPrUrls(content)) prUrls.add(u);
        }
      }
    }

    function handleEvent(evt) {
      if (!evt || typeof evt !== "object") return;
      // assistant 메시지: tool_use 블록 + 텍스트 블록 포함 가능
      if (evt.type === "assistant" && evt.message?.content) {
        const texts = [];
        for (const b of evt.message.content) {
          handleBlock(b);
          if (b?.type === "text" && b.text) texts.push(b.text);
        }
        if (texts.length) lastAssistantText = texts.join("\n");
      }
      // user 메시지: tool_result 블록 포함 (Claude CLI가 도구 결과를 user 역할로 표현)
      if (evt.type === "user" && evt.message?.content) {
        for (const b of evt.message.content) handleBlock(b);
      }
      if (evt.type === "result") {
        resultEvent = evt;
      }
    }

    child.stdout.on("data", (d) => {
      buf += d.toString();
      let nl;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try { handleEvent(JSON.parse(line)); }
        catch (e) { log("warn", `[chat] stream parse fail: ${e.message} line=${line.slice(0, 200)}`); }
      }
    });
    child.stderr.on("data", (d) => { stderr += d.toString(); });

    child.on("error", (e) => {
      log("error", `[chat] claude spawn error: ${e.message}`);
      finalize({ final: [{ type: "text", text: `claude spawn error: ${e.message}` }], failedTools: [] });
    });

    child.on("close", (code) => {
      if (toolIdx === 0) log("info", "[route] (no MCP tool calls — Claude answered directly)");

      let text;
      if (resultEvent) {
        const isError = resultEvent.is_error === true || (resultEvent.api_error_status && resultEvent.api_error_status >= 400);
        if (isError) {
          const status = resultEvent.api_error_status;
          const reason = resultEvent.result || resultEvent.error || resultEvent.stop_reason || "unknown";
          let hint = "";
          if (status === 401) hint = "\n→ Claude OAuth 토큰이 만료/무효. 로컬에서 `claude` 한번 실행 후 `rorr-orchestrator/scripts/refresh-claude-token.sh` 실행.";
          else if (status === 429) hint = "\n→ Rate limit. 잠시 후 재시도.";
          else if (status >= 500) hint = "\n→ Claude API 서버 오류. 잠시 후 재시도.";
          text = `❌ Claude 호출 실패 (HTTP ${status ?? "?"})\n   ${reason}${hint}`;
        } else {
          text = resultEvent.result || lastAssistantText || "(empty)";
        }
      } else if (code !== 0) {
        const detail = (stderr || "").trim() || "(no output)";
        text = `❌ Claude CLI 비정상 종료 (exit=${code})\n${detail.slice(0, 2000)}`;
      } else {
        text = lastAssistantText || "(empty)";
      }

      finalize({ final: [{ type: "text", text }], failedTools });

      // PR 생성 성공 시 Teams 알림 (fire-and-forget)
      for (const u of extractPrUrls(text)) prUrls.add(u);
      if (prUrls.size && teamsEnabled()) {
        const urls = [...prUrls];
        log("info", `[teams] PR ${urls.length}건 알림 전송`);
        notifyTeams({
          title: `✅ PR 생성 완료 (${urls.length}건)`,
          text: lastUserMsg ? `요청: ${lastUserMsg.slice(0, 300)}` : undefined,
          facts: urls.map((u, i) => ({ name: `PR ${i + 1}`, value: u })),
          url: urls[0],
          linkTitle: "PR 열기",
        });
      }
    });
  });
}
