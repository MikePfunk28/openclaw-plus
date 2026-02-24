import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

export const skill = {
  id: "claude_code",
  name: "Claude Code Control",
  description: "Control Claude Code CLI - run prompts, list sessions, resume sessions.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["run", "list-sessions", "resume", "continue", "status"],
        description: "Action to perform"
      },
      prompt: {
        type: "string",
        description: "Prompt to send to Claude (for run action)"
      },
      sessionId: {
        type: "string",
        description: "Session ID to resume"
      },
      cwd: {
        type: "string",
        description: "Working directory for Claude to run in"
      },
      model: {
        type: "string",
        description: "Model to use (e.g., 'sonnet', 'opus')"
      },
      timeout: {
        type: "number",
        description: "Timeout in milliseconds (default: 120000)",
        default: 120000
      },
      allowedTools: {
        type: "string",
        description: "Comma-separated list of allowed tools"
      },
      dangerousSkipPermissions: {
        type: "boolean",
        description: "Skip permission checks (dangerous)",
        default: false
      }
    },
    required: ["action"],
    additionalProperties: false
  },
  async run({ input }) {
    const action = input?.action;

    if (action === "status") {
      return {
        action: "status",
        claudeAvailable: true,
        version: await this.getClaudeVersion(),
        platform: process.platform,
        nodeVersion: process.version
      };
    }

    if (action === "list-sessions") {
      const { stdout } = await this.execCommand("claude", ["sessions", "list", "--json"], {}, 10000);
      try {
        const sessions = JSON.parse(stdout || "[]");
        return { action: "list-sessions", sessions: sessions.slice(0, 20) };
      } catch {
        return { action: "list-sessions", raw: stdout.slice(0, 2000) };
      }
    }

    const cwd = input?.cwd || process.cwd();
    if (!existsSync(cwd)) {
      throw new Error(`Working directory does not exist: ${cwd}`);
    }

    if (action === "run") {
      const prompt = input?.prompt;
      if (!prompt) {
        throw new Error("prompt is required for run action");
      }

      const args = ["-p", "--output-format", "json", "--no-session-persistence"];
      
      if (input?.model) {
        args.push("--model", input.model);
      }
      
      if (input?.allowedTools) {
        args.push("--allowed-tools", input.allowedTools);
      }
      
      if (input?.dangerousSkipPermissions) {
        args.push("--dangerously-skip-permissions");
      }

      args.push("--add-dir", cwd);
      args.push(prompt);

      const result = await this.execCommand("claude", args, { cwd }, input?.timeout || 120000);
      
      try {
        const jsonOutput = result.stdout.split("\n")
          .filter(line => line.trim())
          .map(line => {
            try { return JSON.parse(line); } catch { return null; }
          })
          .filter(Boolean);
        
        const lastJson = jsonOutput[jsonOutput.length - 1];
        if (lastJson?.type === "result" || lastJson?.content) {
          return {
            action: "run",
            ok: true,
            response: lastJson.content || lastJson,
            tokens: lastJson.tokens
          };
        }
      } catch {}

      return {
        action: "run",
        ok: result.exitCode === 0 && !result.timedOut,
        stdout: result.stdout.slice(-50000),
        stderr: result.stderr.slice(-5000),
        exitCode: result.exitCode,
        timedOut: Boolean(result.timedOut),
        error: result.error || null
      };
    }

    if (action === "resume") {
      const sessionId = input?.sessionId;
      if (!sessionId) {
        throw new Error("sessionId is required for resume action");
      }

      const args = ["-r", sessionId, "--add-dir", cwd];
      
      if (input?.model) {
        args.push("--model", input.model);
      }

      const result = await this.execCommand("claude", args, { cwd }, input?.timeout || 120000);
      
      return {
        action: "resume",
        ok: result.exitCode === 0 && !result.timedOut,
        stdout: result.stdout.slice(-50000),
        stderr: result.stderr.slice(-5000),
        exitCode: result.exitCode,
        timedOut: Boolean(result.timedOut),
        error: result.error || null
      };
    }

    if (action === "continue") {
      const args = ["-c", "--add-dir", cwd];
      
      if (input?.model) {
        args.push("--model", input.model);
      }

      const result = await this.execCommand("claude", args, { cwd }, input?.timeout || 120000);
      
      return {
        action: "continue",
        ok: result.exitCode === 0 && !result.timedOut,
        stdout: result.stdout.slice(-50000),
        stderr: result.stderr.slice(-5000),
        exitCode: result.exitCode,
        timedOut: Boolean(result.timedOut),
        error: result.error || null
      };
    }

    throw new Error(`Unsupported action: ${action}`);
  },

  async getClaudeVersion() {
    try {
      const { stdout } = await this.execCommand("claude", ["--version"], {}, 5000);
      return stdout.trim();
    } catch {
      return null;
    }
  },

  execCommand(command, args, options, timeout) {
    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      
      const child = spawn(command, args, {
        ...options,
        env: { ...process.env },
        shell: true,
        windowsHide: true
      });

      const timeoutId = setTimeout(() => {
        child.kill("SIGTERM");
        resolve({ stdout, stderr, exitCode: -1, timedOut: true });
      }, timeout);

      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        clearTimeout(timeoutId);
        resolve({ stdout, stderr, exitCode: code });
      });

      child.on("error", (err) => {
        clearTimeout(timeoutId);
        resolve({ stdout, stderr, exitCode: -1, error: err.message });
      });
    });
  }
};
