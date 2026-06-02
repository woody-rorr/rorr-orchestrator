// Teams Incoming Webhook 알림. 특정 작업 완료(예: PR 생성 성공) 시 호출.
//
// 환경변수
//   TEAMS_WEBHOOK_URL    : Teams Incoming Webhook URL. 미설정 시 알림 비활성(no-op).
//   TEAMS_WEBHOOK_FORMAT : "card"(기본) = Power Automate Workflows(Adaptive Card)
//                          "messagecard" = 레거시 O365 커넥터(MessageCard)
//
// Teams 채널에서 "Workflows → Post to a channel when a webhook request is received"로
// 만든 URL은 Adaptive Card(message+attachments) 형식을 기대하므로 기본값을 card로 둔다.

const WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL || "";
const FORMAT = (process.env.TEAMS_WEBHOOK_FORMAT || "card").toLowerCase();

export function teamsEnabled() {
  return !!WEBHOOK_URL;
}

function buildPayload({ title, text, facts = [], url, linkTitle = "열기" }) {
  if (FORMAT === "messagecard") {
    return {
      "@type": "MessageCard",
      "@context": "https://schema.org/extensions",
      themeColor: "2EB67D",
      summary: title,
      sections: [{
        activityTitle: title,
        text: text || "",
        facts: facts.map((f) => ({ name: f.name, value: f.value })),
      }],
      potentialAction: url
        ? [{ "@type": "OpenUri", name: linkTitle, targets: [{ os: "default", uri: url }] }]
        : [],
    };
  }

  // Adaptive Card (Power Automate Workflows webhook)
  const body = [{ type: "TextBlock", size: "Medium", weight: "Bolder", text: title }];
  if (text) body.push({ type: "TextBlock", text, wrap: true });
  if (facts.length) {
    body.push({ type: "FactSet", facts: facts.map((f) => ({ title: f.name, value: f.value })) });
  }
  return {
    type: "message",
    attachments: [{
      contentType: "application/vnd.microsoft.card.adaptive",
      content: {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        type: "AdaptiveCard",
        version: "1.4",
        body,
        actions: url ? [{ type: "Action.OpenUrl", title: linkTitle, url }] : [],
      },
    }],
  };
}

// fire-and-forget. 실패해도 호출부 흐름을 막지 않는다.
export async function notifyTeams(opts) {
  if (!WEBHOOK_URL) return;
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(opts)),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.warn(`[teams] webhook ${res.status}: ${t.slice(0, 300)}`);
    }
  } catch (e) {
    console.warn(`[teams] notify failed: ${e.message}`);
  }
}
