// 도메인 MCP 카탈로그. 실제 MCP 연결은 Claude CLI가 처리.
// 여기는 (1) UI 카탈로그 표시 (2) chat.js가 .mcp.json 빌드용으로만 사용.

const SERVERS = [
  { name: "infra",     label: "Infra MCP",             domain: "infra",     desc: "Terraform 코드 생성, 인프라 변경",                              urlEnv: "MCP_INFRA_URL" },
  { name: "migration", label: "Backend Migration MCP", domain: "migration", desc: "Lambda(Serverless) → ECS(Express) 코드 마이그레이션",            urlEnv: "MCP_MIGRATION_URL" },
];

export function listServerCatalog() {
  return SERVERS.map(({ name, label, domain, desc, urlEnv }) => ({
    name, label, domain, desc, urlEnv,
    url: process.env[urlEnv] ?? null,
    configured: !!process.env[urlEnv],
  }));
}
