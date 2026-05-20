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

console.log(`[llm] provider=claude-code model=${MODEL || "(default)"}`);

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
| 백엔드/프론트엔드 코드 변경 | 해당 도메인 MCP (등록된 경우만) |

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
      finalize({ final: [{ type: "text", text: `claude CLI timeout (${TIMEOUT_MS}ms)` }] });
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

    child.on("error", (e) => finalize({ final: [{ type: "text", text: `claude spawn error: ${e.message}` }] }));

    child.on("close", (code) => {
      if (code !== 0) {
        return finalize({ final: [{ type: "text", text: `claude exited ${code}: ${stderr || stdout}` }] });
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        const text = parsed.result ?? stdout;
        finalize({ final: [{ type: "text", text }] });
      } catch {
        finalize({ final: [{ type: "text", text: stdout || "(empty)" }] });
      }
    });
  });
}
