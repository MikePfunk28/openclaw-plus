import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { SkillRegistry } from "../server/lib/skill-registry.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const skills = new SkillRegistry(path.join(rootDir, "server", "skills"), rootDir);
  await skills.load();

  const ids = [...skills.skills.keys()];
  const isWindows = os.platform() === "win32";
  
  const required = ["workspace_files", "shell_execute", "process_control", "system_info", "claude_code"];
  const windowsRequired = ["windows_powershell", "windows_registry", "windows_services", "windows_winget", "windows_eventlog", "windows_tasks", "windows_network"];
  
  for (const id of required) {
    assert(ids.includes(id), `Missing required skill: ${id}`);
  }
  
  if (isWindows) {
    for (const id of windowsRequired) {
      assert(ids.includes(id), `Missing Windows skill: ${id}`);
    }
  }

  const shell = skills.skills.get("shell_execute");
  const shellResult = await shell.run({ input: { command: "echo smoke" } });
  assert(shellResult.ok === true, "shell_execute failed");

  const blockedResult = await shell.run({ input: { command: "shutdown /r /t 0" } });
  assert(blockedResult.blocked === true, "dangerous command was not blocked");

  const processControl = skills.skills.get("process_control");
  const processResult = await processControl.run({ input: { action: "list" } });
  assert(processResult.action === "list", "process_control list action failed");

  const systemInfo = skills.skills.get("system_info");
  const info = await systemInfo.run({ input: { detail: "basic" } });
  assert(Boolean(info.platform), "system_info did not return platform");

  const claude = skills.skills.get("claude_code");
  const claudeStatus = await claude.run({ input: { action: "status" } });
  assert(claudeStatus.action === "status", "claude_code status action failed");

  if (isWindows) {
    const winPs = skills.skills.get("windows_powershell");
    const psResult = await winPs.run({ input: { command: "Write-Output 'test'" } });
    assert(psResult.ok === true, "windows_powershell failed");
    
    const winSvc = skills.skills.get("windows_services");
    const svcResult = await winSvc.run({ input: { action: "list" } });
    assert(svcResult.ok === true && svcResult.count > 0, "windows_services list failed");
    
    const winWinget = skills.skills.get("windows_winget");
    const wingetResult = await winWinget.run({ input: { action: "list" } });
    assert(wingetResult.ok === true, "windows_winget list failed");
  }

  console.log("Smoke test passed");
  console.log(`Platform: ${os.platform()}`);
  console.log(`Loaded skills (${ids.length}): ${ids.join(", ")}`);
}

main().catch((error) => {
  console.error(`Smoke test failed: ${String(error?.message || error)}`);
  process.exitCode = 1;
});
