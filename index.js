import "dotenv/config";
import express from "express";
import cors from "cors";
import { spawn } from "child_process";
import { listServerCatalog } from "./mcpRegistry.js";
import { runChat } from "./chat.js";

const PORT = parseInt(process.env.PORT || "4000", 10);

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static("public"));

app.get("/health", (_, res) => {
  res.json({ status: "ok", catalog: listServerCatalog() });
});

app.get("/status", async (_, res) => {
  const out = {
    llm: {
      provider: "claude-code",
      model: process.env.LLM_MODEL || "(default)",
      credentials_path: "/root/.claude/.credentials.json",
    },
    mcps: listServerCatalog(),
  };
  // Claude CLI 실행 가능 여부 빠른 체크 (--version)
  try {
    out.llm.claude_ok = await new Promise((resolve) => {
      const c = spawn("claude", ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
      let buf = "";
      c.stdout.on("data", (d) => { buf += d.toString(); });
      c.on("error", () => resolve(false));
      c.on("close", (code) => resolve(code === 0 ? buf.trim() : false));
    });
  } catch (e) {
    out.llm.claude_ok = false;
    out.llm.claude_error = e.message;
  }
  res.json(out);
});

app.get("/mcps", (_, res) => {
  res.json(listServerCatalog());
});

app.post("/chat", async (req, res) => {
  const { messages } = req.body;
  if (!Array.isArray(messages)) return res.status(400).json({ error: "messages required" });
  try {
    const { final } = await runChat({ messages });
    res.json({ content: final });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`rorr-orchestrator on :${PORT} (LLM: claude-code CLI)`));
