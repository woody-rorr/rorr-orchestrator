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
