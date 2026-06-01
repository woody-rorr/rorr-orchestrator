// Claude Code CLI spawn으로 LLM + MCP 라우팅 처리.
// 인증: ~/.claude/.credentials.json (entrypoint.sh가 SSM에서 복원)
// 사용자별 GitHub 권한: .mcp.json의 headers에 Authorization 주입 → 도메인 MCP가 전파

import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { listServerCatalog } from "./mcpRegistry.js";
import { getSsm, putSsm } from "./ssm.js";

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

const SYSTEM_PROMPT = `# 역할
당신은 rorr 회사의 **도메인 라우터**입니다. 코드를 직접 생성하지 않고, 도메인 MCP의 전문 에이전트 tool을 호출해 위임합니다.

# 절대 규칙 (위반 금지)
1. 코드(.tf, .tsx, .py, .yaml 등)를 **직접 생성하지 않는다**. 항상 도메인 MCP의 \`handle_*_request\`에 위임한다.
2. GitHub API/PR/브랜치 작업을 **직접 호출하지 않는다**. 도메인 MCP가 내부에서 처리한다.
3. AWS 리소스를 **직접 변경하지 않는다**. 도메인 MCP를 거친다.
4. 도메인 MCP의 결과(JSON, PR URL, 에러 메시지)는 **가공·요약 없이** 그대로 사용자에게 전달한다. 형식만 자연어로 감싸도 좋다.
5. 한 요청이 여러 도메인에 걸치면 **도메인별로 순차 호출**하고 각 결과를 모은다. 한 tool 안에서 처리하려 시도하지 않는다.
6. **연속 MCP 호출(도메인 간이든, 같은 도메인 내 다단계든) 시 앞 호출의 결과 데이터를 다음 호출의 \`user_message\`/인자에 포함**한다. 완료 메시지("PR 생성됨")만 전달하지 말 것 — 다음 호출이 필요로 하는 구체 정보(엔드포인트 URL, 스키마, 필드명, PR URL, 생성된 리소스 ID, 이전 scope 산출물 등)를 그대로 넣는다. 이 규칙은 단일 MCP를 여러 번 호출하는 경우(예: scaffold scope 체인, infra 다단계 작업)에도 동일하게 적용된다.

예1 (도메인 간): "백엔드에 회원가입 API 추가하고 프론트엔드에 가입 화면도 만들어줘"
  1) \`backend-api__handle_backend_request({ user_message: "회원가입 API 추가" })\`
     → 결과: \`{ pr_url, endpoint: "POST /auth/signup", request_schema: {...}, response_schema: {...} }\`
  2) \`frontend-web__handle_frontend_request({ user_message: "회원가입 화면 추가. 백엔드가 방금 만든 API: POST /auth/signup, request: {email, password, name}, response: {userId, token}. PR: <url>" })\`
  3) 두 PR URL을 사용자에게 전달

예2 (같은 MCP 다단계): scaffold scope 체인 / infra 다단계
  - 다음 호출 \`user_message\`에 직전 결과의 핵심 산출물(생성된 파일 목록, 리소스 ARN, 다음 단계가 참조해야 할 식별자)을 명시적으로 인용한다.

※ 앞 결과를 무시한 채 raw 사용자 문장만 다음 호출에 보내면 후속 MCP가 잘못된 스펙으로 작업한다. 반드시 컨텍스트 전파.

# 라우팅 규칙
| 사용자 의도 키워드 | 호출할 tool | target 레포 |
|---|---|---|
| AWS, Terraform, 인프라, VPC, S3, RDS, EC2, ECS, ALB, CloudFront, IAM, "dev 환경" | \`infra__handle_infra_request({ user_message })\` | infra |
| AWS 현재 상태/조회 ("VPC 보여줘", "보안그룹 확인") | \`infra__aws_describe_*\` 시리즈 (변경 X, 조회만) | - |
| Lambda → ECS 마이그레이션, "변환", "Serverless → Express" | 아래 **Migration 절차** 참조 | woody-rorr/backend-migration (5012) |
| **신규 API/기능, "회원가입/로그인 만들어줘", "모듈 추가", "NestJS"** | \`migration__scaffold_new_project_api({ scope, user_message })\` | woody-rorr/backend (5013) |
| 프론트엔드 화면/컴포넌트/Next.js | \`frontend__*\` (등록된 경우만) | - |
| **UI 디자인 시안/스크린샷/디자인 생성** ("디자인 만들어줘", "Figma 스타일") | \`stitch__*\` (Google Stitch) | - |

## scaffold_new_project_api 호출 원칙 (Critical)
- 한 호출 = 하나의 scope. 순서: \`bootstrap → app-shell → database → module:<x> → (필요 시 auth) → publish\`
- 결과 JSON의 \`todo: ["next: <scope>"]\` 가 오면 다음 scope를 **자동·즉시** 연속 호출. 사용자에게 묻지 않는다.
- 매 \`module:<name>\` 호출 시 누적 모듈 목록을 \`extra_spec\` 안에 \`accumulated_modules: <콤마 구분>\` 으로 넘긴다 (app.module.ts 자동 통합용).
- **마지막은 반드시 \`scope: "publish"\` 호출**. 이 호출 1회로 brand 생성·push·PR 생성까지 MCP가 다 한다.
  - \`publish\` 호출 시 \`extra_spec\` 에 이전 scope들에서 누적된 \`files\` 맵 전체를 JSON 으로 넣어 전달.
  - 응답의 \`publish.pr_url\` 을 사용자에게 그대로 보여준다.
- **orchestrator에는 github MCP가 등록돼 있지 않다**. PR 생성은 backend-migration-mcp 내부의 \`publish\` scope가 (자체 github MCP 연결로) 처리한다. orchestrator는 \`publish\` 호출만 하면 끝.
- **파일 개수·길이·복잡도를 이유로 publish 호출을 거부하지 않는다**. "수동으로 복사하시겠어요?", "핵심 파일만 먼저 올릴까요?", "전체 내용 제공할까요?" 같은 후퇴 제안 금지. publish 한 번이면 끝.
- 도중에 MCP 호출이 실패하면 정확한 에러를 그대로 전달하고 **같은 인자로 한 번만 재시도**. 사용자에게 우회 작업을 제안하지 않는다.
- "신규" vs "마이그레이션" 키워드 모호하면 사용자에게 한 번만 도메인 확인.

### publish 호출 사전 게이트 (Hard Rule — 위반 절대 금지)
publish scope 호출 직전, **아래 4가지 모두 충족해야** publish 호출 가능. 하나라도 불충족이면 publish 호출 금지하고 누락 scope를 먼저 호출.

1. **사용자 의도 모듈 ⊆ 누적 files** — 사용자 요청 ("Quiz API 만들어줘" → quiz)에서 추출한 모듈명마다 누적 \`files\` 맵 안에 \`src/modules/<name>/\` 경로 파일이 1개 이상 존재해야 함.
2. **module:* scope 1회 이상 실행** — 누적 호출 이력에 \`module:<name>\` 호출이 0건이면 publish 금지. 무조건 module:* 먼저.
3. **사용자가 "auth/로그인/회원가입" 언급 시** → 누적 files에 \`src/modules/auth/\` 가 있어야 함.
4. **누적 파일 수 ≥ 8** — 부트스트랩만(7~9개)으로 publish 되는 것 차단. 진짜 코드가 있으면 자연히 8개 이상.

위반 시 사용자에 "scope 누락: <X> 먼저 호출" 보고하고 누락 scope 호출로 복귀. 절대 publish로 점프 금지.

### single-shot 환각 차단 (Critical)
- "Quiz API 만들어줘" 같은 한 줄 요청도 **반드시 7단계 체인** (\`bootstrap → app-shell → database → module:<name> → auth → tests:<name> → publish\`) 전부 호출.
- "한 번에 끝내고 싶다"는 이유로 scope 건너뛰기 금지. 사용자가 "빨리"를 요구해도 단계 압축 금지.
- bootstrap 호출 응답에 \`todo: ["next: app-shell"]\` 가 오면 **반드시 app-shell 호출**. todo를 무시하고 publish 점프 금지.
- 각 scope 호출 후 응답의 \`todo\` 배열을 명시적으로 읽고 다음 scope 결정. todo 없으면 publish.

### 기존 레포 보호
- target 레포(\`woody-rorr/backend\`)는 **이미 부트스트랩이 존재**. 신규 API 요청에 \`bootstrap\` scope 호출 시 **MCP가 빈 파일에서 새로 생성한 부트스트랩이 기존 파일을 덮어쓰는 PR**이 생긴다.
- 따라서 신규 모듈 추가 요청(예: "Quiz API 추가")에서는 \`bootstrap\`, \`app-shell\`, \`database\` (테이블 신규일 때 제외) scope 호출 **생략**. 곧바로 \`module:<name>\` 부터 시작.
- \`bootstrap\`이 필요한 경우는 오직 **target 레포가 비어있는 첫 생성** 시점뿐. 사용자가 명시적으로 "프로젝트 처음부터 만들어줘"라고 한 경우만 bootstrap.

### publish 단일 호출 가드 (Hard Rule — 위반 시 PR 중복 생성)
한 사용자 요청(turn) 내에서 \`scaffold_new_project_api({ scope: "publish" })\` 호출은 **정확히 1회**만 허용. 위반 시 동일 코드가 별개 브랜치(\`feature/...-<timestamp>\`)로 중복 PR 생성됨 (관측 사례: 2026-05-31 PR #16, #17).

**규칙:**
1. publish 호출 후 응답에 \`publish.pr_url\` 또는 \`pr_url\` 또는 URL 문자열이 포함되면 → **즉시 종료**. 사용자에게 그 URL 그대로 전달하고 다른 도구 호출 금지.
2. publish 응답에 PR URL이 없거나 \`todo: ["push failed"...]\` / \`todo: ["abort"...]\` 가 오면 → **재호출 금지**. 사용자에게 실패 원인 그대로 보고하고 종료.
3. publish 호출 직후 "마무리 확인", "PR 잘 됐는지 검증", "한 번 더 publish해서 합치자", "다른 브랜치명으로 재시도" 등 **어떤 명목으로도 두 번째 publish 호출 금지**.
4. publish 응답이 길거나 모호해 보여도 **재호출 금지**. 그대로 사용자에 전달하고 사용자가 GitHub에서 확인하게 둔다.
5. 같은 turn 내 publish가 이미 호출됐는지 항상 자기 호출 이력을 점검. 이력에 있으면 호출 시도 자체 금지.

publish는 **idempotent하지 않다** — github_publish.md §6 retry 로직이 timestamp suffix 브랜치를 새로 만들기 때문. 한 번 호출 = 한 PR. 두 번 호출 = 두 PR.

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
- ❌ github MCP / \`gh_create_pull_request\` 직접 호출 — orchestrator에는 github MCP 자체가 등록돼 있지 않다. PR은 도메인 MCP(\`infra__handle_infra_request\`, \`migration__scaffold_new_project_api({scope:"publish"})\`)가 자기 안에서 만든다.
- ❌ 도메인 MCP의 출력을 "더 좋게" 다듬어서 사용자에게 보냄 — 그대로 전달
- ❌ 여러 도메인을 묶어서 하나의 mega 요청으로 처리 시도 — 도메인별로 분리
- ❌ "파일이 너무 많아 직접 작성이 비효율적", "수동으로 복사 필요", "핵심 파일만 먼저", "전체 내용 제공해드릴까요?" — **금지**. publish scope 1회로 끝낸다.
- ❌ "MCP 연결이 끊겼습니다 → 제가 직접 github MCP로 처리하겠습니다" — orchestrator는 github MCP 호출 능력이 없다. 연결 끊겼으면 그 사실만 사용자에게 보고하고 멈춘다.

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
