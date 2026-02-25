export const id = "terminal";
export const name = "Terminal";
export const description = "Execute shell commands with safety checks, timeout, and output capture";
export const version = "2.0.0";

export const inputs = {
  type: "object",
  properties: {
    command: { type: "string", description: "Shell command to execute" },
    cwd: { type: "string", description: "Working directory" },
    timeout: { type: "number", description: "Timeout in ms (default 60000)" },
    env: { type: "object", description: "Environment variables" },
    shell: { type: "string", description: "Shell to use (bash, sh, powershell, cmd)" },
    input: { type: "string", description: "Stdin input" },
    captureStderr: { type: "boolean", description: "Include stderr in output" }
  },
  required: ["command"]
};

import { spawn } from "node:child_process";
import { platform } from "node:os";
import { access } from "node:fs/promises";

const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+\//i,
  /rm\s+-rf\s+\*/i,
  /del\s+\/[sq]\s+\*/i,
  /format\s+[a-z]:/i,
  /:\(\)\{ :|:& \};:/i,
  />\s*\/dev\/sda/i,
  /mkfs/i,
  /dd\s+if=/i,
  /shutdown/i,
  /reboot/i,
  /init\s+0/i,
  /systemctl\s+(stop|disable)/i,
  /service\s+\w+\s+stop/i,
  /net\s+user.*\/delete/i,
  /net\s+localgroup.*\/delete/i,
  /cipher\s+\/w:/i,
  /diskpart/i,
  /bcdedit/i,
  /reg\s+delete/i
];

function checkDangerousCommand(command) {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return { dangerous: true, pattern: pattern.toString() };
    }
  }
  return { dangerous: false };
}

export async function run({ input, workspaceRoot }) {
  const { command, cwd, timeout = 60000, env = {}, shell, input: stdin, captureStderr = true } = input;

  const dangerCheck = checkDangerousCommand(command);
  if (dangerCheck.dangerous) {
    return {
      ok: false,
      error: `Command blocked by security policy. Matched pattern: ${dangerCheck.pattern}`,
      blocked: true
    };
  }

  const workingDir = cwd || workspaceRoot || process.cwd();

  try {
    await access(workingDir);
  } catch {
    return { ok: false, error: `Directory not found: ${workingDir}` };
  }

  return new Promise((resolve) => {
    const platformType = platform();
    const defaultShell = platformType === "win32" ? "powershell.exe" : "/bin/bash";
    const shellToUse = shell || defaultShell;

    const childEnv = { ...process.env, ...env };

    const child = spawn(command, [], {
      cwd: workingDir,
      shell: shellToUse,
      env: childEnv,
      timeout,
      maxBuffer: 10 * 1024 * 1024
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timeoutId = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeout);

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    if (stdin) {
      child.stdin.write(stdin);
      child.stdin.end();
    }

    child.on("error", (error) => {
      clearTimeout(timeoutId);
      resolve({ ok: false, error: error.message });
    });

    child.on("close", (code) => {
      clearTimeout(timeoutId);

      if (timedOut) {
        resolve({
          ok: false,
          error: `Command timed out after ${timeout}ms`,
          stdout,
          stderr,
          timedOut: true
        });
        return;
      }

      const output = captureStderr && stderr ? `${stdout}\n[stderr]\n${stderr}` : stdout;

      resolve({
        ok: code === 0,
        exitCode: code,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        output: output.trim(),
        command,
        cwd: workingDir
      });
    });
  });
}

export const commonCommands = {
  files: {
    list: { cmd: "ls -la", desc: "List files with details" },
    find: { cmd: "find . -name", desc: "Find files by name" },
    search: { cmd: "grep -r", desc: "Search in files" },
    tree: { cmd: "tree -L 2", desc: "Show directory tree" }
  },
  git: {
    status: { cmd: "git status", desc: "Show git status" },
    log: { cmd: "git log --oneline -10", desc: "Recent commits" },
    diff: { cmd: "git diff", desc: "Show changes" },
    branch: { cmd: "git branch -a", desc: "List branches" }
  },
  system: {
    disk: { cmd: "df -h", desc: "Disk usage" },
    memory: { cmd: "free -h", desc: "Memory usage" },
    processes: { cmd: "ps aux | head -20", desc: "Top processes" },
    ports: { cmd: "netstat -tlnp", desc: "Listening ports" }
  },
  docker: {
    ps: { cmd: "docker ps", desc: "Running containers" },
    images: { cmd: "docker images", desc: "Docker images" },
    logs: { cmd: "docker logs", desc: "Container logs" }
  },
  node: {
    install: { cmd: "npm install", desc: "Install dependencies" },
    test: { cmd: "npm test", desc: "Run tests" },
    build: { cmd: "npm run build", desc: "Build project" }
  },
  python: {
    install: { cmd: "pip install", desc: "Install packages" },
    run: { cmd: "python", desc: "Run Python script" },
    venv: { cmd: "python -m venv venv", desc: "Create virtual environment" }
  }
};

export function getCommandSuggestions(context) {
  const suggestions = [];

  if (context.hasPackageJson) {
    suggestions.push("npm install", "npm test", "npm run dev");
  }

  if (context.hasGit) {
    suggestions.push("git status", "git diff", "git log --oneline -5");
  }

  if (context.hasDocker) {
    suggestions.push("docker ps", "docker compose up -d");
  }

  return suggestions;
}
