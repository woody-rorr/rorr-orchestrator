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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = path.join(__dirname, "prompts");

function loadSystemPrompt() {
  return fs.readdirSync(PROMPTS_DIR)
    .filter(f => f.endsWith(".md"))
    .sort()
    .map(f => fs.readFileSync(path.join(PROMPTS_DIR, f), "utf8").trim())
    .join("\n\n");
}

const TIMEOUT_MS = parseInt(process.env.CLAUDE_TIMEOUT_MS || "300000", 10);
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

function extractFailedTools(parsed) {
  // Claude CLI JSON 출력의 iterations/messages를 훑어 tool_result.is_error=true 인 항목 수집
  const failed = [];
  const iters = parsed?.iterations || parsed?.messages || [];
  const toolUseById = new Map();

  function walkBlocks(blocks) {
    if (!Array.isArray(blocks)) return;
    for (const b of blocks) {
      if (b?.type === "tool_use" && b.id) {
        toolUseById.set(b.id, { name: b.name, input: b.input });
      }
      if (b?.type === "tool_result" && b.is_error) {
        const meta = toolUseById.get(b.tool_use_id) || { name: "(unknown)" };
        const content = Array.isArray(b.content)
          ? b.content.map(c => c.text || JSON.stringify(c)).join(" ")
          : (typeof b.content === "string" ? b.content : JSON.stringify(b.content));
        failed.push({ tool: meta.name, error: (content || "").slice(0, 500) });
      }
    }
  }

  for (const it of iters) {
    walkBlocks(it?.content);
    walkBlocks(it?.message?.content);
  }
  return failed;
}

function mcpServerOf(toolName) {
  // tool 이름은 보통 `<server>__<tool>` 형태 (예: infra__handle_infra_request, migration__convert_handlers)
  const m = String(toolName || "").match(/^([^_]+)__/);
  return m ? m[1] : "(직접 도구)";
}

function formatClaudeOutput({ code, stdout, stderr }) {
  // 우선 stdout이 JSON이면 파싱
  let parsed = null;
  try { parsed = JSON.parse(stdout.trim()); } catch {}

  if (parsed && typeof parsed === "object") {
    const failedTools = extractFailedTools(parsed);

    const isError = parsed.is_error === true || (parsed.api_error_status && parsed.api_error_status >= 400);
    if (isError) {
      const status = parsed.api_error_status;
      const reason = parsed.result || parsed.error || parsed.stop_reason || "unknown";
      const sessionId = parsed.session_id ? ` (session=${parsed.session_id.slice(0, 8)})` : "";

      let hint = "";
      if (status === 401) {
        hint = "\n→ Claude OAuth 토큰이 만료/무효. 로컬에서 `claude` 한번 실행 후 `rorr-orchestrator/scripts/refresh-claude-token.sh` 실행.";
      } else if (status === 429) {
        hint = "\n→ Rate limit. 잠시 후 재시도.";
      } else if (status >= 500) {
        hint = "\n→ Claude API 서버 오류. 잠시 후 재시도.";
      }

      return {
        level: "error",
        status,
        detail: reason,
        failedTools,
        text: `❌ Claude 호출 실패 (HTTP ${status ?? "?"})${sessionId}\n   ${reason}${hint}`,
      };
    }
    // 정상 종료지만 일부 MCP tool이 실패했을 수 있음
    const body = parsed.result ?? stdout;
    return { level: failedTools.length ? "warn" : "ok", failedTools, text: body };
  }

  if (code !== 0) {
    const detail = (stderr || stdout || "").trim() || "(no output)";
    return {
      level: "error",
      detail,
      failedTools: [],
      text: `❌ Claude CLI 비정상 종료 (exit=${code})\n${detail.slice(0, 2000)}`,
    };
  }

  return { level: "ok", failedTools: [], text: stdout || "(empty)" };
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

export async function runChat({ messages, userToken, disabledTools = [] }) {
  const prompt = serializeMessages(messages);
  const mcpConfig = buildMcpConfig({ userToken });
  const disabledList = Array.isArray(disabledTools) ? disabledTools.filter(Boolean) : [];
  const dynamicSystem = disabledList.length
    ? SYSTEM_PROMPT + `\n\n# 비활성 도구 (사용 금지)\n다음 도구는 이번 요청에서 절대 호출하지 마세요:\n${disabledList.map(t => `- ${t}`).join("\n")}`
    : SYSTEM_PROMPT;

  const tmpFile = path.join(os.tmpdir(), `mcp-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify(mcpConfig), { mode: 0o600 });

  const args = [
    "-p", prompt,
    "--output-format", "json",
    "--append-system-prompt", dynamicSystem,
    "--mcp-config", tmpFile,
    "--dangerously-skip-permissions",
  ];
  if (MODEL) args.push("--model", MODEL);

  return new Promise((resolve) => {
    let stdout = "", stderr = "";
    const child = spawn("claude", args, { stdio: ["ignore", "pipe", "pipe"] });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      console.error(`[chat] claude CLI timeout (${TIMEOUT_MS}ms)`);
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

    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });

    child.on("error", (e) => {
      console.error("[chat] claude spawn error:", e.message);
      finalize({ final: [{ type: "text", text: `claude spawn error: ${e.message}` }], failedTools: [] });
    });

    child.on("close", (code) => {
      const formatted = formatClaudeOutput({ code, stdout, stderr });
      finalize({ final: [{ type: "text", text: formatted.text }], failedTools: formatted.failedTools || [] });
    });
  });
}
