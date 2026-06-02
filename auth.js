import { Router } from "express";
import crypto from "crypto";
import { getSsm, putSsm } from "./ssm.js";
import { createSessionToken } from "./session.js";

const router = Router();

const BASE_URL = process.env.PUBLIC_BASE_URL || "http://mcp-agents-staging-alb-249976027.us-east-1.elb.amazonaws.com:4000";

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

async function getClientId() {
  return process.env.GITHUB_OAUTH_CLIENT_ID || await getSsm("/rorr/github/oauth-app/client-id", { decrypt: false });
}
async function getClientSecret() {
  return process.env.GITHUB_OAUTH_CLIENT_SECRET || await getSsm("/rorr/github/oauth-app/client-secret");
}

router.get("/github/login", async (req, res) => {
  const clientId = await getClientId();
  if (!clientId) return res.status(500).send("OAuth not configured");
  const state = crypto.randomBytes(16).toString("hex");
  res.cookie("oauth_state", state, { httpOnly: true, sameSite: "lax", maxAge: 600_000 });
  const redirect = `${BASE_URL}/auth/github/callback`;
  const url = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}&scope=${encodeURIComponent("repo,read:user,read:org")}&state=${state}&redirect_uri=${encodeURIComponent(redirect)}`;
  res.redirect(url);
});

router.get("/github/callback", async (req, res) => {
  const { code, state } = req.query;
  const cookies = parseRequestCookies(req);
  if (!state || state !== cookies.oauth_state) {
    return res.status(400).send("OAuth state mismatch");
  }
  if (!code) return res.status(400).send("Missing code");

  const clientId = await getClientId();
  const clientSecret = await getClientSecret();

  // Exchange code → access_token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: `${BASE_URL}/auth/github/callback` }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    return res.status(400).send(`OAuth token exchange failed: ${JSON.stringify(tokenData)}`);
  }

  // Fetch user info
  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${tokenData.access_token}`, "User-Agent": "rorr-orchestrator" },
  });
  const user = await userRes.json();
  if (!user.login) {
    return res.status(400).send(`GitHub user fetch failed: ${JSON.stringify(user)}`);
  }

  // Store user token in SSM (per-user)
  await putSsm(`/rorr/github/oauth/${user.login}/access_token`, tokenData.access_token);

  // Issue signed session cookie
  const session = await createSessionToken({
    login: user.login,
    name: user.name || user.login,
    avatar: user.avatar_url,
  });
  res.cookie("rorr_session", session, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_MS,
  });
  res.clearCookie("oauth_state");
  res.redirect("/");
});

router.post("/logout", (req, res) => {
  res.clearCookie("rorr_session");
  res.json({ ok: true });
});

function parseRequestCookies(req) {
  const out = {};
  const h = req.headers.cookie;
  if (!h) return out;
  for (const part of h.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    out[part.slice(0, eq)] = decodeURIComponent(part.slice(eq + 1));
  }
  return out;
}

export default router;
