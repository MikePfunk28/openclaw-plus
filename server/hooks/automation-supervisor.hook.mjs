import path from "node:path";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const RULES_PATH = path.join("server", "automation-rules.json");

function enabledFromEnv() {
  return String(process.env.OPENCLAW_AUTOMATION_ENABLED || "").toLowerCase() === "true";
}

function enabledFromConfig(event) {
  return Boolean(event?.context?.automation?.enabled);
}

async function loadRules(rootDir) {
  const fullPath = path.join(rootDir, RULES_PATH);
  try {
    const raw = await readFile(fullPath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.rules) ? parsed.rules : [];
  } catch {
    return [];
  }
}

function ruleMatches(rule, event) {
  if (!rule || rule.enabled === false) {
    return false;
  }
  if (rule.onEvent && rule.onEvent !== event.type) {
    return false;
  }

  const when = rule.when || {};
  if (when.routeKey && when.routeKey !== event.routeKey) {
    return false;
  }
  if (typeof when.done === "boolean" && when.done !== Boolean(event?.details?.done)) {
    return false;
  }

  return true;
}

function runCommand({ command, args, cwd, timeoutMs }) {
  return new Promise((resolve) => {
    const child = spawn(command, Array.isArray(args) ? args : [], {
      cwd,
      shell: false,
      windowsHide: true,
      env: process.env
    });

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ ok: false, timedOut: true, stdout, stderr, exitCode: -1 });
    }, Math.max(1000, Number(timeoutMs || 30000)));

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, timedOut: false, stdout, stderr, exitCode: code });
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, timedOut: false, stdout, stderr: String(error?.message || error), exitCode: -1 });
    });
  });
}

async function writeAutomationLog(rootDir, payload) {
  const logDir = path.join(rootDir, "data", "automation");
  const logPath = path.join(logDir, "events.log");
  await mkdir(logDir, { recursive: true });
  await appendFile(logPath, `${JSON.stringify(payload)}\n`, "utf8");
}

export const hook = {
  id: "automation_supervisor",
  description: "Run pre-approved local workflows after selected lifecycle events",
  events: ["run_completed"],
  async run(event) {
    const rootDir = event?.context?.rootDir;
    if (!rootDir) {
      return;
    }

    if (!enabledFromConfig(event) && !enabledFromEnv()) {
      return;
    }

    const rules = await loadRules(rootDir);
    const matchingRules = rules.filter((rule) => ruleMatches(rule, event));

    for (const rule of matchingRules) {
      const cwd = rule.cwd ? path.resolve(rootDir, rule.cwd) : rootDir;
      const result = await runCommand({
        command: rule.command,
        args: rule.args,
        cwd,
        timeoutMs: rule.timeoutMs
      });

      await writeAutomationLog(rootDir, {
        timestamp: new Date().toISOString(),
        hookId: "automation_supervisor",
        ruleId: rule.id || "unnamed",
        eventType: event.type,
        routeKey: event.routeKey,
        sessionId: event.sessionId,
        result: {
          ok: result.ok,
          timedOut: result.timedOut,
          exitCode: result.exitCode,
          stdout: String(result.stdout || "").slice(-5000),
          stderr: String(result.stderr || "").slice(-5000)
        }
      });
    }
  }
};
