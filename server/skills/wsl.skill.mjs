export const id = "wsl";
export const name = "WSL Adapter";
export const description = "Execute commands in WSL2 from Windows - bridge Windows and Linux environments";
export const version = "1.0.0";

export const inputs = {
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: ["exec", "shell", "list_distros", "copy_to_wsl", "copy_from_wsl", "status", "start_distro", "stop_distro", "shutdown", "install_distro", "system_info", "docker_ps", "docker_exec", "run_script"],
      description: "Action to perform"
    },
    distro: { type: "string", description: "WSL distro name (default: first running distro)" },
    command: { type: "string", description: "Command to execute in WSL" },
    windowsPath: { type: "string", description: "Windows path for file copy" },
    wslPath: { type: "string", description: "WSL path for file copy" },
    script: { type: "string", description: "Multi-line script to execute" },
    dockerContainer: { type: "string", description: "Docker container name/id" },
    dockerCommand: { type: "string", description: "Command to run in Docker container" }
  },
  required: ["action"]
};

import { spawn, exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const isWindows = process.platform === "win32";

export async function run({ input }) {
  const { action, distro, command, windowsPath, wslPath, script, dockerContainer, dockerCommand } = input;

  if (!isWindows) {
    return { ok: false, error: "WSL adapter only works on Windows" };
  }

  try {
    switch (action) {
      case "list_distros":
        return await listDistros();
      
      case "status":
        return await getWslStatus();
      
      case "exec":
        if (!command) {
          return { ok: false, error: "command is required for exec action" };
        }
        return await wslExec(command, distro);
      
      case "shell":
        return await openWslShell(distro);
      
      case "copy_to_wsl":
        if (!windowsPath || !wslPath) {
          return { ok: false, error: "Both windowsPath and wslPath required" };
        }
        return await copyToWsl(windowsPath, wslPath, distro);
      
      case "copy_from_wsl":
        if (!windowsPath || !wslPath) {
          return { ok: false, error: "Both windowsPath and wslPath required" };
        }
        return await copyFromWsl(wslPath, windowsPath, distro);

      case "start_distro":
        return await startDistro(distro);
      
      case "stop_distro":
        return await stopDistro(distro);
      
      case "shutdown":
        return await shutdownWsl();
      
      case "install_distro":
        return await installDistro(distro);
      
      case "system_info":
        return await getSystemInfo(distro);
      
      case "docker_ps":
        return await dockerPs(distro);
      
      case "docker_exec":
        if (!dockerContainer || !dockerCommand) {
          return { ok: false, error: "dockerContainer and dockerCommand required" };
        }
        return await dockerExec(dockerContainer, dockerCommand, distro);
      
      case "run_script":
        if (!script) {
          return { ok: false, error: "script is required for run_script action" };
        }
        return await runScript(script, distro);
      
      default:
        return { ok: false, error: `Unknown action: ${action}` };
    }
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function listDistros() {
  try {
    const { stdout } = await execAsync("wsl --list --verbose");
    const lines = stdout.trim().split("\n").slice(1);
    
    const distros = lines.map(line => {
      const parts = line.trim().split(/\s+/);
      const isDefault = line.startsWith("*");
      return {
        name: parts[0]?.replace("*", "").trim() || "",
        state: parts[1] || "Unknown",
        version: parts[2] || "2",
        isDefault
      };
    }).filter(d => d.name);
    
    return { ok: true, distros, raw: stdout };
  } catch (error) {
    return { ok: false, error: "Failed to list WSL distros: " + error.message };
  }
}

async function getWslStatus() {
  try {
    const { stdout: version } = await execAsync("wsl --version").catch(() => ({ stdout: "Unknown" }));
    const distros = await listDistros();
    
    const running = distros.distros?.filter(d => d.state === "Running") || [];
    
    return {
      ok: true,
      installed: true,
      version: version.trim(),
      totalDistros: distros.distros?.length || 0,
      runningDistros: running.length,
      distros: distros.distros,
      defaultDistro: distros.distros?.find(d => d.isDefault)?.name || running[0]?.name
    };
  } catch (error) {
    return {
      ok: true,
      installed: false,
      error: "WSL not installed or not accessible"
    };
  }
}

async function wslExec(command, distro) {
  const distroFlag = distro ? `-d ${distro}` : "";
  const fullCommand = `wsl ${distroFlag} -- bash -c "${command.replace(/"/g, '\\"')}"`;
  
  try {
    const { stdout, stderr } = await execAsync(fullCommand, {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 60000
    });
    
    return {
      ok: true,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      command
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      stdout: error.stdout || "",
      stderr: error.stderr || ""
    };
  }
}

async function openWslShell(distro) {
  const distroFlag = distro ? `-d ${distro}` : "";
  
  return new Promise((resolve) => {
    const proc = spawn("wsl", distro ? ["-d", distro] : [], {
      detached: true,
      stdio: "ignore",
      windowsHide: false
    });
    
    proc.unref();
    
    resolve({
      ok: true,
      message: "WSL shell opened",
      pid: proc.pid
    });
  });
}

async function copyToWsl(windowsPath, wslPath, distro) {
  const distroName = distro || (await getDefaultDistro());
  const command = distroName 
    ? `wsl -d ${distroName} cp "${windowsPath}" "${wslPath}"`
    : `wsl cp "${windowsPath}" "${wslPath}"`;
  
  try {
    const { stdout, stderr } = await execAsync(command);
    return { ok: true, message: "File copied to WSL", from: windowsPath, to: wslPath };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function copyFromWsl(wslPath, windowsPath, distro) {
  const distroName = distro || (await getDefaultDistro());
  const command = distroName
    ? `wsl -d ${distroName} cp "${wslPath}" "${windowsPath}"`
    : `wsl cp "${wslPath}" "${windowsPath}"`;
  
  try {
    const { stdout, stderr } = await execAsync(command);
    return { ok: true, message: "File copied from WSL", from: wslPath, to: windowsPath };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function getDefaultDistro() {
  const status = await getWslStatus();
  return status.defaultDistro || "Ubuntu";
}

async function startDistro(distro) {
  const distroName = distro || "Ubuntu";
  try {
    const { stdout, stderr } = await execAsync(`wsl -d ${distroName} -- true`, { timeout: 30000 });
    return { ok: true, message: `Distro ${distroName} started`, distro: distroName };
  } catch (error) {
    return { ok: false, error: `Failed to start distro: ${error.message}` };
  }
}

async function stopDistro(distro) {
  const distroName = distro || "Ubuntu";
  try {
    const { stdout, stderr } = await execAsync(`wsl --terminate ${distroName}`, { timeout: 30000 });
    return { ok: true, message: `Distro ${distroName} stopped`, distro: distroName };
  } catch (error) {
    return { ok: false, error: `Failed to stop distro: ${error.message}` };
  }
}

async function shutdownWsl() {
  try {
    const { stdout, stderr } = await execAsync("wsl --shutdown", { timeout: 30000 });
    return { ok: true, message: "WSL shutdown complete" };
  } catch (error) {
    return { ok: false, error: `Failed to shutdown WSL: ${error.message}` };
  }
}

async function installDistro(distroName) {
  if (!distroName) {
    const { stdout } = await execAsync("wsl --list --online");
    return { ok: true, message: "Available distros to install", available: stdout };
  }
  
  try {
    const { stdout, stderr } = await execAsync(`wsl --install -d ${distroName}`, { timeout: 300000 });
    return { ok: true, message: `Installing ${distroName}`, output: stdout };
  } catch (error) {
    return { ok: false, error: `Failed to install distro: ${error.message}` };
  }
}

async function getSystemInfo(distro) {
  const distroFlag = distro ? `-d ${distro}` : "";
  
  try {
    const commands = {
      kernel: "uname -a",
      cpu: "lscpu | grep -E 'Model name|CPU\\(s\\)|CPU MHz'",
      memory: "free -h",
      disk: "df -h /",
      os: "cat /etc/os-release | head -5",
      docker: "docker --version 2>/dev/null || echo 'Docker not installed'"
    };

    const results = {};
    for (const [key, cmd] of Object.entries(commands)) {
      try {
        const { stdout } = await execAsync(`wsl ${distroFlag} -- bash -c "${cmd}"`, { timeout: 10000 });
        results[key] = stdout.trim();
      } catch {
        results[key] = "Unable to retrieve";
      }
    }

    return { ok: true, system: results, distro: distro || "default" };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function dockerPs(distro) {
  const distroFlag = distro ? `-d ${distro}` : "";
  
  try {
    const { stdout } = await execAsync(`wsl ${distroFlag} -- docker ps -a --format "{{json .}}"`, { timeout: 30000 });
    const containers = stdout.trim().split('\n').filter(Boolean).map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return { raw: line };
      }
    });
    
    return { ok: true, containers, count: containers.length };
  } catch (error) {
    return { ok: false, error: error.message, hint: "Is Docker running in WSL?" };
  }
}

async function dockerExec(container, command, distro) {
  const distroFlag = distro ? `-d ${distro}` : "";
  
  try {
    const { stdout, stderr } = await execAsync(
      `wsl ${distroFlag} -- docker exec ${container} ${command}`,
      { timeout: 60000, maxBuffer: 10 * 1024 * 1024 }
    );
    
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim(), container, command };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function runScript(script, distro) {
  const distroFlag = distro ? `-d ${distro}` : "";
  const escapedScript = script.replace(/"/g, '\\"').replace(/\n/g, '; ');
  
  try {
    const { stdout, stderr } = await execAsync(
      `wsl ${distroFlag} -- bash -c "${escapedScript}"`,
      { timeout: 120000, maxBuffer: 50 * 1024 * 1024 }
    );
    
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    return { 
      ok: false, 
      error: error.message, 
      stdout: error.stdout || "", 
      stderr: error.stderr || "" 
    };
  }
}

// WSL path conversion utilities
export function windowsToWslPath(windowsPath) {
  // C:\Users\... -> /mnt/c/Users/...
  const match = windowsPath.match(/^([A-Za-z]):\\(.*)$/);
  if (!match) return windowsPath;
  
  const drive = match[1].toLowerCase();
  const path = match[2].replace(/\\/g, "/");
  return `/mnt/${drive}/${path}`;
}

export function wslToWindowsPath(wslPath) {
  // /mnt/c/Users/... -> C:\Users\...
  const match = wslPath.match(/^\/mnt\/([a-z])\/(.*)$/);
  if (!match) return wslPath;
  
  const drive = match[1].toUpperCase();
  const path = match[2].replace(/\//g, "\\");
  return `${drive}:\\${path}`;
}

export const commonWslCommands = {
  system: {
    update: "sudo apt update && sudo apt upgrade -y",
    install: "sudo apt install -y",
    clean: "sudo apt autoremove -y"
  },
  node: {
    version: "node --version",
    install: "curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs"
  },
  docker: {
    ps: "docker ps",
    images: "docker images"
  },
  files: {
    list: "ls -la",
    find: "find . -name",
    grep: "grep -r"
  }
};

export const inputSchema = inputs;

export const skill = {
  id,
  name,
  description,
  version,
  inputSchema,
  run
};
