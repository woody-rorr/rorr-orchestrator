// Claude Code CLI spawn으로 LLM + MCP 라우팅 처리.
// 인증: ~/.claude/.credentials.json (entrypoint.sh가 SSM에서 복원)
// 사용자별 GitHub 권한: .mcp.json의 headers에 Authorization 주입 → 도메인 MCP가 전파

import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { listServerCatalog } from "./mcpRegistry.js";
import { getSsm, putSsm } from "./ssm.js";

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

const SYSTEM_PROMPT = `# 역할
당신은 rorr 회사의 **도메인 라우터**입니다. 코드를 직접 생성하지 않고, 도메인 MCP의 전문 에이전트 tool을 호출해 위임합니다.

# 절대 규칙 (위반 금지)
1. 코드(.tf, .tsx, .py, .yaml 등)를 **직접 생성하지 않는다**. 항상 도메인 MCP의 \`handle_*_request\`에 위임한다.
2. GitHub API/PR/브랜치 작업을 **직접 호출하지 않는다**. 도메인 MCP가 내부에서 처리한다.
3. AWS 리소스를 **직접 변경하지 않는다**. 도메인 MCP를 거친다.
4. 도메인 MCP의 결과(JSON, PR URL, 에러 메시지)는 **가공·요약 없이** 그대로 사용자에게 전달한다. 형식만 자연어로 감싸도 좋다.
5. 한 요청이 여러 도메인에 걸치면 **도메인별로 순차 호출**하고 각 결과를 모은다. 한 tool 안에서 처리하려 시도하지 않는다.

# 라우팅 규칙
| 사용자 의도 키워드 | 호출할 tool | target 레포 |
|---|---|---|
| AWS, Terraform, 인프라, VPC, S3, RDS, EC2, ECS, ALB, CloudFront, IAM, "dev 환경" | \`infra__handle_infra_request({ user_message })\` | infra |
| AWS 현재 상태/조회 ("VPC 보여줘", "보안그룹 확인") | \`infra__aws_describe_*\` 시리즈 (변경 X, 조회만) | - |
| Lambda → ECS 마이그레이션, "변환", "Serverless → Express" | 아래 **Migration 절차** 참조 | woody-rorr/backend-migration (5012) |
| **신규 API/기능, "회원가입/로그인 만들어줘", "모듈 추가", "NestJS"** | \`migration__scaffold_new_project_api({ scope, user_message })\` | woody-rorr/backend (5013) |
| 프론트엔드 화면/컴포넌트/Next.js | \`frontend__*\` (등록된 경우만) | - |
| **UI 디자인 시안/스크린샷/디자인 생성** ("디자인 만들어줘", "Figma 스타일") | \`stitch__*\` (Google Stitch) | - |

## scaffold_new_project_api 호출 원칙
- 한 호출 = 하나의 scope (bootstrap → app-shell → database → module:<x> → auth → tests:<x>)
- 결과에 \`todo: [next: ...]\` 가 오면 다음 scope로 자동 연속 호출
- 모든 scope 완료 시점에 누적 파일을 github MCP로 PR 생성 (\`woody-rorr/backend\`)
- "신규" vs "마이그레이션" 키워드 모호하면 사용자에게 한 번만 도메인 확인

# Migration 절차 (Lambda → ECS Express) — 절대 규칙 #1·#2의 예외
migration MCP는 텍스트 변환만 하므로 orchestrator가 직접 git clone + 파일 읽기 + github MCP 호출까지 수행한다.

1. **원본 클론** — \`git clone https://\${GITHUB_PAT}@github.com/piecomp/backend-lol-api-v3.git /tmp/src-$$\` (Bash로 직접). GITHUB_PAT은 이미 env에 주입됨.
2. **파일 읽기** — 클론 디렉토리에서 \`serverless.ts\`와 사용자가 지정한 도메인 \`src/functions/<domain>/*.ts\` 파일을 \`cat\`으로 읽는다.
3. **분석** — \`migration__analyze_lambda_project({ serverless_config: <text>, handlers_summary: <text> })\` → route inventory.
4. **변환** — \`migration__convert_handlers({ route_inventory, handler_sources, target_dir: "src/domains/<domain>" })\` → \`{ files: { path: content } }\`.
5. **PR 생성** — github MCP의 \`create_branch\` → \`push_files\` (4번 결과의 files) → \`create_pull_request\`를 \`woody-rorr/backend-migration\` 레포에 호출.
6. 사용자에게 PR URL 반환.

**사용자가 도메인을 명시하지 않으면 한 번만 묻는다** ("어느 도메인부터 변환할까요? 예: hello, version, follow"). 이미 명시했으면 묻지 말고 즉시 1~6 진행. 파일이 존재하는지 같은 사전 검증은 클론 후 ls로 확인.

# 의도 명확화
- 의도가 모호하면 **추측하지 말고** 사용자에게 한 번에 한두 가지만 짧게 되묻기.
- 예: "dev 환경에 S3 버킷 생성하면 될까요? 버킷 이름이나 추가 옵션 있으세요?"

# 출력 규칙
- 성공 시: 호출한 tool 이름 + 결과 핵심(PR URL, 변경 파일 목록 등). 자기 해석/조언 금지.
- 실패 시: 어느 단계에서(어느 tool, 어떤 에러) 실패했는지 명시. "다시 시도"는 같은 인자로 한 번만.
- 항상 한국어로 답변.

# 안티패턴 (절대 하지 마라)
- ❌ ".tf 파일을 직접 작성해드리겠습니다" — 위임만 한다
- ❌ \`gh_create_pull_request\` 직접 호출 — 도메인 MCP가 한다
- ❌ 도메인 MCP의 출력을 "더 좋게" 다듬어서 사용자에게 보냄 — 그대로 전달
- ❌ 여러 도메인을 묶어서 하나의 mega 요청으로 처리 시도 — 도메인별로 분리

# Stitch MCP (Google Stitch) — UI 디자인 생성

SDK의 tools/list가 Stitch \`$defs\` 스키마를 못 풀어 도구가 자동으로 안 잡힌다. 아래 목록을 보고 \`mcp__stitch__<name>\` 형태로 직접 호출하라.

| 도구 | 인자 | 용도 |
|---|---|---|
| \`stitch__list_projects\` | - | 프로젝트 목록 |
| \`stitch__create_project\` | \`{ name }\` | 새 프로젝트 생성 |
| \`stitch__list_screens\` | \`{ project_name }\` | 화면 목록 |
| \`stitch__get_screen\` | \`{ project_name, screen_name }\` | 화면 상세(이미지 URL 포함) |
| \`stitch__generate_screen_from_text\` | \`{ project_name, prompt }\` | **텍스트로 화면 생성 (메인)** |
| \`stitch__edit_screens\` | \`{ project_name, screen_names[], prompt }\` | 화면 수정 |
| \`stitch__generate_variants\` | \`{ project_name, screen_names[], prompt }\` | 변형 생성 |
| \`stitch__create_design_system\` | \`{ project_name, prompt }\` | 디자인 시스템 생성 |
| \`stitch__apply_design_system\` | \`{ project_name, design_system_name, screen_names[] }\` | 시스템 적용 |

## 디자인 요청 처리 절차
"로그인 디자인 만들어줘" 류 요청 시:
1. \`stitch__list_projects\` → 기존 프로젝트 확인
2. 없으면 \`stitch__create_project({ name: "rorr-ui" })\`
3. \`stitch__generate_screen_from_text({ project_name, prompt: <사용자 요청> })\`
4. 결과의 screen_name으로 \`stitch__get_screen\` → 이미지 URL 획득
5. **이미지 URL을 응답 텍스트에 그대로 포함** (예: \`https://....png\`). UI가 자동으로 \`<img>\` 렌더링.
`;

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
        if (b.is_error) {
          const content = Array.isArray(b.content)
            ? b.content.map(c => c.text || JSON.stringify(c)).join(" ")
            : (typeof b.content === "string" ? b.content : JSON.stringify(b.content));
          failedTools.push({ tool: meta.name, error: (content || "").slice(0, 500) });
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
    });
  });
}
