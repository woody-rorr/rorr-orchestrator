// Claude Code CLI를 spawn해서 LLM + MCP 라우팅을 위임.
// 인증: ~/.claude/.credentials.json (entrypoint.sh가 SSM에서 복원)
// MCP: 임시 .mcp.json을 만들어서 --mcp-config로 전달 → CLI가 자동 라우팅/툴 호출

import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { listServerCatalog } from "./mcpRegistry.js";

const TIMEOUT_MS = parseInt(process.env.CLAUDE_TIMEOUT_MS || "300000", 10);
const MODEL = process.env.LLM_MODEL || "";  // 비우면 CLI 기본

console.log(`[llm] provider=claude-code model=${MODEL || "(default)"}`);

const SYSTEM_PROMPT = `당신은 rorr 회사의 도메인 라우터입니다.
사용자 요청을 의도별로 적절한 MCP의 전문 에이전트 tool에 위임합니다.

## 라우팅 규칙
- 인프라/Terraform/AWS → infra MCP의 handle_infra_request 호출
- 인프라 상태 조회 → infra MCP의 aws_describe_* 시리즈
- 백엔드/프론트엔드 작업 → 해당 도메인 MCP 사용 (있을 경우)

## 일반 규칙
- 의도 모호 시 사용자에게 되묻기
- tool 결과(PR URL 등)는 가공 없이 사용자에게 전달
- 실패 시 어디서 실패했는지 명시
`;

// 카탈로그에서 configured URL들을 모아 .mcp.json 빌드
function buildMcpConfig() {
  const servers = {};
  for (const c of listServerCatalog()) {
    const url = process.env[c.urlEnv ?? ""] ?? c.url;
    if (!url) continue;
    servers[c.name] = { type: "http", url };
  }
  return { mcpServers: servers };
}

// 메시지 배열을 단일 프롬프트로 직렬화 (CLI -p에 넘기기 위함)
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

export async function runChat({ messages /*, registry */ }) {
  const prompt = serializeMessages(messages);
  const mcpConfig = buildMcpConfig();

  // 임시 .mcp.json
  const tmpFile = path.join(os.tmpdir(), `mcp-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify(mcpConfig));

  const args = [
    "-p", prompt,
    "--output-format", "json",
    "--append-system-prompt", SYSTEM_PROMPT,
    "--mcp-config", tmpFile,
    "--dangerously-skip-permissions", // ECS 환경, 자체 격리됨
  ];
  if (MODEL) args.push("--model", MODEL);

  return new Promise((resolve) => {
    let stdout = "", stderr = "";
    const child = spawn("claude", args, { stdio: ["ignore", "pipe", "pipe"] });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finalize({ error: `claude CLI timeout (${TIMEOUT_MS}ms)` });
    }, TIMEOUT_MS);

    let resolved = false;
    function finalize(out) {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      try { fs.unlinkSync(tmpFile); } catch {}
      resolve(out);
    }

    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });

    child.on("error", (e) => finalize({ final: [{ type: "text", text: `claude spawn error: ${e.message}` }] }));

    child.on("close", (code) => {
      if (code !== 0) {
        return finalize({ final: [{ type: "text", text: `claude exited ${code}: ${stderr || stdout}` }] });
      }
      // --output-format json: { type: "result", subtype: "success", result: "<text>" }
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
