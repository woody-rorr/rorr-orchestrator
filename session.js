// DB 없는 세션 — 서명된 쿠키에 사용자 정보 직접 포함.
import crypto from "crypto";
import { getSsm } from "./ssm.js";

let _secretCache = null;
async function getSecret() {
  if (_secretCache) return _secretCache;
  _secretCache = (await getSsm("/rorr/session/secret")) || process.env.SESSION_SECRET || "fallback-dev-only-do-not-use-in-prod";
  return _secretCache;
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url").slice(0, 43);
}

export async function createSessionToken(payload) {
  const secret = await getSecret();
  const json = JSON.stringify({ ...payload, iat: Date.now() });
  const b64 = Buffer.from(json).toString("base64url");
  return `${b64}.${sign(b64, secret)}`;
}

export async function verifySessionToken(token, maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  if (!token || typeof token !== "string") return null;
  const [b64, sig] = token.split(".");
  if (!b64 || !sig) return null;
  const secret = await getSecret();
  const expected = sign(b64, secret);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString());
    if (typeof payload.iat !== "number" || Date.now() - payload.iat > maxAgeMs) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    out[part.slice(0, eq)] = decodeURIComponent(part.slice(eq + 1));
  }
  return out;
}
