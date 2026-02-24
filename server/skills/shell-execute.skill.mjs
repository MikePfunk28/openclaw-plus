import { spawn } from "node:child_process";

const DANGEROUS_PATTERNS = [
  /(^|\s)rm\s+-rf\s+\//i,
  /(^|\s)del\s+\/f\s+\/s\s+\/q/i,
  /(^|\s)format\s+[a-z]:/i,
  /(^|\s)powershell\b.*\b-enc(odedcommand)?\b/i,
  /(^|\s)shutdown\b/i,
  /(^|\s)reboot\b/i,
  /(^|\s)cipher\s+\/w:/i,
  /(^|\s)diskpart\b/i,
  /(^|\s)bcdedit\b.*\/delete/i
];

function isDangerousCommand(command) {
  return DANGEROUS_PATTERNS.some((pattern) => pattern.test(command));
}

export const skill = {
  id: "shell_execute",
  name: "Shell Execute",
  description: "Execute shell commands on the local system. Use for running programs, scripts, system operations.",
  inputSchema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "Shell command to execute"
      },
      cwd: {
        type: "string",
        description: "Working directory for the command"
      },
      timeout: {
        type: "number",
        description: "Timeout in milliseconds (default: 60000)",
        default: 60000
      }
    },
    required: ["command"],
    additionalProperties: false
  },
  async run({ input }) {
    const command = input?.command;
    if (!command) {
      throw new Error("command is required");
    }

    const cwd = input?.cwd || process.cwd();
    const timeout = input?.timeout || 60000;
    const allowDangerous = String(process.env.OPENCLAW_ALLOW_DANGEROUS_SHELL || "").toLowerCase() === "true";

    if (!allowDangerous && isDangerousCommand(command)) {
      return {
        ok: false,
        blocked: true,
        error: "Command blocked by safety policy. Set OPENCLAW_ALLOW_DANGEROUS_SHELL=true to override."
      };
    }

    return new Promise((resolve) => {
      const startTime = Date.now();
      
      let stdout = "";
      let stderr = "";
      
      const isWindows = process.platform === "win32";
      const shell = isWindows ? "cmd.exe" : "/bin/sh";
      const shellFlag = isWindows ? "/c" : "-c";

      const child = spawn(shell, [shellFlag, command], {
        cwd,
        env: process.env,
        windowsHide: true
      });

      const timeoutId = setTimeout(() => {
        child.kill("SIGTERM");
        resolve({
          ok: false,
          error: `Command timed out after ${timeout}ms`,
          stdout,
          stderr,
          timedOut: true
        });
      }, timeout);

      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;
        
        resolve({
          ok: true,
          exitCode: code,
          stdout: stdout.slice(-100000),
          stderr: stderr.slice(-10000),
          duration
        });
      });

      child.on("error", (err) => {
        clearTimeout(timeoutId);
        resolve({
          ok: false,
          error: err.message,
          stdout,
          stderr
        });
      });
    });
  }
};
