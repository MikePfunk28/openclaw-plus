import { spawn } from "node:child_process";

export const skill = {
  id: "windows_winget",
  name: "Windows Winget",
  description: "Install, uninstall, update, and search for Windows packages using winget (Windows Package Manager).",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["search", "install", "uninstall", "update", "list", "info", "upgrade-all"],
        description: "Winget action to perform"
      },
      package: {
        type: "string",
        description: "Package ID or name"
      },
      source: {
        type: "string",
        description: "Package source (e.g., 'winget', 'msstore')"
      },
      acceptPackageAgreements: {
        type: "boolean",
        description: "Automatically accept package agreements",
        default: true
      },
      force: {
        type: "boolean",
        description: "Force the operation",
        default: false
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
    const pkg = input?.package;
    const source = input?.source;
    const acceptAgreements = input?.acceptPackageAgreements !== false;
    const force = input?.force || false;

    const execWinget = (args, timeoutMs = 120000) => {
      return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        
        const child = spawn("winget.exe", args, {
          windowsHide: true,
          env: process.env,
          shell: true
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

    const parseWingetList = (output) => {
      const lines = output.split("\n");
      const packages = [];
      let headerFound = false;
      
      for (const line of lines) {
        if (line.includes("Name") && line.includes("Id") && line.includes("Version")) {
          headerFound = true;
          continue;
        }
        
        if (!headerFound) continue;
        if (!line.trim() || line.includes("─")) continue;
        
        const match = line.match(/^(.+?)\s{2,}(\S+)\s{2,}(\S+)\s*(.*)$/);
        if (match) {
          packages.push({
            name: match[1].trim(),
            id: match[2].trim(),
            version: match[3].trim(),
            available: match[4]?.trim() || ""
          });
        }
      }
      return packages;
    };

    switch (action) {
      case "search": {
        if (!pkg) throw new Error("package is required for search action");
        
        const args = ["search", pkg, "--accept-source-agreements"];
        if (source) args.push("--source", source);
        
        const result = await execWinget(args);
        
        if (result.exitCode !== 0 && !result.stdout.includes("No package found")) {
          return { ok: false, action: "search", query: pkg, error: result.stderr };
        }
        
        const packages = parseWingetList(result.stdout);
        return {
          ok: true,
          action: "search",
          query: pkg,
          count: packages.length,
          packages: packages.slice(0, 20)
        };
      }

      case "install": {
        if (!pkg) throw new Error("package is required for install action");
        
        const args = ["install", pkg, "--silent"];
        if (acceptAgreements) args.push("--accept-package-agreements", "--accept-source-agreements");
        if (source) args.push("--source", source);
        if (force) args.push("--force");
        
        const result = await execWinget(args, 300000);
        return {
          ok: result.exitCode === 0,
          action: "install",
          package: pkg,
          message: result.exitCode === 0 ? "Package installed successfully" : result.stderr,
          output: result.stdout.slice(-2000)
        };
      }

      case "uninstall": {
        if (!pkg) throw new Error("package is required for uninstall action");
        
        const args = ["uninstall", pkg, "--silent"];
        if (force) args.push("--force");
        
        const result = await execWinget(args, 180000);
        return {
          ok: result.exitCode === 0,
          action: "uninstall",
          package: pkg,
          message: result.exitCode === 0 ? "Package uninstalled successfully" : result.stderr,
          output: result.stdout.slice(-2000)
        };
      }

      case "update": {
        if (!pkg) throw new Error("package is required for update action");
        
        const args = ["upgrade", pkg, "--silent"];
        if (acceptAgreements) args.push("--accept-package-agreements", "--accept-source-agreements");
        if (force) args.push("--force");
        
        const result = await execWinget(args, 300000);
        return {
          ok: result.exitCode === 0,
          action: "update",
          package: pkg,
          message: result.exitCode === 0 ? "Package updated successfully" : result.stderr,
          output: result.stdout.slice(-2000)
        };
      }

      case "list": {
        const args = ["list"];
        if (source) args.push("--source", source);
        
        const result = await execWinget(args);
        
        if (result.exitCode !== 0) {
          return { ok: false, action: "list", error: result.stderr };
        }
        
        const packages = parseWingetList(result.stdout);
        return {
          ok: true,
          action: "list",
          count: packages.length,
          packages: packages.slice(0, 50)
        };
      }

      case "info": {
        if (!pkg) throw new Error("package is required for info action");
        
        const args = ["show", pkg];
        if (source) args.push("--source", source);
        
        const result = await execWinget(args);
        return {
          ok: result.exitCode === 0,
          action: "info",
          package: pkg,
          info: result.stdout.slice(0, 5000)
        };
      }

      case "upgrade-all": {
        const args = ["upgrade", "--all", "--silent"];
        if (acceptAgreements) args.push("--accept-package-agreements", "--accept-source-agreements");
        
        const result = await execWinget(args, 600000);
        return {
          ok: result.exitCode === 0,
          action: "upgrade-all",
          message: result.exitCode === 0 ? "All packages upgraded" : result.stderr,
          output: result.stdout.slice(-3000)
        };
      }

      default:
        throw new Error(`Unsupported action: ${action}`);
    }
  }
};
