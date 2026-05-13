import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// 도메인별 MCP 카탈로그 (UI 토글에 그대로 표시됨)
const SERVERS = [
  { name: "infra",          label: "Infra MCP",            domain: "infra",    desc: "Terraform 코드 생성, 인프라 변경",       urlEnv: "MCP_INFRA_URL" },
  { name: "frontend-web",   label: "Frontend Web MCP",     domain: "frontend", desc: "웹 컴포넌트, PR 생성",                   urlEnv: "MCP_FRONTEND_WEB_URL" },
  { name: "frontend-ext",   label: "Frontend Extension MCP", domain: "frontend", desc: "확장 프로그램 관련 도구",              urlEnv: "MCP_FRONTEND_EXT_URL" },
  { name: "backend-api",    label: "Backend API MCP",      domain: "backend",  desc: "API 엔드포인트 생성",                    urlEnv: "MCP_BACKEND_API_URL" },
  { name: "backend-logic",  label: "Backend Logic MCP",    domain: "backend",  desc: "비즈니스 로직 작성",                     urlEnv: "MCP_BACKEND_LOGIC_URL" },
  { name: "backend-schema", label: "Backend Schema MCP",   domain: "backend",  desc: "DB 스키마 변경",                         urlEnv: "MCP_BACKEND_SCHEMA_URL" },
];

export function listServerCatalog() {
  return SERVERS.map(({ name, label, domain, desc, urlEnv }) => ({
    name, label, domain, desc,
    configured: !!process.env[urlEnv],
  }));
}

export async function connectAllMcps({ userId }) {
  const registry = {};
  for (const { name, urlEnv } of SERVERS) {
    const url = process.env[urlEnv];
    if (!url) continue;
    try {
      const client = new Client({ name: `rorr-orchestrator-${name}`, version: "0.1.0" });
      const transport = new StreamableHTTPClientTransport(new URL(url), {
        requestInit: { headers: { "x-user-id": userId } },
      });
      await client.connect(transport);
      const { tools } = await client.listTools();
      let resources = [];
      try {
        const r = await client.listResources();
        resources = r.resources ?? [];
      } catch {}
      const docs = [];
      for (const r of resources) {
        try {
          const res = await client.readResource({ uri: r.uri });
          for (const c of res.contents ?? []) {
            if (c.text) docs.push({ uri: r.uri, name: r.name, text: c.text });
          }
        } catch {}
      }
      registry[name] = { client, tools, resources, docs, url };
      console.log(`[mcp] connected: ${name} (${tools.length} tools, ${docs.length} docs) ${url}`);
    } catch (e) {
      console.error(`[mcp] failed to connect ${name} (${url}): ${e.message}`);
    }
  }
  return registry;
}

export function flattenTools(registry) {
  const tools = [];
  const routing = new Map();
  for (const [serverName, { tools: serverTools }] of Object.entries(registry)) {
    for (const t of serverTools) {
      const prefixed = `${serverName}__${t.name}`;
      tools.push({
        name: prefixed,
        description: `[${serverName}] ${t.description ?? ""}`,
        input_schema: t.inputSchema,
      });
      routing.set(prefixed, { serverName, toolName: t.name });
    }
  }
  return { tools, routing };
}

export async function callTool(registry, routing, prefixedName, args) {
  const r = routing.get(prefixedName);
  if (!r) throw new Error(`unknown tool: ${prefixedName}`);
  const { client } = registry[r.serverName];
  return await client.callTool({ name: r.toolName, arguments: args });
}
