# OpenClaw Plus

OpenClaw Plus is a model-agnostic, open-source agent shell with an intuitive web interface.
It is designed to run against many model providers and let you plug in local skills, MCP tools, and channel gateways with secure defaults.

**100% Windows Compatible** - No Homebrew, no Unix dependencies. Fully native Windows support with PowerShell, Registry, Services, Winget, and more.

## Full Claude Desktop/Cowork Integration

With the MCP bridge, Claude Desktop can now control your entire Windows PC through OpenClaw:
- **Autonomous Task Execution**: Run complex multi-step tasks without human intervention
- **Shell & PowerShell**: Execute any command via cmd.exe or PowerShell
- **Process Management**: List, start, and stop processes
- **Windows Services**: Start, stop, restart, and configure Windows services
- **Windows Registry**: Read, write, and delete registry keys and values
- **Package Management**: Install, uninstall, and update software via Winget
- **Event Logs**: Query Windows Application, System, and Security logs
- **Scheduled Tasks**: List, run, enable, and disable scheduled tasks
- **Network Management**: Adapters, DNS, firewall, and connections
- **File Operations**: Read, write, and list files in your workspace
- **Claude Code Control**: Orchestrate Claude Code CLI sessions
- **System Monitoring**: Real-time CPU, memory, and network info
- **Automation**: Trigger and monitor automated workflows

See the **Claude Desktop integration** section below for setup instructions.

## Windows-Specific Skills

OpenClaw Plus includes 7 dedicated Windows skills:

| Skill | Description |
|-------|-------------|
| `windows_powershell` | Execute PowerShell commands (with optional admin elevation) |
| `windows_registry` | Read/write/delete registry keys in HKLM, HKCU, etc. |
| `windows_services` | Manage Windows services (list, start, stop, restart) |
| `windows_winget` | Install/uninstall/search packages via Windows Package Manager |
| `windows_eventlog` | Query Application, System, Security event logs |
| `windows_tasks` | Manage scheduled tasks |
| `windows_network` | Network adapters, DNS, firewall status, connections |

## What this gives you now

- **21 Built-in Skills** for complete system control
- **12 AI Model Providers** (Claude, GPT, Gemini, DeepSeek, Grok, Ollama, etc.)
- **JSON-RPC 2.0 Endpoint** at `/rpc` for standardized API access
- **WebSocket API** for real-time bidirectional communication
- **REST API** for all operations
- **MCP Server Manager** - install and manage MCP servers
- **Skill Generator** - create new skills dynamically
- **Persistent Memory** - knowledge graph for cross-session storage
- Professional web control plane with sessions, run controls, skill toggles
- Autonomous multi-cycle task execution
- Token/JWT auth + per-user tool policies
- Multi-agent routing via `agents` + `bindings`
- Hook system (`server/hooks/*.hook.mjs`) for automation
- Claude Desktop MCP bridge for Claude integration

## Built-in Skills (21)

### Core Skills
| Skill | Description |
|-------|-------------|
| `workspace_files` | List, read, and write files |
| `shell_execute` | Execute shell commands |
| `process_control` | List, start, and stop processes |
| `system_info` | Get CPU, memory, network, OS info |
| `http_client` | Make HTTP requests to any API |
| `web_fetch` | Fetch and convert web content to markdown |
| `time` | Time operations, timezone conversion |
| `memory` | Persistent knowledge graph storage |
| `database` | SQLite database operations |
| `git` | Git repository operations |
| `sequential_thinking` | Step-by-step reasoning |
| `skill_generator` | Create and manage skills dynamically |
| `mcp_manager` | Install and manage MCP servers |
| `claude_code` | Control Claude Code CLI |

### Windows-Specific Skills (7)
| Skill | Description |
|-------|-------------|
| `windows_powershell` | Execute PowerShell commands (with optional admin elevation) |
| `windows_registry` | Read/write/delete registry keys in HKLM, HKCU, etc. |
| `windows_services` | Manage Windows services (list, start, stop, restart) |
| `windows_winget` | Install/uninstall/search packages via Windows Package Manager |
| `windows_eventlog` | Query Application, System, Security event logs |
| `windows_tasks` | Manage scheduled tasks |
| `windows_network` | Network adapters, DNS, firewall status, connections |

## Supported AI Models (12+)

