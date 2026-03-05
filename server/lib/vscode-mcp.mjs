import { readFile } from "node:fs/promises";

const VSCODE_MCP_PATH = "C:\\Users\\mikep\\AppData\\Roaming\\Code\\User\\mcp.json";

export async function loadVsCodeMcpConfig(filePath = VSCODE_MCP_PATH) {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const servers = parsed?.servers || {};
    const inputs = Array.isArray(parsed?.inputs) ? parsed.inputs : [];
    return { ok: true, path: filePath, servers, inputs };
  } catch (error) {
    return { ok: false, path: filePath, error: String(error?.message || error), servers: {}, inputs: [] };
  }
}

export function detectHfMcp(config) {
  const servers = config?.servers || {};
  const inputs = config?.inputs || [];
  const serverEntry = Object.entries(servers).find(([name, v]) => {
    const key = String(name || "").toLowerCase();
    const url = String(v?.url || "").toLowerCase();
    return key.includes("hf") || key.includes("huggingface") || url.includes("huggingface.co/mcp");
  });

  const hasHfInput = inputs.some((i) => String(i?.id || "").toLowerCase() === "hf_token");

  if (!serverEntry) {
    return { configured: false, hasInput: hasHfInput };
  }

  const [serverName, serverConfig] = serverEntry;
  const authHeaderTemplate = serverConfig?.headers?.Authorization || serverConfig?.headers?.authorization || null;

  return {
    configured: true,
    hasInput: hasHfInput,
    serverName,
    url: serverConfig?.url || null,
    type: serverConfig?.type || null,
    authTemplatePresent: Boolean(authHeaderTemplate)
  };
}
