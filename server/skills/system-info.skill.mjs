import os from "node:os";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export const skill = {
  id: "system_info",
  name: "System Info",
  description: "Get system information including CPU, memory, network, and OS details.",
  inputSchema: {
    type: "object",
    properties: {
      detail: {
        type: "string",
        enum: ["basic", "full"],
        description: "Level of detail (basic or full)",
        default: "basic"
      }
    },
    additionalProperties: false
  },
  async run({ input }) {
    const detail = input?.detail || "basic";

    const cpus = os.cpus();
    const cpuInfo = cpus.map(cpu => ({
      model: cpu.model,
      speed: cpu.speed,
      times: cpu.times
    }));

    const result = {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      osVersion: os.release(),
      uptime: os.uptime(),
      cpu: {
        count: cpus.length,
        model: cpus[0]?.model || "unknown",
        speed: cpus[0]?.speed || 0,
        loadAvg: os.loadavg()
      },
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem()
      },
      network: {}
    };

    if (detail === "full") {
      const interfaces = os.networkInterfaces();
      for (const [name, addrs] of Object.entries(interfaces)) {
        result.network[name] = addrs?.map(addr => ({
          address: addr.address,
          family: addr.family,
          internal: addr.internal,
          mac: addr.mac
        })) || [];
      }

      try {
        const isWindows = os.platform() === "win32";
        if (isWindows) {
          const { stdout: ipconfig } = await execAsync("ipconfig", { encoding: "utf8" });
          result.networkInfo = ipconfig.slice(0, 5000);
        } else {
          const { stdout: ifconfig } = await execAsync("ifconfig || ip addr show", { encoding: "utf8" });
          result.networkInfo = ifconfig.slice(0, 5000);
        }
      } catch {
        result.networkInfo = "Unable to get network info";
      }

      result.env = Object.keys(process.env).filter(k => 
        !k.toLowerCase().includes("key") && 
        !k.toLowerCase().includes("secret") &&
        !k.toLowerCase().includes("password")
      );
      result.nodeVersion = process.version;
      result.execPath = process.execPath;
      result.pid = process.pid;
    }

    return result;
  }
};