| Provider | Models | Config |
|----------|--------|--------|
| **Anthropic** | Claude Sonnet 4, Opus 4, Haiku 3.5 | `ANTHROPIC_API_KEY` |
| **OpenAI** | GPT-4o, GPT-4o Mini, o1 | `OPENAI_API_KEY` |
| **Google** | Gemini 2.0 Flash, Gemini 2.5 Pro | `GEMINI_API_KEY` |
| **DeepSeek** | R1, V3 | `DEEPSEEK_API_KEY` |
| **XAI** | Grok | `XAI_API_KEY` |
| **Ollama** | Llama, Mistral, etc. | Local (http://localhost:11434) |

## API Endpoints

### REST API
```
GET  /api/health                    - Health check
GET  /api/models                    - List AI models
GET  /api/skills                    - List available skills
GET  /api/hooks                     - List loaded hooks
GET  /api/sessions                  - List sessions
POST /api/sessions                  - Create session
GET  /api/sessions/:id              - Get session with history
POST /api/run                       - Run AI task
POST /api/run/stream                - Run with SSE streaming
POST /api/skills/:id/invoke         - Invoke skill directly
POST /api/inbound/:channel          - Channel gateway
```

### JSON-RPC 2.0 (`/rpc`)
```json
{"jsonrpc": "2.0", "method": "health", "id": 1}
{"jsonrpc": "2.0", "method": "models.list", "id": 2}
{"jsonrpc": "2.0", "method": "skills.list", "id": 3}
{"jsonrpc": "2.0", "method": "skills.invoke", "params": {"skillId": "shell_execute", "input": {"command": "dir"}}, "id": 4}
{"jsonrpc": "2.0", "method": "sessions.list", "id": 5}
{"jsonrpc": "2.0", "method": "run", "params": {"modelId": "claude-sonnet", "objective": "Hello"}, "id": 6}
```

### WebSocket (`ws://localhost:8787/ws`)
```
Send: {"type": "init"}
Send: {"type": "run", "modelId": "...", "objective": "..."}
Events: hello, init, progress, done, error, pong
```

## Game Engine Integration (Unity, Unreal, Godot)

OpenClaw Plus works with any game engine that can make HTTP requests. Client libraries are provided in `clients/`:

| Client | File | Engine |
|--------|------|--------|
| Python | `clients/openclaw_client.py` | Godot (via Python), standalone |
| C# | `clients/OpenClawClient.cs` | Unity, .NET |
| C++ | `clients/OpenClawClient.h` | Unreal Engine |
| GDScript | `clients/openclaw_client.gd` | Godot 4.x |

### Godot 4.x (GDScript)
Copy `clients/openclaw_client.gd` as an autoload:
```gdscript
# In your scene
OpenClaw.set_config("http://localhost:8787", "your-token")

# Get system info
var info = await OpenClaw.get_system_info()
print("CPU cores: ", info.result.cpu.count)

# Execute PowerShell
var result = await OpenClaw.powershell("Get-Process | Select-Object -First 5")

# Run AI task
var response = await OpenClaw.run_task("claude-sonnet", "Generate NPC dialogue")
```

### Python (Godot via Python, standalone)
```python
from openclaw_client import OpenClawClient

client = OpenClawClient("http://localhost:8787", "your-token")

# Get system info
info = client.get_system_info()
print(f"CPU: {info['result']['cpu']['count']} cores")

# Execute PowerShell
result = client.powershell("Get-Process | Select-Object -First 5 Name, CPU")

# Run AI task
response = client.run("claude-sonnet", "Analyze the game performance logs")
```

### Unity (C#)
Copy `clients/OpenClawClient.cs` into your Unity project:
```csharp
var client = new OpenClawClient("http://localhost:8787", "your-token");

// Get system info
var info = await client.GetSystemInfoAsync();
Debug.Log($"Hostname: {info.Hostname}, CPU Cores: {info.CpuCount}");

// Execute shell command
var result = await client.ExecuteShellAsync("dir");
Debug.Log(result.Stdout);

// Run AI task
var response = await client.RunAsync("claude-sonnet", "Generate NPC dialogue");
```

### Unreal Engine (C++)
Copy `clients/OpenClawClient.h` into your Unreal project's Source folder:
```cpp
UOpenClawClient* Client = NewObject<UOpenClawClient>();
Client->Initialize("http://localhost:8787", "your-token");

// Get system info
Client->GetSystemInfo(FOnSystemInfoResponse::CreateLambda([](const FOpenClawSystemInfo& Info) {
    UE_LOG(LogTemp, Log, TEXT("Hostname: %s"), *Info.Hostname);
}));

// Execute shell command
Client->ExecuteShellCommand("dir", FOnShellResponse::CreateLambda([](const FOpenClawShellResult& Result) {
    UE_LOG(LogTemp, Log, TEXT("Output: %s"), *Result.Stdout);
}));
```

### REST API (any engine)
All endpoints are available at `http://localhost:8787/api/`:

```
GET  /api/health                    - Health check
GET  /api/models                    - List AI models
GET  /api/skills                    - List available skills
GET  /api/sessions                  - List sessions
POST /api/sessions                  - Create session
POST /api/run                       - Run AI task
POST /api/run/stream                - Run with SSE streaming
POST /api/skills/{id}/invoke        - Invoke skill directly
POST /api/inbound/{channel}         - Channel gateway
```

Example HTTP request:
```
POST http://localhost:8787/api/skills/shell_execute/invoke
Authorization: Bearer your-token
Content-Type: application/json

{"command": "echo hello"}
```

### WebSocket API (real-time events)

Connect to `ws://localhost:8787/ws` for real-time bidirectional communication:

**Send Messages:**
```json
{"type": "init"}                    // Get models, skills, sessions
{"type": "ping"}                     // Heartbeat
{"type": "run", "modelId": "...", "objective": "..."}  // Run task with progress events
```

**Receive Events:**
- `hello` - Connection established with client ID
- `init` - Initial data (models, skills, sessions)
- `progress` - Real-time run progress (tool calls, cycles)
- `done` - Task completed with answer
- `error` - Error occurred
- `pong` - Heartbeat response

**Python WebSocket Example:**
```python
from openclaw_client import OpenClawClient

client = OpenClawClient("http://localhost:8787", "your-token")

def on_progress(data):
    print(f"Progress: {data}")

def on_done(data):
    print(f"Done: {data['done']}, Answer: {data['answer']}")

client.ws_on("progress", on_progress)
client.ws_on("done", on_done)

if client.ws_connect():
    client.ws_run("claude-sonnet", "List all running processes")
```

**Unity WebSocket Example:**
```csharp
await client.WsConnectAsync();
client.WsOn("progress", data => Debug.Log($"Progress: {data}"));
client.WsOn("done", data => Debug.Log($"Done!"));
await client.WsRunAsync("claude-sonnet", "Analyze system performance");
```

**Godot WebSocket Example:**
```gdscript
OpenClaw.ws_connect()
OpenClaw.ws_progress.connect(func(data): print("Progress: ", data))
OpenClaw.ws_done.connect(func(data): print("Done: ", data))
OpenClaw.ws_run("claude-sonnet", "Generate NPC dialogue")
```

## Quick start

1) Install dependencies

