// Teams 알림 — RORR-Bot Gateway(Mac mini) 경유 전송. PR 생성 성공 등 작업 완료 시 호출.
//
// 구조: 오케스트레이터(AWS) → Tailscale → RORR-Bot Gateway(Mac mini) → Teams
//
// 설정
//   RORR_BOT_GATEWAY_URL    : 게이트웨이 invoke 엔드포인트. 미설정 시 알림 비활성(no-op).
//                             예) https://rorr-miniui-macmini-3.tail75e903.ts.net/tools/invoke
//   RORR_BOT_TOKEN          : 게이트웨이 Bearer 토큰. (로컬) env 우선, 없으면 SSM에서 로드.
//   SSM_RORR_BOT_TOKEN_PATH : 토큰 SSM 경로(SecureString). 기본 /rorr/teams/bot-token
//   RORR_BOT_AGENT_ID       : sessions_send 대상 agentId. 기본 "main"
//
// 토큰은 전송 시점에 SSM에서 조회한다(getSsm 60s 캐시).
// 전송: POST {gateway} { tool: "sessions_send", args: { agentId, message } }

import { getSsm } from "./ssm.js";

const GATEWAY_URL =
  process.env.RORR_BOT_GATEWAY_URL || "https://bot.rorr.club/tools/invoke";
const AGENT_ID = process.env.RORR_BOT_AGENT_ID || "main";
const SSM_BOT_TOKEN_PATH =
  process.env.SSM_RORR_BOT_TOKEN_PATH || "/rorr/teams/bot-token";

export function teamsEnabled() {
  return !!GATEWAY_URL;
}

async function getBotToken() {
  // 로컬 개발: 환경변수 우선. ECS: SSM SecureString(RORR_BOT_TOKEN).
  if (process.env.RORR_BOT_TOKEN) return process.env.RORR_BOT_TOKEN;
  return await getSsm(SSM_BOT_TOKEN_PATH);
}

// 구조화된 알림(title/text/facts/url)을 채팅 메시지 한 덩어리로 평탄화.
function buildMessage({ title, text, facts = [], url, linkTitle = "열기" }) {
  const lines = [];
  if (title) lines.push(title);
  if (text) lines.push(text);
  if (facts.length) {
    if (lines.length) lines.push("");
    for (const f of facts) lines.push(`${f.name}: ${f.value}`);
  }
  if (url) {
    if (lines.length) lines.push("");
    lines.push(`${linkTitle}: ${url}`);
  }
  return lines.join("\n");
}

// fire-and-forget. 실패해도 호출부 흐름을 막지 않는다.
export async function notifyTeams(opts) {
  if (!teamsEnabled()) return;
  try {
    const token = await getBotToken();
    if (!token) {
      console.warn(
        `[teams] bot token 없음 (env RORR_BOT_TOKEN / SSM ${SSM_BOT_TOKEN_PATH}) — 알림 건너뜀`,
      );
      return;
    }
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        tool: "sessions_send",
        args: { agentId: AGENT_ID, message: buildMessage(opts) },
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.warn(`[teams] gateway ${res.status}: ${t.slice(0, 300)}`);
    }
  } catch (e) {
    console.warn(`[teams] notify failed: ${e.message}`);
  }
}
