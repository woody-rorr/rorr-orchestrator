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
| 사용자 의도 키워드 | 호출할 tool |
|---|---|
| AWS, Terraform, 인프라, VPC, S3, RDS, EC2, ECS, ALB, CloudFront, IAM, "dev 환경" | \`infra__handle_infra_request({ user_message })\` |
| AWS 현재 상태/조회 (예: "VPC 보여줘", "보안그룹 확인") | \`infra__aws_describe_*\` 시리즈 (변경 X, 조회만) |
| Lambda → ECS 마이그레이션, "변환", "Serverless → Express" | 아래 **Migration 절차** 참조 |
| 백엔드/프론트엔드 코드 변경 | 해당 도메인 MCP (등록된 경우만) |

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
`;

function buildMcpConfig({ userToken } = {}) {
  const servers = {};
  for (const c of listServerCatalog()) {
    if (!c.url) continue;
    const entry = { type: "http", url: c.url };
    if (userToken) {
      entry.headers = { Authorization: `Bearer ${userToken}` };
    }
    servers[c.name] = entry;
  }
  return { mcpServers: servers };
}

function formatClaudeOutput({ code, stdout, stderr }) {
  // 우선 stdout이 JSON이면 파싱
  let parsed = null;
  try { parsed = JSON.parse(stdout.trim()); } catch {}

  if (parsed && typeof parsed === "object") {
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
        text: `❌ Claude 호출 실패 (HTTP ${status ?? "?"})${sessionId}\n   ${reason}${hint}`,
      };
    }
    // 정상 결과
    return { level: "ok", text: parsed.result ?? stdout };
  }

  if (code !== 0) {
    const detail = (stderr || stdout || "").trim() || "(no output)";
    return {
      level: "error",
      detail,
      text: `❌ Claude CLI 비정상 종료 (exit=${code})\n${detail.slice(0, 2000)}`,
    };
  }

  return { level: "ok", text: stdout || "(empty)" };
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

export async function runChat({ messages, userToken }) {
  const prompt = serializeMessages(messages);
  const mcpConfig = buildMcpConfig({ userToken });

  const tmpFile = path.join(os.tmpdir(), `mcp-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify(mcpConfig), { mode: 0o600 });

  const args = [
    "-p", prompt,
    "--output-format", "json",
    "--append-system-prompt", SYSTEM_PROMPT,
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
      finalize({ final: [{ type: "text", text: `❌ Claude CLI 타임아웃 (${TIMEOUT_MS}ms)\n→ CLAUDE_TIMEOUT_MS 환경변수로 조정 가능.` }] });
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
      finalize({ final: [{ type: "text", text: `claude spawn error: ${e.message}` }] });
    });

    child.on("close", (code) => {
      const formatted = formatClaudeOutput({ code, stdout, stderr });
      if (formatted.level === "error") {
        console.error(`[chat] claude failed (exit=${code}, status=${formatted.status ?? "n/a"}): ${formatted.detail}`);
      }
      finalize({ final: [{ type: "text", text: formatted.text }] });
    });
  });
}