```bash
npm install
```

2) Create config

```bash
copy server\\config.example.json server\\config.json
```

3) Add environment variables in `.env`

```bash
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
OPENCLAW_OWNER_TOKEN=...
OPENCLAW_JWT_SECRET=...
OPENCLAW_INBOUND_TOKEN=...
OPENCLAW_WS_TOKEN=...
OPENCLAW_ALLOW_DANGEROUS_SHELL=false
OPENCLAW_AUTOMATION_ENABLED=false
TELEGRAM_BOT_TOKEN=...
DISCORD_BOT_TOKEN=...
```

`OPENCLAW_ALLOW_DANGEROUS_SHELL` defaults to safe mode and blocks clearly destructive shell commands.

4) Run

```bash
npm run dev
```

Optional validation:

```bash
npm run smoke
npm run smoke:api
```

`npm run smoke:api` checks the live HTTP API at `OPENCLAW_BASE_URL` (defaults to `http://localhost:8787`).

To run the Claude Desktop bridge (MCP stdio server):

```bash
npm run mcp:bridge
```

Then open `http://localhost:8787`.

## Core APIs

- `GET /api/health` server health check
- `GET /api/me` authenticated user info
- `GET /api/models` list available models
- `GET /api/skills` list all skills
- `POST /api/skills/:skillId/invoke` directly invoke a skill
- `GET /api/hooks` list loaded hooks
- `GET /api/sessions` list user sessions
- `POST /api/sessions` create session
- `GET /api/sessions/:sessionId` load full history
- `POST /api/run` run autonomous task (non-streaming)
- `POST /api/run/stream` run autonomous task with SSE events
- `POST /api/inbound/:channel` channel/webhook ingress with routing

## Claude Desktop integration (MCP bridge)

