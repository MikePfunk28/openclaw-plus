import { spawn } from "node:child_process";

export const skill = {
  id: "windows_eventlog",
  name: "Windows Event Log",
  description: "Read and query Windows Event Logs (Application, System, Security, etc.).",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list-logs", "read", "query"],
        description: "Event log action to perform"
      },
      log: {
        type: "string",
        description: "Event log name (e.g., 'Application', 'System', 'Security')",
        default: "Application"
      },
      level: {
        type: "string",
        enum: ["Critical", "Error", "Warning", "Information", "All"],
        description: "Event level filter",
        default: "All"
      },
      count: {
        type: "number",
        description: "Maximum number of events to return (default: 20)",
        default: 20
      },
      startTime: {
        type: "string",
        description: "Start time filter (PowerShell datetime format)"
      },
      endTime: {
        type: "string",
        description: "End time filter (PowerShell datetime format)"
      },
      eventId: {
        type: "number",
        description: "Filter by specific event ID"
      },
      query: {
        type: "string",
        description: "Custom XPath query for events"
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
    const log = input?.log || "Application";
    const level = input?.level || "All";
    const count = input?.count || 20;
    const startTime = input?.startTime;
    const endTime = input?.endTime;
    const eventId = input?.eventId;
    const customQuery = input?.query;

    const execPowerShell = (script, timeoutMs = 30000) => {
      return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        
        const child = spawn("powershell.exe", [
          "-NoProfile",
          "-ExecutionPolicy", "Bypass",
          "-Command", script
        ], { windowsHide: true });

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

    switch (action) {
      case "list-logs": {
        const script = `
          Get-WinEvent -ListLog * | 
          Where-Object { $_.RecordCount -gt 0 } | 
          Select-Object -First 50 LogName, RecordCount, IsEnabled, FileSize |
          ConvertTo-Json -Compress
        `;
        
        const result = await execPowerShell(script);
        
        if (result.exitCode !== 0) {
          return { ok: false, action: "list-logs", error: result.stderr };
        }
        
        let logs = [];
        try {
          logs = JSON.parse(result.stdout);
          if (!Array.isArray(logs)) logs = [logs];
        } catch {}
        
        return {
          ok: true,
          action: "list-logs",
          count: logs.length,
          logs: logs.map(l => ({
            name: l.LogName,
            recordCount: l.RecordCount,
            enabled: l.IsEnabled,
            sizeBytes: l.FileSize
          }))
        };
      }

      case "read":
      case "query": {
        let filterScript = "";
        const filters = [];
        
        if (level !== "All") {
          filters.push(`LevelDisplayName -eq '${level}'`);
        }
        
        if (eventId) {
          filters.push(`Id -eq ${eventId}`);
        }
        
        if (startTime) {
          filters.push(`TimeCreated -ge ${startTime}`);
        }
        
        if (endTime) {
          filters.push(`TimeCreated -le ${endTime}`);
        }
        
        const whereClause = filters.length > 0 
          ? `| Where-Object { ${filters.join(" -and ")} }` 
          : "";
        
        let script;
        if (customQuery) {
          script = `
            Get-WinEvent -FilterXml "${customQuery}" -MaxEvents ${count} 2>$null |
            Select-Object TimeCreated, Id, LevelDisplayName, Message, ProviderName |
            ConvertTo-Json -Depth 2 -Compress
          `;
        } else {
          script = `
            try {
              Get-WinEvent -LogName '${log}' -MaxEvents ${Math.min(count, 100)} 2>$null |
              ${whereClause}
              Select-Object TimeCreated, Id, LevelDisplayName, Message, ProviderName |
              ConvertTo-Json -Depth 2 -Compress
            } catch {
              Write-Output '[]'
            }
          `;
        }
        
        const result = await execPowerShell(script);
        
        if (result.exitCode !== 0 && !result.stdout) {
          return { ok: false, action, log, error: result.stderr };
        }
        
        let events = [];
        try {
          events = JSON.parse(result.stdout || "[]");
          if (!Array.isArray(events)) events = [events];
        } catch {}
        
        return {
          ok: true,
          action,
          log,
          count: events.length,
          events: events.slice(0, count).map(e => ({
            time: e.TimeCreated,
            eventId: e.Id,
            level: e.LevelDisplayName,
            provider: e.ProviderName,
            message: (e.Message || "").slice(0, 1000)
          }))
        };
      }

      default:
        throw new Error(`Unsupported action: ${action}`);
    }
  }
};
