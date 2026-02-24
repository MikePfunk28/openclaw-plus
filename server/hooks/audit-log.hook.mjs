import path from "node:path";
import { appendFile, mkdir } from "node:fs/promises";

async function writeAudit(event) {
  const rootDir = event?.context?.rootDir;
  if (!rootDir) {
    return;
  }
  const logDir = path.join(rootDir, "data", "audit");
  const logPath = path.join(logDir, "events.log");
  await mkdir(logDir, { recursive: true });
  await appendFile(logPath, `${JSON.stringify(event)}\n`, "utf8");
}

export const hook = {
  id: "audit_log",
  description: "Append lifecycle events to audit log",
  events: ["session_created", "run_started", "run_completed", "inbound_message", "model_attempt"],
  async run(event) {
    await writeAudit({
      timestamp: new Date().toISOString(),
      type: event.type,
      userId: event.userId,
      sessionId: event.sessionId,
      routeKey: event.routeKey,
      details: event.details || {},
      context: {
        rootDir: event.context?.rootDir
      }
    });
  }
};