Use `scripts/openclaw-mcp-bridge.mjs` to expose OpenClaw as MCP tools for Claude Desktop.

1) Ensure OpenClaw server is running (`npm run dev`)
2) Copy `server/claude-desktop.mcp.example.json` into your Claude Desktop MCP config and adjust paths/tokens.
3) Restart Claude Desktop.

Bridge env vars:

- `OPENCLAW_BASE_URL` (default `http://127.0.0.1:8787`)
- `OPENCLAW_OWNER_TOKEN` (required unless `OPENCLAW_BRIDGE_REQUIRE_AUTH=false`)
- `OPENCLAW_BRIDGE_REQUIRE_AUTH` (default `true`)
- `OPENCLAW_WORKSPACE_ROOT` (defaults to current directory)

Exposed MCP tools (29 total):

**Server Management:**
- `openclaw_health` - Check server health
- `openclaw_me` - Get authenticated user info
- `openclaw_models` - List available models
- `openclaw_skills` - List all skills with schemas
- `openclaw_hooks` - List loaded hooks
- `openclaw_store_get` - Get session store summary

**Session Management:**
- `openclaw_sessions` - List user sessions
- `openclaw_get_session` - Get full session with history
- `openclaw_create_session` - Create new session

**Autonomous Execution:**
- `openclaw_run` - Run objective (non-streaming)
- `openclaw_run_stream` - Run with SSE streaming
- `openclaw_ws_run` - Run via WebSocket with live events
- `openclaw_inbound` - Send through channel gateway

**Audit & Automation:**
- `openclaw_audit_log` - Read audit log entries
- `openclaw_automation_log` - Read automation log entries

**Shell & Process Control:**
- `openclaw_shell` - Execute shell commands
- `openclaw_process_list` - List running processes
- `openclaw_process_kill` - Kill a process
- `openclaw_process_start` - Start a new process

**System & Files:**
- `openclaw_system_info` - Get CPU, memory, network info
- `openclaw_file_list` - List workspace directory
- `openclaw_file_read` - Read file contents
- `openclaw_file_write` - Write file contents

**Claude Code Control:**
- `openclaw_claude_code_status` - Check CLI availability
- `openclaw_claude_code_run` - Run Claude Code with prompt
- `openclaw_claude_code_continue` - Continue last session
- `openclaw_claude_code_resume` - Resume specific session

**Windows Management (7 tools):**
- `openclaw_win_powershell` - Execute PowerShell commands
- `openclaw_win_registry` - Read/write Windows registry
- `openclaw_win_services` - Manage Windows services
- `openclaw_win_winget` - Package manager (install/uninstall/search)
- `openclaw_win_eventlog` - Query Windows event logs
- `openclaw_win_tasks` - Manage scheduled tasks
- `openclaw_win_network` - Network adapters, DNS, firewall

**Advanced:**
- `openclaw_invoke_skill` - Directly invoke any skill by ID

With this bridge, Claude Desktop can now:
- Run autonomous tasks through OpenClaw's agent loop
- Execute shell commands and PowerShell on your PC
- Manage Windows services, scheduled tasks, and registry
- Install software via Winget
- Query Windows event logs
- Read/write files in your workspace
- Control Claude Code CLI sessions
- Monitor system resources and network
- Trigger automation workflows

## HTTP + WebSocket access

- HTTP APIs are enabled by default.
- WebSocket endpoint is available at `ws://localhost:8787/ws` (or `wss://` behind TLS).
- If `security.wsTokenEnv` is set, connect with `?token=...`.

WebSocket message examples:

```json
{ "type": "init" }
```

```json
{
  "type": "run",
  "modelId": "openai-gpt-4.1-mini",
  "objective": "Plan and execute this feature end-to-end",
  "settings": { "autonomyMode": "continuous", "approvalMode": "never" }
}
```

Server emits `hello`, `init`, `progress`, `done`, `error`, and `pong` events.

Control UI behavior:

- Tries WebSocket first for realtime runs and updates.
- Falls back to HTTP streaming (`/api/run/stream`) if WebSocket is offline.
- You can force transport in UI run settings: `auto`, `ws`, or `http`.

## Live channel adapters

Two adapters are now built-in and can run without extra services:

- Telegram adapter (`grammY`): listens for text messages and routes through the autonomous runtime.
- Discord adapter (`discord.js`): listens for DMs/channel messages and routes through the autonomous runtime.

Enable in `server/config.json`:

