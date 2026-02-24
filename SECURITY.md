# OpenClaw Plus v1.0.0 - Security & Architecture Improvements

## Security Improvements Made

### 1. Input Validation & Sanitization
- **Dangerous Command Blocking**: Shell commands are filtered against dangerous patterns (shutdown, format, diskpart, rm -rf /)
- **Input Schema Validation**: All skills use JSON Schema with `additionalProperties: false` to prevent injection
- **Registry Path Restrictions**: Windows registry skill blocks critical system paths

### 2. Authentication & Authorization
- **Token-based Auth**: JWT tokens with configurable secrets
- **Per-user Tool Policies**: Allow/deny patterns per user
- **Input-level Policies**: Regex patterns to block dangerous inputs per-skill
- **Role-based Access**: Admin, member roles with different capabilities

### 3. Network Security
- **CORS Allowlist**: Only specified origins allowed
- **Rate Limiting**: 120 requests/minute per IP
- **Security Headers**: CSP, XSS protection, content-type options
- **WebSocket Token Auth**: Optional token required for WS connections

### 4. Execution Safety
- **Timeout Protection**: All shell/process commands have timeouts
- **Process Isolation**: Commands run with windowsHide, no interactive prompts
- **Sandbox Awareness**: Configurable dangerous command override

### 5. Audit & Logging
- **Hook System**: All events logged via audit-log.hook.mjs
- **Automation Logging**: Automated workflows logged to data/automation/events.log

## What Was Added

### Skills (21 total)
- Core: shell, process, files, http, web_fetch, time, memory, database, git, skill_generator, mcp_manager
- Windows: powershell, registry, services, winget, eventlog, tasks, network
- AI: claude_code, sequential_thinking

### APIs (3 protocols)
- REST: /api/* endpoints
- JSON-RPC 2.0: /rpc endpoint
- WebSocket: /ws for real-time

### Models (12 providers)
- Anthropic, OpenAI, Google, DeepSeek, XAI, Ollama, etc.
