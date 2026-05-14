import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectAllMcps, listServerCatalog } from "./mcpRegistry.js";
import { runChat } from "./chat.js";

const PORT = parseInt(process.env.PORT || "4000", 10);
const DEFAULT_USER_ID = process.env.DEFAULT_USER_ID || "anonymous";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static("public"));

// MCP 등록 (요청별 연결도 가능하지만 우선 시작 시 1회)
const registry = await connectAllMcps({ userId: DEFAULT_USER_ID });

app.get("/health", (_, res) => {
  res.json({
    status: "ok",
    mcps: Object.keys(registry).map((name) => ({
      name,
      tools: registry[name].tools.length,
      url: registry[name].url,
    })),
  });
});

app.get("/status", async (_, res) => {
  const out = {
    llm: {
      provider: process.env.LLM_PROVIDER || "bedrock",
      model: process.env.LLM_MODEL || "(default)",
      region: process.env.AWS_REGION || "us-east-1",
      profile_env: process.env.AWS_PROFILE || null,
    },
    runtime: {
      mode: process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ? "ECS Task Role"
          : process.env.AWS_PROFILE ? "Local AWS_PROFILE"
          : "default chain",
      ecs_metadata: process.env.ECS_CONTAINER_METADATA_URI_V4 || null,
    },
    mcps: listServerCatalog().map((c) => ({
      ...c,
      connected: !!registry[c.name],
      tools: registry[c.name]?.tools.length ?? 0,
      docs: registry[c.name]?.docs?.length ?? 0,
    })),
  };
  // Bedrock 호출 가능 여부 라이브 체크
  try {
    const { BedrockRuntimeClient, InvokeModelCommand } = await import("@aws-sdk/client-bedrock-runtime");
    const c = new BedrockRuntimeClient({ region: out.llm.region });
    await c.send(new InvokeModelCommand({
      modelId: out.llm.model,
      contentType: "application/json", accept: "application/json",
      body: JSON.stringify({ anthropic_version: "bedrock-2023-05-31", max_tokens: 1, messages: [{ role: "user", content: "x" }] }),
    }));
    out.llm.bedrock_ok = true;
  } catch (e) {
    out.llm.bedrock_ok = false;
    out.llm.bedrock_error = e.name + ": " + e.message.slice(0, 240);
  }
  res.json(out);
});

// 카탈로그 + 현재 연결 상태
app.get("/mcps", (_, res) => {
  const catalog = listServerCatalog();
  res.json(catalog.map((c) => ({
    ...c,
    connected: !!registry[c.name],
    tools: registry[c.name]?.tools.length ?? 0,
  })));
});

app.post("/chat", async (req, res) => {
  const { messages, enabled_mcps } = req.body;
  if (!Array.isArray(messages)) return res.status(400).json({ error: "messages required" });
  try {
    // enabled_mcps 지정되면 그 MCP들만 사용
    const filtered = enabled_mcps && Array.isArray(enabled_mcps)
      ? Object.fromEntries(Object.entries(registry).filter(([k]) => enabled_mcps.includes(k)))
      : registry;
    const { final } = await runChat({ messages, registry: filtered });
    res.json({ content: final });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`rorr-orchestrator on :${PORT}`));
