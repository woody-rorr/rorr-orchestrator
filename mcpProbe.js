// 각 도메인 MCP에 outbound로 연결해 listTools()로 연결성 + 도구 수 확인.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const PROBE_TIMEOUT_MS = 5000;

async function probeOne(entry) {
  if (!entry.url) return { ...entry, connected: false, tools: 0 };
  const client = new Client({ name: "rorr-orchestrator-probe", version: "0.1.0" });
  let timer;
  try {
    const transport = new StreamableHTTPClientTransport(new URL(entry.url), {
      requestInit: entry.staticHeaders ? { headers: entry.staticHeaders } : undefined,
    });
    const connectP = client.connect(transport);
    await Promise.race([
      connectP,
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error("probe timeout")), PROBE_TIMEOUT_MS); }),
    ]);
    const { tools } = await client.listTools();
    return { ...entry, connected: true, tools: tools.length, toolNames: tools.map(t => t.name) };
  } catch (e) {
    return { ...entry, connected: false, tools: 0, error: e.message };
  } finally {
    clearTimeout(timer);
    try { await client.close(); } catch {}
  }
}

export async function probeAll(catalog) {
  return Promise.all(catalog.map(probeOne));
}
