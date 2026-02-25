export const id = "gpu";
export const name = "GPU Monitor";
export const description = "GPU monitoring and management - NVIDIA (nvidia-smi), AMD ROCm (rocm-smi), Intel Arc, Apple Metal";
export const version = "1.0.0";

export const inputs = {
  type: "object",
  properties: {
    vendor: {
      type: "string",
      enum: ["nvidia", "amd", "intel", "apple", "all"],
      description: "GPU vendor",
      default: "all"
    },
    operation: {
      type: "string",
      enum: ["info", "utilization", "memory", "temperature", "power", "processes", "all"],
      description: "Information to retrieve"
    }
  },
  required: ["operation"]
};

import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

async function nvidiaSmi(args = "") {
  try {
    const { stdout } = await execAsync(`nvidia-smi ${args} --format=csv,noheader,nounits`);
    return stdout.trim();
  } catch {
    return null;
  }
}

async function getNvidiaInfo() {
  const info = await nvidiaSmi("--query-gpu=index,name,driver_version,memory.total,compute_cap --format=csv,noheader,nounits");
  if (!info) return null;
  
  const lines = info.split("\n");
  return lines.map(line => {
    const [index, name, driver, memory, compute] = line.split(",").map(s => s.trim());
    return { index: parseInt(index), name, driver, memoryTotal: parseInt(memory), computeCap: compute };
  });
}

async function getNvidiaUtilization() {
  const info = await nvidiaSmi("--query-gpu=index,utilization.gpu,utilization.memory --format=csv,noheader,nounits");
  if (!info) return null;
  
  return info.split("\n").map(line => {
    const [index, gpu, mem] = line.split(",").map(s => parseInt(s.trim()));
    return { index, gpuUtil: gpu, memUtil: mem };
  });
}

async function getNvidiaMemory() {
  const info = await nvidiaSmi("--query-gpu=index,memory.used,memory.free,memory.total --format=csv,noheader,nounits");
  if (!info) return null;
  
  return info.split("\n").map(line => {
    const [index, used, free, total] = line.split(",").map(s => parseInt(s.trim()));
    return { index, used, free, total, percentUsed: Math.round(used / total * 100) };
  });
}

async function getNvidiaTemperature() {
  const info = await nvidiaSmi("--query-gpu=index,temperature.gpu,temperature.memory --format=csv,noheader,nounits");
  if (!info) return null;
  
  return info.split("\n").map(line => {
    const [index, gpu, mem] = line.split(",").map(s => parseInt(s.trim()));
    return { index, gpu, memory: mem };
  });
}

async function getNvidiaPower() {
  const info = await nvidiaSmi("--query-gpu=index,power.draw,power.limit --format=csv,noheader,nounits");
  if (!info) return null;
  
  return info.split("\n").map(line => {
    const [index, draw, limit] = line.split(",").map(s => parseFloat(s.trim()));
    return { index, draw: Math.round(draw), limit: Math.round(limit), percentUsed: Math.round(draw / limit * 100) };
  });
}

async function getNvidiaProcesses() {
  const info = await nvidiaSmi("--query-compute-apps=pid,process_name,used_memory --format=csv,noheader,nounits");
  if (!info) return [];
  
  return info.split("\n").map(line => {
    const [pid, name, memory] = line.split(",").map(s => s.trim());
    return { pid: parseInt(pid), name, memory: parseInt(memory) };
  });
}

async function rocmSmi(args = "") {
  try {
    const { stdout } = await execAsync(`rocm-smi ${args}`);
    return stdout.trim();
  } catch {
    return null;
  }
}

async function getAmdInfo() {
  const info = await rocmSmi("--showproductname --csv");
  if (!info) return null;
  
  try {
    const lines = info.split("\n").slice(1);
    return lines.map((line, i) => {
      const parts = line.split(",");
      return { index: i, name: parts[1]?.trim() || "Unknown" };
    });
  } catch {
    return null;
  }
}

async function getAmdUtilization() {
  const info = await rocmSmi("--showuse --csv");
  if (!info) return null;
  
  try {
    const lines = info.split("\n").slice(1);
    return lines.map(line => {
      const parts = line.split(",");
      return { index: parseInt(parts[0]), gpuUtil: parseInt(parts[1]), memUtil: parseInt(parts[2]) };
    });
  } catch {
    return null;
  }
}

async function detectGpuVendor() {
  try {
    await execAsync("nvidia-smi");
    return "nvidia";
  } catch {}
  
  try {
    await execAsync("rocm-smi");
    return "amd";
  } catch {}
  
  if (process.platform === "darwin" && process.arch === "arm64") {
    return "apple";
  }
  
  return null;
}

export async function run({ input }) {
  const { vendor, operation } = input;

  try {
    const detectedVendor = vendor === "all" ? await detectGpuVendor() : vendor;
    
    if (!detectedVendor) {
      return { ok: false, error: "No GPU detected or supported" };
    }

    const result = { vendor: detectedVendor };
    
    if (detectedVendor === "nvidia") {
      switch (operation) {
        case "info":
          result.gpus = await getNvidiaInfo();
          break;
        case "utilization":
          result.gpus = await getNvidiaUtilization();
          break;
        case "memory":
          result.gpus = await getNvidiaMemory();
          break;
        case "temperature":
          result.gpus = await getNvidiaTemperature();
          break;
        case "power":
          result.gpus = await getNvidiaPower();
          break;
        case "processes":
          result.processes = await getNvidiaProcesses();
          break;
        case "all":
          result.gpus = await getNvidiaInfo();
          result.utilization = await getNvidiaUtilization();
          result.memory = await getNvidiaMemory();
          result.temperature = await getNvidiaTemperature();
          result.power = await getNvidiaPower();
          result.processes = await getNvidiaProcesses();
          break;
      }
    } else if (detectedVendor === "amd") {
      switch (operation) {
        case "info":
          result.gpus = await getAmdInfo();
          break;
        case "utilization":
          result.gpus = await getAmdUtilization();
          break;
        case "all":
          result.gpus = await getAmdInfo();
          result.utilization = await getAmdUtilization();
          break;
        default:
          result.gpus = await getAmdInfo();
      }
    } else if (detectedVendor === "apple") {
      result.gpus = [{ name: "Apple Silicon GPU", vendor: "Apple", architecture: "arm64" }];
    }

    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export async function detectGpu() {
  const vendor = await detectGpuVendor();
  return { vendor, available: !!vendor };
}

export const supportedVendors = [
  { id: "nvidia", name: "NVIDIA", icon: "🟢", tool: "nvidia-smi" },
  { id: "amd", name: "AMD ROCm", icon: "🔴", tool: "rocm-smi" },
  { id: "intel", name: "Intel Arc", icon: "🔵", tool: "xpu-smi" },
  { id: "apple", name: "Apple Metal", icon: "🍎", tool: "system" }
];
