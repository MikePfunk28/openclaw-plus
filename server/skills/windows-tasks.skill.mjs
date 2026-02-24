import { spawn } from "node:child_process";

export const skill = {
  id: "windows_tasks",
  name: "Windows Scheduled Tasks",
  description: "List, run, enable, disable, and query Windows scheduled tasks.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "get", "run", "end", "enable", "disable", "create", "delete"],
        description: "Task action to perform"
      },
      path: {
        type: "string",
        description: "Task path (e.g., '\\MyTasks\\MyTask')"
      },
      filter: {
        type: "string",
        description: "Filter for list (e.g., 'state eq running')"
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
    const path = input?.path;
    const filter = input?.filter;

    const execSchtasks = (args, timeoutMs = 60000) => {
      return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        
        const child = spawn("schtasks.exe", args, {
          windowsHide: true,
          env: process.env
        });

        const timeoutId = setTimeout(() => {
          child.kill("SIGTERM");
          resolve({ exitCode: -1, stdout, stderr, timedOut: true });
        }, timeoutMs);
        
        child.stdout?.on("data", (data) => { stdout += data.toString(); });
        child.stderr?.on("data", (data) => { stderr += data.toString(); });
        
        child.on("close", (code) => {
          clearTimeout(timeoutId);
          resolve({ exitCode: code, stdout, stderr });
        });
        
        child.on("error", (err) => {
          clearTimeout(timeoutId);
          resolve({ exitCode: -1, stdout: "", stderr: err.message });
        });
      });
    };

    const parseTaskList = (output) => {
      const lines = output.split("\n").filter(l => l.trim());
      const tasks = [];
      let headerFound = false;
      
      for (const line of lines) {
        if (line.includes("TaskName") || line.includes("Folder")) {
          headerFound = true;
          continue;
        }
        
        if (!headerFound) continue;
        if (line.includes("=======") || line.includes("------")) continue;
        
        const parts = line.trim().split(/\s{2,}/);
        if (parts.length >= 2) {
          const taskPath = parts[0];
          const nextRun = parts[1] || "N/A";
          const status = parts[2] || "";
          
          if (taskPath.startsWith("\\")) {
            tasks.push({
              path: taskPath,
              nextRun: nextRun === "N/A" ? null : nextRun,
              status: status || "Ready"
            });
          }
        }
      }
      return tasks;
    };

    const parseTaskQuery = (output) => {
      const result = {};
      const lines = output.split("\n");
      
      let currentHeader = null;
      let currentItem = {};
      
      for (const line of lines) {
        const colonIdx = line.indexOf(":");
        if (colonIdx > 0) {
          const key = line.slice(0, colonIdx).trim();
          const value = line.slice(colonIdx + 1).trim();
          
          if (key === "TaskName") {
            if (currentHeader) {
              result[currentHeader] = currentItem;
            }
            currentHeader = value;
            currentItem = {};
          } else {
            currentItem[key] = value;
          }
        }
      }
      
      if (currentHeader) {
        result[currentHeader] = currentItem;
      }
      
      return result;
    };

    switch (action) {
      case "list": {
        const args = ["/Query", "/FO", "LIST", "/V"];
        if (filter) args.push("/FI", filter);
        
        const result = await execSchtasks(args);
        
        if (result.exitCode !== 0) {
          return { ok: false, action: "list", error: result.stderr };
        }
        
        const tasks = parseTaskQuery(result.stdout);
        const taskList = Object.entries(tasks).map(([name, info]) => ({
          path: name,
          status: info["Status"] || info["Current Status"] || "Unknown",
          nextRun: info["Next Run Time"] || null,
          lastRun: info["Last Run Time"] || null,
          lastResult: info["Last Result"] || "",
          author: info["Author"] || "",
          command: info["Task To Run"] || ""
        }));
        
        return {
          ok: true,
          action: "list",
          count: taskList.length,
          tasks: taskList.slice(0, 50)
        };
      }

      case "get": {
        if (!path) throw new Error("path is required for get action");
        
        const result = await execSchtasks(["/Query", "/TN", path, "/FO", "LIST", "/V"]);
        
        if (result.exitCode !== 0) {
          return { ok: false, action: "get", path, error: result.stderr || "Task not found" };
        }
        
        const tasks = parseTaskQuery(result.stdout);
        const taskName = Object.keys(tasks)[0];
        const info = tasks[taskName] || {};
        
        return {
          ok: true,
          action: "get",
          path,
          task: {
            name: taskName,
            status: info["Status"] || info["Current Status"] || "Unknown",
            nextRun: info["Next Run Time"] || null,
            lastRun: info["Last Run Time"] || null,
            lastResult: info["Last Result"] || "",
            author: info["Author"] || "",
            command: info["Task To Run"] || "",
            arguments: info["Start In"] || "",
            schedule: info["Schedule Type"] || "",
            raw: info
          }
        };
      }

      case "run": {
        if (!path) throw new Error("path is required for run action");
        
        const result = await execSchtasks(["/Run", "/TN", path]);
        return {
          ok: result.exitCode === 0,
          action: "run",
          path,
          message: result.exitCode === 0 ? "Task started successfully" : result.stderr
        };
      }

      case "end": {
        if (!path) throw new Error("path is required for end action");
        
        const result = await execSchtasks(["/End", "/TN", path]);
        return {
          ok: result.exitCode === 0,
          action: "end",
          path,
          message: result.exitCode === 0 ? "Task stopped successfully" : result.stderr
        };
      }

      case "enable": {
        if (!path) throw new Error("path is required for enable action");
        
        const result = await execSchtasks(["/Change", "/TN", path, "/ENABLE"]);
        return {
          ok: result.exitCode === 0,
          action: "enable",
          path,
          message: result.exitCode === 0 ? "Task enabled" : result.stderr
        };
      }

      case "disable": {
        if (!path) throw new Error("path is required for disable action");
        
        const result = await execSchtasks(["/Change", "/TN", path, "/DISABLE"]);
        return {
          ok: result.exitCode === 0,
          action: "disable",
          path,
          message: result.exitCode === 0 ? "Task disabled" : result.stderr
        };
      }

      case "delete": {
        if (!path) throw new Error("path is required for delete action");
        
        const result = await execSchtasks(["/Delete", "/TN", path, "/F"]);
        return {
          ok: result.exitCode === 0,
          action: "delete",
          path,
          message: result.exitCode === 0 ? "Task deleted" : result.stderr
        };
      }

      case "create": {
        if (!path) throw new Error("path is required for create action");
        return {
          ok: false,
          action: "create",
          path,
          error: "Task creation requires additional parameters. Use PowerShell skill with Register-ScheduledTask for full control."
        };
      }

      default:
        throw new Error(`Unsupported action: ${action}`);
    }
  }
};
