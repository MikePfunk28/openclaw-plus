import { exec, spawn } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export const skill = {
  id: "process_control",
  name: "Process Control",
  description: "List, start, and stop processes on the local system.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "kill", "start"],
        description: "Action to perform"
      },
      target: {
        type: "string",
        description: "Process name/ID for kill, or command to start"
      },
      signal: {
        type: "string",
        description: "Signal to send (default: SIGTERM)",
        default: "SIGTERM"
      }
    },
    required: ["action"],
    additionalProperties: false
  },
  async run({ input }) {
    const action = input?.action;
    const target = input?.target;

    if (action === "list") {
      const isWindows = process.platform === "win32";
      
      if (isWindows) {
        const { stdout } = await execAsync('tasklist /FO CSV /NH', { encoding: "utf8" });
        const processes = stdout.trim().split("\n")
          .filter(Boolean)
          .slice(0, 50)
          .map(line => {
            const parts = line.split('","').map(p => p.replace(/"/g, ""));
            return {
              name: parts[0],
              pid: parseInt(parts[1], 10),
              mem: parts[4]
            };
          });
        return { action: "list", count: processes.length, processes };
      } else {
        const { stdout } = await execAsync("ps aux | head -50", { encoding: "utf8" });
        const lines = stdout.trim().split("\n").slice(1);
        const processes = lines.map(line => {
          const parts = line.trim().split(/\s+/);
          return {
            user: parts[0],
            pid: parseInt(parts[1], 10),
            cpu: parts[2],
            mem: parts[3],
            command: parts.slice(10).join(" ")
          };
        });
        return { action: "list", count: processes.length, processes };
      }
    }

    if (action === "kill") {
      if (!target) {
        throw new Error("target (PID or process name) is required for kill");
      }

      const isWindows = process.platform === "win32";
      let pid = target;

      if (isWindows && !/^\d+$/.test(target)) {
        const { stdout } = await execAsync(`tasklist /FI "IMAGENAME eq ${target}" /FO CSV /NH`, { encoding: "utf8" });
        const match = stdout.match(/"(\d+)"/);
        if (match) {
          pid = match[1];
        } else {
          return { action: "kill", ok: false, error: `Process "${target}" not found` };
        }
      }

      const signal = input?.signal || "SIGTERM";
      if (String(pid) === String(process.pid)) {
        return { action: "kill", ok: false, error: "Refusing to kill current server process" };
      }
      
      try {
        if (isWindows) {
          await execAsync(`taskkill /PID ${pid} /F`);
        } else {
          await execAsync(`kill -${signal} ${pid}`);
        }
        return { action: "kill", ok: true, pid };
      } catch (err) {
        return { action: "kill", ok: false, error: err.message, pid };
      }
    }

    if (action === "start") {
      if (!target) {
        throw new Error("target (command) is required for start");
      }

      const isWindows = process.platform === "win32";
      const shell = isWindows ? "cmd.exe" : "/bin/sh";
      const shellFlag = isWindows ? "/c" : "-c";

      const child = spawn(shell, [shellFlag, target], {
        detached: !isWindows,
        stdio: "ignore",
        windowsHide: true
      });

      if (!isWindows) {
        child.unref();
      }

      return {
        action: "start",
        ok: true,
        pid: child.pid,
        command: target
      };
    }

    throw new Error(`Unsupported action: ${action}`);
  }
};
