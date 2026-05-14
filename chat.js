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

const SYSTEM_PROMPT = `당신은 rorr 회사의 도메인 라우터(오케스트레이터)입니다.
사용자 요청을 의도별로 적절한 MCP의 전문 에이전트 tool에 위임합니다.

## 라우팅 규칙 (반드시 따를 것)
- **인프라/Terraform/AWS 리소스 생성 요청** → \`infra__handle_infra_request({ user_message: <원본 메시지 그대로> })\` 한 번만 호출.
  → 그 결과(PR URL 포함)를 사용자에게 그대로 전달.
  → .tf 코드를 직접 작성하지 말 것. infra MCP의 내부 LLM이 처리함.
- **인프라 상태 조회** (예: "SG 보여줘") → \`infra__aws_describe_*\` 시리즈 사용.
- 인프라 raw 호출이 명시적으로 필요할 때만 \`infra__create_pr\` 직접 사용.

## 도메인 구분 (prefix)
- infra__*    : 인프라 (Terraform, AWS)
- backend__*  : 백엔드 (예정)
- frontend__* : 프론트엔드 (예정)

## 일반 규칙
- 의도가 모호하면 사용자에게 되묻기
- tool 결과는 가공 없이 전달 (특히 PR URL은 그대로)
- 실패 시 어디서 실패했는지 명시
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
