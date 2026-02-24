import { spawn } from "node:child_process";

export const skill = {
  id: "windows_powershell",
  name: "Windows PowerShell",
  description: "Execute PowerShell commands on Windows. Provides full access to Windows system administration.",
  inputSchema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "PowerShell command or script to execute"
      },
      elevated: {
        type: "boolean",
        description: "Run with administrator privileges (requires UAC consent)",
        default: false
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
    if (process.platform !== "win32") {
      return {
        ok: false,
        error: "This skill only works on Windows",
        platform: process.platform
      };
    }

    const command = input?.command;
    if (!command) {
      throw new Error("command is required");
    }

    const timeout = input?.timeout || 60000;
    const elevated = input?.elevated || false;

    return new Promise((resolve) => {
      const startTime = Date.now();
      let stdout = "";
      let stderr = "";

      const args = elevated
        ? ["-WindowStyle", "Hidden", "-Command", `Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -Command "${command.replace(/"/g, '\\"')}"' -Wait`]
        : ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command];

      const child = spawn("powershell.exe", args, {
        windowsHide: true,
        env: process.env
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
          ok: code === 0,
          exitCode: code,
          stdout: stdout.slice(-100000),
          stderr: stderr.slice(-10000),
          duration,
          elevated
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
