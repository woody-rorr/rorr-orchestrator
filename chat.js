import Anthropic from "@anthropic-ai/sdk";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { callTool, flattenTools } from "./mcpRegistry.js";

const PROVIDER = process.env.LLM_PROVIDER || (process.env.ANTHROPIC_API_KEY ? "anthropic" : "bedrock");
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const AWS_PROFILE = process.env.AWS_PROFILE;  // 로컬에서만 사용; ECS에선 비어 있어야 함

const MODEL = process.env.LLM_MODEL ||
  (PROVIDER === "bedrock"
    ? "anthropic.claude-3-5-sonnet-20241022-v2:0"
    : "claude-opus-4-7");

console.log(`[llm] provider=${PROVIDER} model=${MODEL} profile=${AWS_PROFILE || "(default chain)"}`);

const anthropic = PROVIDER === "anthropic" ? new Anthropic() : null;
// AWS SDK 기본 자격증명 체인 사용:
// - 로컬: AWS_PROFILE 환경변수 자동 인식 (~/.aws/credentials)
// - ECS:  컨테이너 자격증명(Task Role) 자동 인식
const bedrock = PROVIDER === "bedrock"
  ? new BedrockRuntimeClient({ region: AWS_REGION })
  : null;

async function llmCall({ system, tools, messages }) {
  if (PROVIDER === "anthropic") {
    return await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system,
      tools,
      messages,
    });
  }
  const body = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 8192,
    system,
    tools,
    messages,
  };
  const cmd = new InvokeModelCommand({
    modelId: MODEL,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(body),
  });
  const res = await bedrock.send(cmd);
  const json = JSON.parse(new TextDecoder().decode(res.body));
  return json;
}

const SYSTEM_PROMPT = `당신은 rorr 회사의 인프라/개발 자동화 어시스턴트입니다.
사용자의 자연어 요청을 받아 적절한 MCP 도구를 호출해 GitHub PR을 생성합니다.

## 사용 가능한 MCP 도구 (prefix로 도메인 구분)
- infra__*  : 인프라 (Terraform 코드)
- backend__* : 백엔드 (예정)
- frontend__* : 프론트엔드 (예정)

## 규칙
- 의도가 모호하면 사용자에게 되묻기
- 변경 적용 전 요약 보고
- 실패 시 어디서 실패했는지 명시
- 각 MCP가 노출한 resources(SUMMARY.md 등)를 먼저 확인할 것
`;

function buildSystemPrompt(registry) {
  const sections = [SYSTEM_PROMPT];
  for (const [serverName, { docs }] of Object.entries(registry)) {
    if (!docs?.length) continue;
    sections.push(`\n## ${serverName} MCP 가이드 문서\n다음 문서들은 ${serverName} 도메인 작업 시 **반드시 따라야 하는 회사 규칙**입니다.\n`);
    for (const d of docs) {
      sections.push(`### ${d.name || d.uri}\n\n${d.text}\n`);
    }
  }
  return sections.join("\n");
}

export async function runChat({ messages, registry }) {
  const { tools, routing } = flattenTools(registry);
  const system = buildSystemPrompt(registry);
  let history = [...messages];

  for (let step = 0; step < 10; step++) {
    const res = await llmCall({ system, tools, messages: history });

    history.push({ role: "assistant", content: res.content });

    if (res.stop_reason !== "tool_use") {
      return { final: res.content, history };
    }

    const toolResults = [];
    for (const block of res.content) {
      if (block.type !== "tool_use") continue;
      console.log(`[tool] ${block.name}`, JSON.stringify(block.input).slice(0, 300));
      try {
        const result = await callTool(registry, routing, block.name, block.input);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result.content,
        });
      } catch (e) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: [{ type: "text", text: `Error: ${e.message}` }],
          is_error: true,
        });
      }
    }
    history.push({ role: "user", content: toolResults });
  }

  return { final: [{ type: "text", text: "최대 step 초과" }], history };
}
