import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";

export const skill = {
  id: "mcp_manager",
  name: "MCP Manager",
  description: "Manage MCP (Model Context Protocol) servers - list, install, configure, start, and stop MCP servers.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "list_available", "install", "uninstall", "start", "stop", "status", "configure"],
        description: "MCP management action"
      },
      serverId: {
        type: "string",
        description: "Server ID (for install/uninstall/start/stop)"
      },
      package: {
        type: "string",
        description: "NPM package name (for install)"
      },
      command: {
        type: "string",
        description: "Command to run (for configure)"
      },
      args: {
        type: "array",
        description: "Command arguments",
        items: { type: "string" }
      },
      env: {
        type: "object",
        description: "Environment variables",
        additionalProperties: { type: "string" }
      }
    },
    required: ["action"],
    additionalProperties: false
  },
  async run({ input, workspaceRoot }) {
    const action = input?.action;
    const configPath = path.join(workspaceRoot, "server", "config.json");

    const AVAILABLE_MCP_SERVERS = [
      { id: "filesystem", name: "Filesystem", package: "@modelcontextprotocol/server-filesystem", description: "Secure file operations" },
      { id: "git", name: "Git", package: "@modelcontextprotocol/server-git", description: "Git repository operations" },
      { id: "fetch", name: "Fetch", package: "@modelcontextprotocol/server-fetch", description: "Web content fetching" },
      { id: "memory", name: "Memory", package: "@modelcontextprotocol/server-memory", description: "Knowledge graph memory" },
      { id: "sequential-thinking", name: "Sequential Thinking", package: "@modelcontextprotocol/server-sequential-thinking", description: "Step-by-step reasoning" },
      { id: "time", name: "Time", package: "@modelcontextprotocol/server-time", description: "Time and timezone operations" },
      { id: "github", name: "GitHub", package: "@modelcontextprotocol/server-github", description: "GitHub API integration" },
      { id: "postgres", name: "PostgreSQL", package: "@modelcontextprotocol/server-postgres", description: "PostgreSQL database" },
      { id: "sqlite", name: "SQLite", package: "@modelcontextprotocol/server-sqlite", description: "SQLite database" },
      { id: "brave-search", name: "Brave Search", package: "@modelcontextprotocol/server-brave-search", description: "Web search" },
      { id: "puppeteer", name: "Puppeteer", package: "@modelcontextprotocol/server-puppeteer", description: "Browser automation" },
      { id: "slack", name: "Slack", package: "@modelcontextprotocol/server-slack", description: "Slack integration" },
      { id: "google-drive", name: "Google Drive", package: "@modelcontextprotocol/server-gdrive", description: "Google Drive integration" }
    ];

    const loadConfig = async () => {
      if (!existsSync(configPath)) {
        return { mcpServers: [] };
      }
      try {
        const data = await readFile(configPath, "utf8");
        return JSON.parse(data);
      } catch {
        return { mcpServers: [] };
      }
    };

    const saveConfig = async (config) => {
      await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
    };

    switch (action) {
      case "list": {
        const config = await loadConfig();
        const servers = (config.mcpServers || []).map(s => ({
          id: s.id,
          command: s.command,
          args: s.args,
          status: "configured"
        }));
        return { ok: true, action, count: servers.length, servers };
      }

      case "list_available": {
        return {
          ok: true,
          action,
          servers: AVAILABLE_MCP_SERVERS
        };
      }

      case "install":
      case "configure": {
        const serverId = input?.serverId || input?.package?.replace("@modelcontextprotocol/server-", "");
        if (!serverId) {
          throw new Error("serverId or package is required");
        }

        const config = await loadConfig();
        const existing = (config.mcpServers || []).find(s => s.id === serverId);
        
        if (existing && action === "install") {
          return { ok: false, error: `Server ${serverId} already installed. Use configure to modify.` };
        }

        const available = AVAILABLE_MCP_SERVERS.find(s => s.id === serverId);
        const packageName = input?.package || available?.package;
        
        if (!packageName && !input?.command) {
          return { ok: false, error: `Unknown server: ${serverId}. Use --package to specify.` };
        }

        const serverConfig = {
          id: serverId,
          command: input?.command || "npx",
          args: input?.args || (packageName ? ["-y", packageName] : []),
          env: input?.env || {}
        };

        if (existing) {
          const idx = config.mcpServers.findIndex(s => s.id === serverId);
          config.mcpServers[idx] = serverConfig;
        } else {
          config.mcpServers = config.mcpServers || [];
          config.mcpServers.push(serverConfig);
        }

        await saveConfig(config);

        return {
          ok: true,
          action,
          serverId,
          package: packageName,
          message: `Server ${serverId} ${existing ? 'updated' : 'installed'}. Restart server to apply.`
        };
      }

      case "uninstall": {
        const serverId = input?.serverId;
        if (!serverId) throw new Error("serverId is required");

        const config = await loadConfig();
        const initialLength = (config.mcpServers || []).length;
        config.mcpServers = (config.mcpServers || []).filter(s => s.id !== serverId);

        if (config.mcpServers.length === initialLength) {
          return { ok: false, error: `Server ${serverId} not found` };
        }

        await saveConfig(config);
        return { ok: true, action, serverId, message: `Server ${serverId} removed` };
      }

      case "status": {
        const serverId = input?.serverId;
        const config = await loadConfig();
        
        if (serverId) {
          const server = (config.mcpServers || []).find(s => s.id === serverId);
          if (!server) {
            return { ok: false, error: `Server ${serverId} not found` };
          }
          return { ok: true, action, server };
        }
        
        return {
          ok: true,
          action,
          servers: (config.mcpServers || []).map(s => ({
            id: s.id,
            configured: true
          }))
        };
      }

      default:
        throw new Error(`Unsupported action: ${action}`);
    }
  }
};
