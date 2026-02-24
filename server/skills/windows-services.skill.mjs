import { spawn } from "node:child_process";

export const skill = {
  id: "windows_services",
  name: "Windows Services",
  description: "List, start, stop, restart, and query Windows services.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "get", "start", "stop", "restart", "pause", "continue", "config"],
        description: "Service action to perform"
      },
      name: {
        type: "string",
        description: "Service name (for get/start/stop/restart/pause/continue/config)"
      },
      filter: {
        type: "string",
        description: "Filter for list action (e.g., 'state=running')"
      }
    },
    required: ["action"],
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

    const action = input?.action;
    const name = input?.name;
    const filter = input?.filter;

    const execSc = (args) => {
      return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        
        const child = spawn("sc.exe", args, { windowsHide: true });
        
        child.stdout?.on("data", (data) => { stdout += data.toString(); });
        child.stderr?.on("data", (data) => { stderr += data.toString(); });
        
        child.on("close", (code) => {
          resolve({ exitCode: code, stdout, stderr });
        });
        
        child.on("error", (err) => {
          resolve({ exitCode: -1, stdout: "", stderr: err.message });
        });
      });
    };

    const parseServiceQuery = (output) => {
      const result = {};
      const lines = output.split("\n");
      
      for (const line of lines) {
        const colonIdx = line.indexOf(":");
        if (colonIdx > 0) {
          const key = line.slice(0, colonIdx).trim();
          const value = line.slice(colonIdx + 1).trim();
          result[key] = value;
        }
      }
      return result;
    };

    switch (action) {
      case "list": {
        const filterArg = filter ? [filter] : [];
        const result = await execSc(["query", ...filterArg, "type=", "service"]);
        
        if (result.exitCode !== 0) {
          return { ok: false, action: "list", error: result.stderr };
        }
        
        const services = [];
        const blocks = result.stdout.split(/\n\s*\n/);
        
        for (const block of blocks) {
          const nameMatch = block.match(/SERVICE_NAME:\s*(.+)/);
          const dispMatch = block.match(/DISPLAY_NAME:\s*(.+)/);
          const stateMatch = block.match(/STATE\s*:\s*\d+\s*(\w+)/);
          
          if (nameMatch) {
            services.push({
              name: nameMatch[1].trim(),
              displayName: dispMatch?.[1]?.trim() || "",
              state: stateMatch?.[1] || "UNKNOWN"
            });
          }
        }
        
        return {
          ok: true,
          action: "list",
          count: services.length,
          services: services.slice(0, 100)
        };
      }

      case "get": {
        if (!name) {
          throw new Error("name is required for get action");
        }
        
        const result = await execSc(["query", name]);
        
        if (result.exitCode !== 0) {
          return { ok: false, action: "get", name, error: result.stderr || "Service not found" };
        }
        
        const info = parseServiceQuery(result.stdout);
        const stateMatch = result.stdout.match(/STATE\s*:\s*(\d+)\s*(\w+)/);
        
        return {
          ok: true,
          action: "get",
          name,
          displayName: info["DISPLAY_NAME"] || "",
          state: stateMatch?.[2] || info["STATE"] || "UNKNOWN",
          stateCode: stateMatch?.[1] || "",
          canStop: result.stdout.includes("STOPPABLE"),
          canPause: result.stdout.includes("PAUSABLE"),
          raw: info
        };
      }

      case "start": {
        if (!name) throw new Error("name is required for start action");
        const result = await execSc(["start", name]);
        return {
          ok: result.exitCode === 0,
          action: "start",
          name,
          message: result.exitCode === 0 ? "Service start request sent" : result.stderr
        };
      }

      case "stop": {
        if (!name) throw new Error("name is required for stop action");
        const result = await execSc(["stop", name]);
        return {
          ok: result.exitCode === 0,
          action: "stop",
          name,
          message: result.exitCode === 0 ? "Service stop request sent" : result.stderr
        };
      }

      case "restart": {
        if (!name) throw new Error("name is required for restart action");
        
        const stopResult = await execSc(["stop", name]);
        if (stopResult.exitCode !== 0 && !stopResult.stdout.includes("not started")) {
          return { ok: false, action: "restart", name, error: stopResult.stderr, phase: "stop" };
        }
        
        await new Promise(r => setTimeout(r, 1000));
        
        const startResult = await execSc(["start", name]);
        return {
          ok: startResult.exitCode === 0,
          action: "restart",
          name,
          message: startResult.exitCode === 0 ? "Service restarted" : startResult.stderr
        };
      }

      case "pause": {
        if (!name) throw new Error("name is required for pause action");
        const result = await execSc(["pause", name]);
        return {
          ok: result.exitCode === 0,
          action: "pause",
          name,
          message: result.exitCode === 0 ? "Service pause request sent" : result.stderr
        };
      }

      case "continue": {
        if (!name) throw new Error("name is required for continue action");
        const result = await execSc(["continue", name]);
        return {
          ok: result.exitCode === 0,
          action: "continue",
          name,
          message: result.exitCode === 0 ? "Service continue request sent" : result.stderr
        };
      }

      case "config": {
        if (!name) throw new Error("name is required for config action");
        const result = await execSc(["qc", name]);
        
        if (result.exitCode !== 0) {
          return { ok: false, action: "config", name, error: result.stderr || "Service not found" };
        }
        
        const config = parseServiceQuery(result.stdout);
        return {
          ok: true,
          action: "config",
          name,
          config: {
            displayName: config["DISPLAY_NAME"] || "",
            type: config["TYPE"] || "",
            startType: config["START_TYPE"] || "",
            errorControl: config["ERROR_CONTROL"] || "",
            binaryPath: config["BINARY_PATH_NAME"] || "",
            username: config["SERVICE_START_NAME"] || "",
            raw: config
          }
        };
      }

      default:
        throw new Error(`Unsupported action: ${action}`);
    }
  }
};
