import { spawn } from "node:child_process";
import { promisify } from "node:util";

export const skill = {
  id: "windows_network",
  name: "Windows Network",
  description: "Manage Windows network configuration - adapters, DNS, firewall, and connections.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["adapters", "ipconfig", "dns", "netstat", "ping", "traceroute", "firewall-status", "firewall-rule", "connections"],
        description: "Network action to perform"
      },
      target: {
        type: "string",
        description: "Target host for ping/traceroute"
      },
      adapter: {
        type: "string",
        description: "Specific adapter name"
      },
      dnsAction: {
        type: "string",
        enum: ["get", "flush", "set"],
        description: "DNS sub-action"
      },
      dnsServers: {
        type: "array",
        items: { type: "string" },
        description: "DNS servers to set (for set action)"
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
    const target = input?.target;
    const adapter = input?.adapter;
    const dnsAction = input?.dnsAction;
    const dnsServers = input?.dnsServers;

    const execNetsh = (args, timeoutMs = 30000) => {
      return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        
        const child = spawn("netsh.exe", args, { windowsHide: true });
        
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

    const execCommand = (cmd, args, timeoutMs = 30000) => {
      return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        
        const child = spawn(cmd, args, { windowsHide: true });
        
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
      case "adapters": {
        const result = await execCommand("powershell.exe", [
          "-NoProfile", "-Command",
          "Get-NetAdapter | Select-Object Name, InterfaceDescription, Status, LinkSpeed, MacAddress | ConvertTo-Json -Compress"
        ]);
        
        if (result.exitCode !== 0) {
          return { ok: false, action: "adapters", error: result.stderr };
        }
        
        let adapters = [];
        try {
          adapters = JSON.parse(result.stdout);
          if (!Array.isArray(adapters)) adapters = [adapters];
        } catch {}
        
        return {
          ok: true,
          action: "adapters",
          count: adapters.length,
          adapters
        };
      }

      case "ipconfig": {
        const args = ["/all"];
        const result = await execCommand("ipconfig.exe", args);
        
        return {
          ok: result.exitCode === 0,
          action: "ipconfig",
          output: result.stdout
        };
      }

      case "dns": {
        if (dnsAction === "get") {
          const result = await execCommand("powershell.exe", [
            "-NoProfile", "-Command",
            "Get-DnsClientServerAddress -AddressFamily IPv4 | Select-Object InterfaceAlias, ServerAddresses | ConvertTo-Json -Compress"
          ]);
          
          if (result.exitCode !== 0) {
            return { ok: false, action: "dns", dnsAction, error: result.stderr };
          }
          
          let dns = [];
          try {
            dns = JSON.parse(result.stdout);
            if (!Array.isArray(dns)) dns = [dns];
          } catch {}
          
          return { ok: true, action: "dns", dnsAction: "get", dns };
        }
        
        if (dnsAction === "flush") {
          const result = await execCommand("ipconfig.exe", ["/flushdns"]);
          return {
            ok: result.exitCode === 0,
            action: "dns",
            dnsAction: "flush",
            message: result.exitCode === 0 ? "DNS cache flushed" : result.stderr
          };
        }
        
        if (dnsAction === "set") {
          if (!adapter || !dnsServers || dnsServers.length === 0) {
            throw new Error("adapter and dnsServers are required for set action");
          }
          
          const servers = dnsServers.join(",");
          const result = await execNetsh([
            "interface", "ip", "set", "dns",
            `name=${adapter}`,
            "static",
            dnsServers[0],
            "primary"
          ]);
          
          return {
            ok: result.exitCode === 0,
            action: "dns",
            dnsAction: "set",
            adapter,
            dnsServers,
            message: result.exitCode === 0 ? "DNS servers updated" : result.stderr
          };
        }
        
        throw new Error(`Unknown DNS action: ${dnsAction}`);
      }

      case "netstat": {
        const result = await execCommand("netstat.exe", ["-ano"]);
        
        if (result.exitCode !== 0) {
          return { ok: false, action: "netstat", error: result.stderr };
        }
        
        const lines = result.stdout.split("\n").filter(l => l.trim());
        const connections = lines.slice(4).slice(0, 50).map(line => {
          const parts = line.trim().split(/\s+/);
          return {
            proto: parts[0] || "",
            local: parts[1] || "",
            remote: parts[2] || "",
            state: parts[3] || "",
            pid: parts[4] || ""
          };
        });
        
        return {
          ok: true,
          action: "netstat",
          count: connections.length,
          connections
        };
      }

      case "ping": {
        if (!target) throw new Error("target is required for ping action");
        
        const result = await execCommand("ping.exe", ["-n", "4", target], 30000);
        
        const success = result.stdout.includes("TTL=") || result.stdout.includes("bytes=");
        const stats = {
          sent: (result.stdout.match(/Sent = (\d+)/)?.[1]) || "4",
          received: (result.stdout.match(/Received = (\d+)/)?.[1]) || "0",
          lost: (result.stdout.match(/Lost = (\d+)/)?.[1]) || "4",
          avgMs: (result.stdout.match(/Average = (\d+)ms/)?.[1]) || "N/A"
        };
        
        return {
          ok: success,
          action: "ping",
          target,
          stats,
          output: result.stdout.slice(-2000)
        };
      }

      case "traceroute": {
        if (!target) throw new Error("target is required for traceroute action");
        
        const result = await execCommand("tracert.exe", ["-d", "-h", "15", target], 60000);
        
        return {
          ok: result.exitCode === 0,
          action: "traceroute",
          target,
          output: result.stdout.slice(-5000)
        };
      }

      case "firewall-status": {
        const result = await execNetsh(["advfirewall", "show", "allprofiles", "state"]);
        
        const profiles = {
          domain: result.stdout.includes("Domain Profile") && result.stdout.includes("ON"),
          private: result.stdout.includes("Private Profile") && result.stdout.includes("ON"),
          public: result.stdout.includes("Public Profile") && result.stdout.includes("ON")
        };
        
        return {
          ok: true,
          action: "firewall-status",
          profiles,
          output: result.stdout
        };
      }

      case "firewall-rule": {
        const result = await execCommand("powershell.exe", [
          "-NoProfile", "-Command",
          "Get-NetFirewallRule | Where-Object {$_.Enabled -eq $true} | Select-Object -First 50 DisplayName, Direction, Action, Enabled | ConvertTo-Json -Compress"
        ]);
        
        if (result.exitCode !== 0) {
          return { ok: false, action: "firewall-rule", error: result.stderr };
        }
        
        let rules = [];
        try {
          rules = JSON.parse(result.stdout);
          if (!Array.isArray(rules)) rules = [rules];
        } catch {}
        
        return {
          ok: true,
          action: "firewall-rule",
          count: rules.length,
          rules
        };
      }

      case "connections": {
        const result = await execCommand("powershell.exe", [
          "-NoProfile", "-Command",
          "Get-NetTCPConnection | Where-Object {$_.State -eq 'Established'} | Select-Object -First 30 LocalAddress, LocalPort, RemoteAddress, RemotePort, State, OwningProcess | ConvertTo-Json -Compress"
        ]);
        
        if (result.exitCode !== 0) {
          return { ok: false, action: "connections", error: result.stderr };
        }
        
        let conns = [];
        try {
          conns = JSON.parse(result.stdout);
          if (!Array.isArray(conns)) conns = [conns];
        } catch {}
        
        return {
          ok: true,
          action: "connections",
          count: conns.length,
          connections: conns
        };
      }

      default:
        throw new Error(`Unsupported action: ${action}`);
    }
  }
};
