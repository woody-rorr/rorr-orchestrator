// 도메인 MCP 카탈로그. 실제 MCP 연결은 Claude CLI가 처리.
// 여기는 (1) UI 카탈로그 표시 (2) chat.js가 .mcp.json 빌드용으로만 사용.

const SERVERS = [
  {
    name: "infra",
    label: "Infra MCP",
    domain: "infra",
    desc: "Terraform 코드 생성, 인프라 변경",
    urlEnv: "MCP_INFRA_URL",
  },
  {
    name: "migration",
    label: "Backend MCP",
    domain: "backend",
    desc: "Lambda→Express 마이그레이션(5012) + 신규 NestJS API scaffolding(5013)",
    urlEnv: "MCP_MIGRATION_URL",
  },
  {
    name: "frontend",
    label: "Frontend MCP",
    domain: "frontend",
    desc: "프론트엔드(웹/Next.js) 화면·컴포넌트 생성",
    urlEnv: "MCP_FRONTEND_URL",
  },
  {
    name: "stitch",
    label: "Stitch MCP (Google)",
    domain: "design",
    desc: "Google Stitch — UI 디자인/스크린샷 생성",
    urlEnv: "MCP_STITCH_URL",
    external: true,
    staticHeaders: { "X-Goog-Api-Key": "STITCH_API_KEY" }, // value=env var name
    skipUserAuth: true,
    // SDK가 $defs 스키마를 못 풀어 listTools가 실패하므로 알려진 도구 목록을 하드코딩
    fallbackTools: [
      "list_projects",
      "create_project",
      "get_project",
      "list_screens",
      "get_screen",
      "generate_screen_from_text",
      "edit_screens",
      "generate_variants",
      "upload_design_md",
      "create_design_system",
      "create_design_system_from_design_md",
      "update_design_system",
      "list_design_systems",
      "apply_design_system",
    ],
  },
  {
    name: "web",
    label: "Web MCP",
    domain: "web",
    desc: "웹 페이지/사이트 생성 (front-test repo)",
    urlEnv: "MCP_WEB_URL",
  },
  {
    name: "extension",
    label: "Extension MCP",
    domain: "extension",
    desc: "브라우저 익스텐션(Chrome Extension) 생성 (extension-test repo)",
    urlEnv: "MCP_EXTENSION_URL",
  },
  {
    name: "notion",
    label: "Notion MCP",
    domain: "notion",
    desc: "Notion 워크스페이스 — 페이지/DB 검색·조회·생성·수정",
    urlEnv: "MCP_NOTION_URL", // 기본 https://mcp.notion.com/mcp
    external: true,
    // 호스티드 Notion MCP는 user OAuth만 지원 → headless 컨테이너에서는 불가.
    // Stitch와 동일하게 Internal Integration 토큰을 정적 Authorization 헤더로 주입한다.
    // NOTION_TOKEN(ntn_...) 값에 "Bearer " 접두사는 자동으로 붙는다.
    staticHeaders: { Authorization: "NOTION_TOKEN" }, // value = env var name
    skipUserAuth: true,
  },
];

export function listServerCatalog() {
  return SERVERS.map(
    ({
      name,
      label,
      domain,
      desc,
      urlEnv,
      staticHeaders,
      skipUserAuth,
      fallbackTools,
      external,
    }) => {
      const resolvedHeaders = {};
      if (staticHeaders) {
        for (const [h, envName] of Object.entries(staticHeaders)) {
          let v = process.env[envName];
          if (!v) continue;
          // Authorization 헤더는 "Bearer <token>" 형식 보장 (이미 있으면 그대로)
          if (h === "Authorization" && !/^Bearer\s/i.test(v)) v = `Bearer ${v}`;
          resolvedHeaders[h] = v;
        }
      }
      return {
        name,
        label,
        domain,
        desc,
        urlEnv,
        url: process.env[urlEnv] ?? null,
        configured: !!process.env[urlEnv],
        staticHeaders: Object.keys(resolvedHeaders).length
          ? resolvedHeaders
          : undefined,
        skipUserAuth: !!skipUserAuth,
        fallbackTools: fallbackTools || undefined,
        external: !!external,
      };
    },
  );
}
