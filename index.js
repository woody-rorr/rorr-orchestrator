import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

import { listServerCatalog } from "./mcpRegistry.js";
import { probeAll } from "./mcpProbe.js";
import { runChat } from "./chat.js";
import authRouter from "./auth.js";
import { verifySessionToken, parseCookies } from "./session.js";
import { getSsm } from "./ssm.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.PORT || "4000", 10);

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// 인증 라우트 (정적 서빙 전에)
app.use("/auth", authRouter);

// 세션 미들웨어
async function loadSession(req, _res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const session = await verifySessionToken(cookies.rorr_session).catch(() => null);
  req.session = session; // null이면 미인증
  next();
}
app.use(loadSession);

// 인증 필수 미들웨어
function requireAuth(req, res, next) {
  if (!req.session?.login) return res.status(401).json({ error: "unauthorized", login_url: "/auth/github/login" });
  next();
}

// 인증된 사용자의 GitHub 토큰을 SSM에서 가져오기
async function attachUserToken(req, res, next) {
  try {
    req.userToken = await getSsm(`/rorr/github/oauth/${req.session.login}/access_token`);
    if (!req.userToken) return res.status(401).json({ error: "token_missing", login_url: "/auth/github/login" });
    next();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// API
app.get("/me", (req, res) => {
  if (!req.session?.login) return res.status(401).json({ authenticated: false, login_url: "/auth/github/login" });
  res.json({ authenticated: true, ...req.session });
});

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

// 5초간 캐시 (UI가 자주 호출하므로 매번 probe하면 느림)
let _mcpsCache = { ts: 0, data: null };
app.get("/mcps", async (_, res) => {
  const now = Date.now();
  if (_mcpsCache.data && now - _mcpsCache.ts < 5000) return res.json(_mcpsCache.data);
  try {
    const data = await probeAll(listServerCatalog());
    _mcpsCache = { ts: now, data };
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/chat", requireAuth, attachUserToken, async (req, res) => {
  const { messages, disabled_tools } = req.body;
  if (!Array.isArray(messages)) return res.status(400).json({ error: "messages required" });
  try {
    const { final, failedTools } = await runChat({ messages, userToken: req.userToken, disabledTools: disabled_tools });
    res.json({ content: final, failedTools: failedTools || [] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// 정적 서빙 — 메인 페이지는 인증 체크 후 분기
app.get("/", (req, res) => {
  if (!req.session?.login) return res.sendFile(path.join(__dirname, "public", "login.html"));
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => console.log(`rorr-orchestrator on :${PORT} (LLM: claude-code CLI, Auth: GitHub OAuth)`));
