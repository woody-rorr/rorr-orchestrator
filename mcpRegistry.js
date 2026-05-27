// 도메인 MCP 카탈로그. 실제 MCP 연결은 Claude CLI가 처리.
// 여기는 (1) UI 카탈로그 표시 (2) chat.js가 .mcp.json 빌드용으로만 사용.

const SERVERS = [
  { name: "infra",     label: "Infra MCP",             domain: "infra",     desc: "Terraform 코드 생성, 인프라 변경",                                              urlEnv: "MCP_INFRA_URL" },
  { name: "migration", label: "Backend MCP",           domain: "backend",   desc: "Lambda→Express 마이그레이션(5012) + 신규 NestJS API scaffolding(5013)",         urlEnv: "MCP_MIGRATION_URL" },
  { name: "frontend",  label: "Frontend MCP",          domain: "frontend",  desc: "프론트엔드(웹/Next.js) 화면·컴포넌트 생성",                                      urlEnv: "MCP_FRONTEND_URL" },
  { name: "stitch",    label: "Stitch MCP (Google)",   domain: "design",    desc: "Google Stitch — UI 디자인/스크린샷 생성",                                        urlEnv: "MCP_STITCH_URL",
    staticHeaders: { "X-Goog-Api-Key": "STITCH_API_KEY" },  // value=env var name
    skipUserAuth: true,
    // SDK가 $defs 스키마를 못 풀어 listTools가 실패하므로 알려진 도구 목록을 하드코딩
    fallbackTools: [
      "list_projects", "create_project", "get_project",
      "list_screens", "get_screen",
      "generate_screen_from_text", "edit_screens", "generate_variants",
      "upload_design_md",
      "create_design_system", "create_design_system_from_design_md",
      "update_design_system", "list_design_systems", "apply_design_system",
    ],
  },
  { name: "web",       label: "Web MCP",               domain: "web",       desc: "웹 도메인 MCP (legacy)",                                                        urlEnv: "MCP_WEB_URL" },
];

export function listServerCatalog() {
  return SERVERS.map(({ name, label, domain, desc, urlEnv, staticHeaders, skipUserAuth, fallbackTools }) => {
    const resolvedHeaders = {};
    if (staticHeaders) {
      for (const [h, envName] of Object.entries(staticHeaders)) {
        const v = process.env[envName];
        if (v) resolvedHeaders[h] = v;
      }
    }
    return {
      name, label, domain, desc, urlEnv,
      url: process.env[urlEnv] ?? null,
      configured: !!process.env[urlEnv],
      staticHeaders: Object.keys(resolvedHeaders).length ? resolvedHeaders : undefined,
      skipUserAuth: !!skipUserAuth,
      fallbackTools: fallbackTools || undefined,
    };
  });
}





 