import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

function normalizeToolId(serverId, toolName) {
  return `mcp_${serverId}_${toolName}`;
}

export class McpRegistry {
  constructor(serverConfigs) {
    this.serverConfigs = Array.isArray(serverConfigs) ? serverConfigs : [];
    this.clients = [];
    this.tools = [];
    this.loadErrors = [];
  }

  async load() {
    for (const config of this.serverConfigs) {
      if (config.transport !== "stdio") {
        this.loadErrors.push(`Unsupported MCP transport for ${config.id}: ${config.transport}`);
        continue;
      }

      try {
        const client = new Client({ name: "openclaw-plus", version: "0.1.0" });
        const transport = new StdioClientTransport({
          command: config.command,
          args: config.args ?? [],
          env: config.env ?? process.env
        });

        await client.connect(transport);
        const listed = await client.listTools();
        const tools = listed?.tools ?? [];

        this.clients.push({ id: config.id, client, transport });

        for (const tool of tools) {
          const localId = normalizeToolId(config.id, tool.name);

          this.tools.push({
            id: localId,
            name: `${config.id} / ${tool.name}`,
            description: tool.description || `MCP tool from ${config.id}`,
            inputSchema: tool.inputSchema || {
              type: "object",
              properties: {},
              additionalProperties: true
            },
            async run({ input }) {
              const result = await client.callTool({
                name: tool.name,
                arguments: input ?? {}
              });
              return result;
            }
          });
        }
      } catch (error) {
        this.loadErrors.push(`MCP ${config.id} failed: ${String(error?.message ?? error)}`);
      }
    }
  }

  publicTools() {
    return this.tools.map((tool) => ({
      id: tool.id,
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      source: "mcp"
    }));
  }

  toolsFor(enabledIds) {
    if (!Array.isArray(enabledIds) || enabledIds.length === 0) {
      return [...this.tools];
    }

    const enabledSet = new Set(enabledIds);
    return this.tools.filter((tool) => enabledSet.has(tool.id));
  }
}