```json
{
  "channels": {
    "telegram": {
      "enabled": true,
      "tokenEnv": "TELEGRAM_BOT_TOKEN",
      "modelId": "openai-gpt-4.1-mini",
      "allowFrom": ["*"]
    },
    "discord": {
      "enabled": true,
      "tokenEnv": "DISCORD_BOT_TOKEN",
      "modelId": "openai-gpt-4.1-mini",
      "allowFrom": ["*"]
    }
  }
}
```

`allowFrom` supports user IDs or `"*"`.

## Autonomy and permissions

- Set `approvalMode: "never"` for uninterrupted autonomous execution.
- Set `approvalMode: "manual"` to block tool execution unless an approval service is added.
- Use `allowPatterns` / `denyPatterns` to gate tools per user and team policy.
- Use `security.toolInputPolicies` for argument-level controls (allowed actions, required fields, forbidden input regex patterns).
- Auth modes: `token` (static team tokens) or `jwt` (works with OAuth/OIDC gateways that mint JWTs).
- Configure `security.inboundTokenEnv` to require an inbound bearer token for channel adapters.

Example session run settings:

```json
{
  "maxSteps": 12,
  "maxCycles": 8,
  "autonomyMode": "continuous",
  "approvalMode": "never"
}
```

## Configure models

Edit `server/config.json`:

- `provider`: `openai-compatible` or `anthropic`
- `baseUrl`: required for `openai-compatible`
- `apiKeyEnv`: env var name for secret
- `model`: model id string sent to provider

You can point `openai-compatible` to OpenAI, OpenRouter, vLLM, LiteLLM, Together, etc.

## Add a skill

Create a file in `server/skills`, for example `my-tool.skill.mjs`:

```js
export const skill = {
  id: "my_tool",
  name: "My Tool",
  description: "Does one focused thing.",
  inputSchema: {
    type: "object",
    properties: {
      value: { type: "string" }
    },
    required: ["value"],
    additionalProperties: false
  },
  async run({ input }) {
    return { ok: true, echoed: input.value };
  }
};
```

The skill is auto-loaded at server start.

## MCP integration

Configure servers in `server/config.json` under `mcpServers`. Example:

```json
{
  "id": "filesystem",
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
}
```

At startup, MCP tools are discovered and merged with local tools in the UI and agent loop.

## Multi-agent routing

Use `agents.list` and `bindings` in `server/config.json` to route messages by `channel`, `accountId`, and `peer` to isolated agents.

Example inbound payload:

```json
{
  "modelId": "openai-gpt-4.1-mini",
  "objective": "Handle this support ticket end to end.",
  "accountId": "default",
  "peer": { "kind": "direct", "id": "+15551230001" },
  "settings": { "approvalMode": "never", "autonomyMode": "continuous" }
}
```

## Hooks

Drop `*.hook.mjs` files in `server/hooks`:

- `events`: list of event names
- `run(event)`: async handler

Built-in starter hook: `server/hooks/audit-log.hook.mjs`.

Automation supervisor hook: `server/hooks/automation-supervisor.hook.mjs`.

- Enable with `automation.enabled=true` in `server/config.json` or `OPENCLAW_AUTOMATION_ENABLED=true`.
- Define approved workflows in `server/automation-rules.json` (start from `server/automation-rules.example.json`).
- Rule commands execute locally and write results to `data/automation/events.log`.

## Parity snapshot (OpenClaw-style)

- Channel gateway ingress: implemented via `/api/inbound/:channel` with secure token option.
- Multi-agent routing + isolated sessions: implemented via `agents`, `bindings`, and `routeKey` session partitioning.
- Tool ecosystem (local + MCP): implemented and unified in one registry.
- Model failover: implemented (`fallbacks` + failover conditions).
- Web control plane: implemented (sessions, streaming, autonomy controls, traces).
- Security baseline: implemented (JWT/token auth, policy gates, CSP/headers, rate limiting, audit hooks).

## Framework compatibility notes

- **LangChain / CrewAI / StrandsAgents**: connect these via MCP servers or OpenAI-compatible gateways and they become usable through the same tool/model abstraction.
- **Langfuse**: wire tracing by adding a telemetry sink around `onEvent` emissions from `/api/run/stream` and `runAutonomousTask` events.
- **OAuth providers**: run behind an OAuth/OIDC broker that issues JWTs, then set `auth.mode="jwt"` and validate with `OPENCLAW_JWT_SECRET`.
- **Any provider subscription**: if it supports OpenAI-compatible APIs, add a model entry and it works without frontend changes.
