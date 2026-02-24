import { spawn } from "node:child_process";

export const skill = {
  id: "windows_registry",
  name: "Windows Registry",
  description: "Read, write, and delete Windows registry keys and values.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["read", "write", "delete", "list"],
        description: "Registry action to perform"
      },
      hive: {
        type: "string",
        enum: ["HKLM", "HKCU", "HKCR", "HKU", "HKCC"],
        description: "Registry hive (HKLM=Local Machine, HKCU=Current User, etc.)",
        default: "HKCU"
      },
      path: {
        type: "string",
        description: "Registry key path (e.g., 'Software\\MyApp')"
      },
      name: {
        type: "string",
        description: "Value name (for read/write/delete)"
      },
      value: {
        type: "string",
        description: "Value data (for write)"
      },
      type: {
        type: "string",
        enum: ["REG_SZ", "REG_DWORD", "REG_QWORD", "REG_EXPAND_SZ", "REG_MULTI_SZ", "REG_BINARY"],
        description: "Value type (for write, default: REG_SZ)",
        default: "REG_SZ"
      }
    },
    required: ["action", "path"],
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
    const hive = input?.hive || "HKCU";
    const path = input?.path;
    const name = input?.name;
    const value = input?.value;
    const type = input?.type || "REG_SZ";

    if (!action || !path) {
      throw new Error("action and path are required");
    }

    const fullPath = `${hive}\\${path}`;

    const execReg = (args) => {
      return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        
        const child = spawn("reg.exe", args, { windowsHide: true });
        
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

    const parseRegOutput = (output) => {
      const lines = output.split("\n").map(l => l.trim()).filter(Boolean);
      const result = {};
      
      for (const line of lines) {
        const match = line.match(/^\s*(\S+)\s+(REG_\S+)\s+(.+)$/);
        if (match) {
          result[match[1]] = {
            type: match[2],
            value: match[3]
          };
        }
      }
      return result;
    };

    switch (action) {
      case "list": {
        const result = await execReg(["query", fullPath]);
        if (result.exitCode !== 0) {
          return { ok: false, action: "list", path: fullPath, error: result.stderr || "Failed to list registry key" };
        }
        
        const values = parseRegOutput(result.stdout);
        const subkeys = result.stdout
          .split("\n")
          .filter(l => l.includes(fullPath) && l.trim() !== fullPath)
          .map(l => l.trim().replace(fullPath + "\\", "").split("\\")[0])
          .filter((v, i, a) => v && a.indexOf(v) === i);
        
        return {
          ok: true,
          action: "list",
          path: fullPath,
          values,
          subkeys
        };
      }

      case "read": {
        if (!name) {
          const result = await execReg(["query", fullPath]);
          if (result.exitCode !== 0) {
            return { ok: false, action: "read", path: fullPath, error: result.stderr || "Failed to read registry key" };
          }
          return {
            ok: true,
            action: "read",
            path: fullPath,
            values: parseRegOutput(result.stdout)
          };
        }
        
        const result = await execReg(["query", fullPath, "/v", name]);
        if (result.exitCode !== 0) {
          return { ok: false, action: "read", path: fullPath, name, error: result.stderr || "Value not found" };
        }
        
        const match = result.stdout.match(new RegExp(`\\s+${name}\\s+(REG_\\S+)\\s+(.+)$`, "m"));
        return {
          ok: true,
          action: "read",
          path: fullPath,
          name,
          type: match?.[1] || "unknown",
          value: match?.[2]?.trim() || ""
        };
      }

      case "write": {
        if (!name || value === undefined) {
          throw new Error("name and value are required for write action");
        }
        
        const result = await execReg(["add", fullPath, "/v", name, "/t", type, "/d", String(value), "/f"]);
        return {
          ok: result.exitCode === 0,
          action: "write",
          path: fullPath,
          name,
          type,
          value,
          error: result.exitCode !== 0 ? result.stderr : null
        };
      }

      case "delete": {
        const args = name 
          ? ["delete", fullPath, "/v", name, "/f"]
          : ["delete", fullPath, "/f"];
        
        const result = await execReg(args);
        return {
          ok: result.exitCode === 0,
          action: "delete",
          path: fullPath,
          name: name || "(entire key)",
          error: result.exitCode !== 0 ? result.stderr : null
        };
      }

      default:
        throw new Error(`Unsupported action: ${action}`);
    }
  }
};
