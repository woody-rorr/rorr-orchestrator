import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const SERVERS = [
  { name: "infra", urlEnv: "MCP_INFRA_URL" },
  { name: "backend", urlEnv: "MCP_BACKEND_URL" },
  { name: "frontend", urlEnv: "MCP_FRONTEND_URL" },
];

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
      registry[name] = { client, tools, url };
      console.log(`[mcp] connected: ${name} (${tools.length} tools) ${url}`);
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
