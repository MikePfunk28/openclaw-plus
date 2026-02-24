import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import WebSocket from "ws";

const BASE_URL = process.env.OPENCLAW_BASE_URL || "http://127.0.0.1:8787";
const OWNER_TOKEN = process.env.OPENCLAW_OWNER_TOKEN || "";
const REQUIRE_AUTH = String(process.env.OPENCLAW_BRIDGE_REQUIRE_AUTH || "true").toLowerCase() !== "false";
const WORKSPACE_ROOT = process.env.OPENCLAW_WORKSPACE_ROOT || process.cwd();

function asJsonText(value) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

function asError(message) {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: String(message)
      }
    ]
  };
}

async function api(path, { method = "GET", body } = {}) {
  if (REQUIRE_AUTH && !OWNER_TOKEN) {
    throw new Error("OPENCLAW_OWNER_TOKEN is required by bridge policy");
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(OWNER_TOKEN ? { authorization: `Bearer ${OWNER_TOKEN}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`OpenClaw API ${response.status}: ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function invokeSkill(skillId, input) {
  return api(`/api/skills/${skillId}/invoke`, {
    method: "POST",
    body: input
  });
}

async function apiStream(path, body, onEvent, timeoutMs = 120000) {
  if (REQUIRE_AUTH && !OWNER_TOKEN) {
    throw new Error("OPENCLAW_OWNER_TOKEN is required by bridge policy");
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(OWNER_TOKEN ? { authorization: `Bearer ${OWNER_TOKEN}` } : {})
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(`OpenClaw API ${response.status}: ${JSON.stringify(payload)}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult = null;

  const timeoutId = setTimeout(() => {
    reader.cancel();
  }, timeoutMs);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            if (onEvent) onEvent(data);
            if (data?.type === "done" || data?.answer !== undefined) {
              finalResult = data;
            }
          } catch {}
        }
      }
    }
  } finally {
    clearTimeout(timeoutId);
  }

  return finalResult;
}

async function readAuditLog(limit = 100) {
  const logPath = path.join(WORKSPACE_ROOT, "data", "audit", "events.log");
  try {
    const raw = await readFile(logPath, "utf8");
    const lines = raw.trim().split("\n").filter(Boolean);
    return lines.slice(-limit).map(line => {
      try { return JSON.parse(line); } catch { return { raw: line }; }
    });
  } catch {
    return [];
  }
}

async function readAutomationLog(limit = 100) {
  const logPath = path.join(WORKSPACE_ROOT, "data", "automation", "events.log");
  try {
    const raw = await readFile(logPath, "utf8");
    const lines = raw.trim().split("\n").filter(Boolean);
    return lines.slice(-limit).map(line => {
      try { return JSON.parse(line); } catch { return { raw: line }; }
    });
  } catch {
    return [];
  }
}

const TOOLS = [
  {
    name: "openclaw_health",
    description: "Check OpenClaw server health status",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "openclaw_me",
    description: "Get current authenticated user info",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "openclaw_models",
    description: "List available AI models configured in OpenClaw",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "openclaw_skills",
    description: "List all available skills (local + MCP) with their schemas",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "openclaw_hooks",
    description: "List loaded automation hooks",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "openclaw_sessions",
    description: "List all sessions for the authenticated user",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "openclaw_get_session",
    description: "Get full session details including message history",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string", description: "Session ID to retrieve" }
      },
      required: ["sessionId"],
      additionalProperties: false
    }
  },
  {
    name: "openclaw_create_session",
    description: "Create a new OpenClaw session",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Session title" },
        settings: { type: "object", additionalProperties: true },
        agentId: { type: "string", description: "Agent ID to bind" },
        routeKey: { type: "string" },
        source: { type: "object", additionalProperties: true }
      },
      additionalProperties: false
    }
  },
  {
    name: "openclaw_run",
    description: "Run an objective through OpenClaw autonomous engine (non-streaming)",
    inputSchema: {
      type: "object",
      properties: {
        modelId: { type: "string", description: "Model ID to use" },
        objective: { type: "string", description: "Task objective for the agent" },
        sessionId: { type: "string", description: "Existing session ID to continue" },
        enabledSkillIds: { type: "array", items: { type: "string" }, description: "Skills to enable" },
        settings: { 
          type: "object", 
          properties: {
            maxSteps: { type: "number" },
            maxCycles: { type: "number" },
            autonomyMode: { type: "string", enum: ["continuous", "single-cycle"] },
            approvalMode: { type: "string", enum: ["never", "manual"] }
          },
          additionalProperties: true 
        }
      },
      required: ["modelId", "objective"],
      additionalProperties: false
    }
  },
  {
    name: "openclaw_run_stream",
    description: "Run objective with streaming progress events (returns final result)",
    inputSchema: {
      type: "object",
      properties: {
        modelId: { type: "string" },
        objective: { type: "string" },
        sessionId: { type: "string" },
        enabledSkillIds: { type: "array", items: { type: "string" } },
        settings: { type: "object", additionalProperties: true },
        timeoutMs: { type: "number", description: "Max wait time (default 120000)" }
      },
      required: ["modelId", "objective"],
      additionalProperties: false
    }
  },
  {
    name: "openclaw_inbound",
    description: "Send message through inbound gateway (for channel routing)",
    inputSchema: {
      type: "object",
      properties: {
        channel: { type: "string", description: "Channel name (e.g., 'api', 'telegram')" },
        modelId: { type: "string" },
        objective: { type: "string" },
        accountId: { type: "string" },
        peer: { type: "object", additionalProperties: true },
        enabledSkillIds: { type: "array", items: { type: "string" } },
        settings: { type: "object", additionalProperties: true }
      },
      required: ["channel", "modelId", "objective"],
      additionalProperties: false
    }
  },
  {
    name: "openclaw_audit_log",
    description: "Read recent audit log entries",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max entries to return (default 50)" }
      },
      additionalProperties: false
    }
  },
  {
    name: "openclaw_automation_log",
    description: "Read recent automation supervisor log entries",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max entries to return (default 50)" }
      },
      additionalProperties: false
    }
  },
  {
    name: "openclaw_shell",
    description: "Execute a shell command on the host system via OpenClaw",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to execute" },
        cwd: { type: "string", description: "Working directory" },
        timeout: { type: "number", description: "Timeout in ms (default 60000)" }
      },
      required: ["command"],
      additionalProperties: false
    }
  },
  {
    name: "openclaw_process_list",
    description: "List running processes on the host system",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "openclaw_process_kill",
    description: "Kill a process by PID or name",
    inputSchema: {
      type: "object",
      properties: {
        target: { type: "string", description: "PID or process name" }
      },
      required: ["target"],
      additionalProperties: false
    }
  },
  {
    name: "openclaw_process_start",
    description: "Start a new process",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Command to start" }
      },
      required: ["command"],
      additionalProperties: false
    }
  },
  {
    name: "openclaw_system_info",
    description: "Get system information (CPU, memory, network, OS)",
    inputSchema: {
      type: "object",
      properties: {
        detail: { type: "string", enum: ["basic", "full"] }
      },
      additionalProperties: false
    }
  },
  {
    name: "openclaw_file_list",
    description: "List files in workspace directory",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path in workspace" }
      },
      required: ["path"],
      additionalProperties: false
    }
  },
  {
    name: "openclaw_file_read",
    description: "Read a file from the workspace",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path in workspace" }
      },
      required: ["path"],
      additionalProperties: false
    }
  },
  {
    name: "openclaw_file_write",
    description: "Write content to a file in the workspace",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path in workspace" },
        content: { type: "string", description: "Content to write" }
      },
      required: ["path", "content"],
      additionalProperties: false
    }
  },
  {
    name: "openclaw_claude_code_status",
    description: "Check Claude Code CLI availability and version",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "openclaw_claude_code_run",
    description: "Run Claude Code CLI with a prompt",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Prompt for Claude Code" },
        cwd: { type: "string", description: "Working directory" },
        model: { type: "string", description: "Model (e.g., 'sonnet', 'opus')" },
        timeout: { type: "number", description: "Timeout in ms (default 120000)" },
        allowedTools: { type: "string", description: "Comma-separated allowed tools" }
      },
      required: ["prompt"],
      additionalProperties: false
    }
  },
  {
    name: "openclaw_claude_code_continue",
    description: "Continue most recent Claude Code session",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string" },
        model: { type: "string" },
        timeout: { type: "number" }
      },
      additionalProperties: false
    }
  },
  {
    name: "openclaw_claude_code_resume",
    description: "Resume a specific Claude Code session",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string", description: "Claude Code session ID" },
        cwd: { type: "string" },
        model: { type: "string" },
        timeout: { type: "number" }
      },
      required: ["sessionId"],
      additionalProperties: false
    }
  },
  {
    name: "openclaw_invoke_skill",
    description: "Directly invoke any OpenClaw skill by ID with custom input",
    inputSchema: {
      type: "object",
      properties: {
        skillId: { type: "string", description: "Skill ID to invoke" },
        input: { type: "object", additionalProperties: true, description: "Input for the skill" }
      },
      required: ["skillId"],
      additionalProperties: false
    }
  },
  {
    name: "openclaw_ws_run",
    description: "Run objective via WebSocket with real-time progress events",
    inputSchema: {
      type: "object",
      properties: {
        modelId: { type: "string" },
        objective: { type: "string" },
        sessionId: { type: "string" },
        enabledSkillIds: { type: "array", items: { type: "string" } },
        settings: { type: "object", additionalProperties: true },
        timeoutMs: { type: "number", description: "Timeout (default 120000)" }
      },
      required: ["modelId", "objective"],
      additionalProperties: false
    }
  },
  {
    name: "openclaw_store_get",
    description: "Get raw store.json contents (sessions data)",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: "openclaw_win_powershell",
    description: "Execute PowerShell commands on Windows",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "PowerShell command" },
        elevated: { type: "boolean", description: "Run as admin" },
        timeout: { type: "number" }
      },
      required: ["command"],
      additionalProperties: false
    }
  },
  {
    name: "openclaw_win_registry",
    description: "Read/write Windows registry",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["read", "write", "delete", "list"] },
        hive: { type: "string", enum: ["HKLM", "HKCU", "HKCR", "HKU", "HKCC"] },
        path: { type: "string" },
        name: { type: "string" },
        value: { type: "string" },
        type: { type: "string" }
      },
      required: ["action", "path"],
      additionalProperties: false
    }
  },
  {
    name: "openclaw_win_services",
    description: "Manage Windows services",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "get", "start", "stop", "restart", "config"] },
        name: { type: "string" },
        filter: { type: "string" }
      },
      required: ["action"],
      additionalProperties: false
    }
  },
  {
    name: "openclaw_win_winget",
    description: "Windows Package Manager (install/uninstall/search packages)",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["search", "install", "uninstall", "update", "list", "info", "upgrade-all"] },
        package: { type: "string" },
        source: { type: "string" },
        acceptPackageAgreements: { type: "boolean" },
        force: { type: "boolean" }
      },
      required: ["action"],
      additionalProperties: false
    }
  },
  {
    name: "openclaw_win_eventlog",
    description: "Read Windows Event Logs",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list-logs", "read", "query"] },
        log: { type: "string" },
        level: { type: "string" },
        count: { type: "number" },
        eventId: { type: "number" }
      },
      required: ["action"],
      additionalProperties: false
    }
  },
  {
    name: "openclaw_win_tasks",
    description: "Manage Windows scheduled tasks",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "get", "run", "end", "enable", "disable", "delete"] },
        path: { type: "string" }
      },
      required: ["action"],
      additionalProperties: false
    }
  },
  {
    name: "openclaw_win_network",
    description: "Windows network management (adapters, DNS, firewall)",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["adapters", "ipconfig", "dns", "netstat", "ping", "traceroute", "firewall-status", "connections"] },
        target: { type: "string" },
        adapter: { type: "string" },
        dnsAction: { type: "string" }
      },
      required: ["action"],
      additionalProperties: false
    }
  }
];

const server = new Server(
  { name: "openclaw-bridge", version: "0.2.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name;
  const input = request.params.arguments || {};

  try {
    switch (name) {
      case "openclaw_health": {
        const payload = await api("/api/health");
        return asJsonText(payload);
      }

      case "openclaw_me": {
        const payload = await api("/api/me");
        return asJsonText(payload);
      }

      case "openclaw_models": {
        const payload = await api("/api/models");
        return asJsonText(payload);
      }

      case "openclaw_skills": {
        const payload = await api("/api/skills");
        return asJsonText(payload);
      }

      case "openclaw_hooks": {
        const payload = await api("/api/hooks");
        return asJsonText(payload);
      }

      case "openclaw_sessions": {
        const payload = await api("/api/sessions");
        return asJsonText(payload);
      }

      case "openclaw_get_session": {
        const payload = await api(`/api/sessions/${input.sessionId}`);
        return asJsonText(payload);
      }

      case "openclaw_create_session": {
        const payload = await api("/api/sessions", {
          method: "POST",
          body: {
            title: input.title,
            settings: input.settings,
            agentId: input.agentId,
            routeKey: input.routeKey,
            source: input.source
          }
        });
        return asJsonText(payload);
      }

      case "openclaw_run": {
        const payload = await api("/api/run", {
          method: "POST",
          body: {
            modelId: input.modelId,
            objective: input.objective,
            sessionId: input.sessionId,
            enabledSkillIds: input.enabledSkillIds,
            settings: input.settings
          }
        });
        return asJsonText({
          answer: payload.answer,
          done: payload.done,
          doneReason: payload.doneReason,
          cycles: payload.cycles,
          sessionId: payload.session?.id,
          trace: payload.trace
        });
      }

      case "openclaw_run_stream": {
        const events = [];
        const result = await apiStream(
          "/api/run/stream",
          {
            modelId: input.modelId,
            objective: input.objective,
            sessionId: input.sessionId,
            enabledSkillIds: input.enabledSkillIds,
            settings: input.settings
          },
          (event) => events.push(event),
          input.timeoutMs || 120000
        );
        return asJsonText({
          result,
          eventsCount: events.length,
          eventTypes: [...new Set(events.map(e => e?.type))]
        });
      }

      case "openclaw_inbound": {
        const payload = await api(`/api/inbound/${input.channel}`, {
          method: "POST",
          body: {
            modelId: input.modelId,
            objective: input.objective,
            accountId: input.accountId,
            peer: input.peer,
            enabledSkillIds: input.enabledSkillIds,
            settings: input.settings
          }
        });
        return asJsonText(payload);
      }

      case "openclaw_audit_log": {
        const entries = await readAuditLog(input.limit || 50);
        return asJsonText({ count: entries.length, entries });
      }

      case "openclaw_automation_log": {
        const entries = await readAutomationLog(input.limit || 50);
        return asJsonText({ count: entries.length, entries });
      }

      case "openclaw_shell": {
        const result = await invokeSkill("shell_execute", {
          command: input.command,
          cwd: input.cwd,
          timeout: input.timeout
        });
        return asJsonText(result);
      }

      case "openclaw_process_list": {
        const result = await invokeSkill("process_control", { action: "list" });
        return asJsonText(result);
      }

      case "openclaw_process_kill": {
        const result = await invokeSkill("process_control", { 
          action: "kill", 
          target: input.target 
        });
        return asJsonText(result);
      }

      case "openclaw_process_start": {
        const result = await invokeSkill("process_control", { 
          action: "start", 
          target: input.command 
        });
        return asJsonText(result);
      }

      case "openclaw_system_info": {
        const result = await invokeSkill("system_info", { 
          detail: input.detail || "basic" 
        });
        return asJsonText(result);
      }

      case "openclaw_file_list": {
        const result = await invokeSkill("workspace_files", { 
          action: "list", 
          target: input.path 
        });
        return asJsonText(result);
      }

      case "openclaw_file_read": {
        const result = await invokeSkill("workspace_files", { 
          action: "read", 
          target: input.path 
        });
        return asJsonText(result);
      }

      case "openclaw_file_write": {
        const result = await invokeSkill("workspace_files", { 
          action: "write", 
          target: input.path,
          content: input.content
        });
        return asJsonText(result);
      }

      case "openclaw_claude_code_status": {
        const result = await invokeSkill("claude_code", { action: "status" });
        return asJsonText(result);
      }

      case "openclaw_claude_code_run": {
        const result = await invokeSkill("claude_code", {
          action: "run",
          prompt: input.prompt,
          cwd: input.cwd,
          model: input.model,
          timeout: input.timeout,
          allowedTools: input.allowedTools
        });
        return asJsonText(result);
      }

      case "openclaw_claude_code_continue": {
        const result = await invokeSkill("claude_code", {
          action: "continue",
          cwd: input.cwd,
          model: input.model,
          timeout: input.timeout
        });
        return asJsonText(result);
      }

      case "openclaw_claude_code_resume": {
        const result = await invokeSkill("claude_code", {
          action: "resume",
          sessionId: input.sessionId,
          cwd: input.cwd,
          model: input.model,
          timeout: input.timeout
        });
        return asJsonText(result);
      }

      case "openclaw_invoke_skill": {
        const result = await invokeSkill(input.skillId, input.input || {});
        return asJsonText(result);
      }

      case "openclaw_ws_run": {
        return await new Promise((resolve) => {
          const wsUrl = BASE_URL.replace(/^http/, "ws") + "/ws";
          const ws = new WebSocket(wsUrl);
          const events = [];
          let finalResult = null;

          const timeout = setTimeout(() => {
            ws.close();
            resolve(asJsonText({ ok: false, error: "WebSocket timeout", events }));
          }, input.timeoutMs || 120000);

          ws.on("open", () => {
            ws.send(JSON.stringify({
              type: "run",
              modelId: input.modelId,
              objective: input.objective,
              sessionId: input.sessionId,
              enabledSkillIds: input.enabledSkillIds,
              settings: input.settings
            }));
          });

          ws.on("message", (data) => {
            try {
              const msg = JSON.parse(data.toString());
              events.push(msg);

              if (msg.type === "done") {
                finalResult = msg.payload;
                clearTimeout(timeout);
                ws.close();
              }

              if (msg.type === "error") {
                clearTimeout(timeout);
                ws.close();
              }
            } catch {}
          });

          ws.on("close", () => {
            clearTimeout(timeout);
            resolve(asJsonText({
              ok: finalResult?.done !== false,
              result: finalResult,
              eventsCount: events.length,
              eventTypes: [...new Set(events.map(e => e?.type))]
            }));
          });

          ws.on("error", (err) => {
            clearTimeout(timeout);
            resolve(asJsonText({ ok: false, error: String(err.message || err), events }));
          });
        });
      }

      case "openclaw_store_get": {
        const storePath = path.join(WORKSPACE_ROOT, "data", "store.json");
        try {
          const raw = await readFile(storePath, "utf8");
          const data = JSON.parse(raw);
          const sessionCount = Array.isArray(data?.sessions) ? data.sessions.length : 0;
          return asJsonText({
            ok: true,
            sessionCount,
            sessions: (data?.sessions || []).map(s => ({
              id: s.id,
              title: s.title,
              userId: s.userId,
              createdAt: s.createdAt,
              messageCount: Array.isArray(s?.messages) ? s.messages.length : 0
            }))
          });
        } catch (error) {
          return asJsonText({ ok: false, error: String(error?.message || error) });
        }
      }

      case "openclaw_win_powershell": {
        const result = await invokeSkill("windows_powershell", {
          command: input.command,
          elevated: input.elevated,
          timeout: input.timeout
        });
        return asJsonText(result);
      }

      case "openclaw_win_registry": {
        const result = await invokeSkill("windows_registry", {
          action: input.action,
          hive: input.hive,
          path: input.path,
          name: input.name,
          value: input.value,
          type: input.type
        });
        return asJsonText(result);
      }

      case "openclaw_win_services": {
        const result = await invokeSkill("windows_services", {
          action: input.action,
          name: input.name,
          filter: input.filter
        });
        return asJsonText(result);
      }

      case "openclaw_win_winget": {
        const result = await invokeSkill("windows_winget", {
          action: input.action,
          package: input.package,
          source: input.source,
          acceptPackageAgreements: input.acceptPackageAgreements,
          force: input.force
        });
        return asJsonText(result);
      }

      case "openclaw_win_eventlog": {
        const result = await invokeSkill("windows_eventlog", {
          action: input.action,
          log: input.log,
          level: input.level,
          count: input.count,
          eventId: input.eventId
        });
        return asJsonText(result);
      }

      case "openclaw_win_tasks": {
        const result = await invokeSkill("windows_tasks", {
          action: input.action,
          path: input.path
        });
        return asJsonText(result);
      }

      case "openclaw_win_network": {
        const result = await invokeSkill("windows_network", {
          action: input.action,
          target: input.target,
          adapter: input.adapter,
          dnsAction: input.dnsAction
        });
        return asJsonText(result);
      }

      default:
        return asError(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return asError(String(error?.message || error));
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
