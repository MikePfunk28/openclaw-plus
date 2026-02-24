import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const DEFAULT_DB = {
  sessions: []
};

function nowIso() {
  return new Date().toISOString();
}

export class SessionStore {
  constructor(rootDir) {
    this.filePath = path.join(rootDir, "data", "store.json");
    this.data = null;
    this.writeQueue = Promise.resolve();
  }

  async load() {
    const dir = path.dirname(this.filePath);
    await mkdir(dir, { recursive: true });

    try {
      const raw = await readFile(this.filePath, "utf8");
      this.data = JSON.parse(raw);
    } catch {
      this.data = structuredClone(DEFAULT_DB);
      await this.flush();
    }
  }

  async flush() {
    this.writeQueue = this.writeQueue.then(() =>
      writeFile(this.filePath, JSON.stringify(this.data, null, 2), "utf8")
    );
    await this.writeQueue;
  }

  listSessions({ userId }) {
    return this.data.sessions
      .filter((session) => session.userId === userId)
      .map((session) => ({
        id: session.id,
        agentId: session.agentId,
        routeKey: session.routeKey,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        settings: session.settings,
        memory: session.memory
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  createSession({ userId, title, settings, agentId = "main", routeKey = null, source = null }) {
    const timestamp = nowIso();
    const session = {
      id: randomUUID(),
      userId,
      agentId,
      routeKey,
      source,
      title: title || "Untitled Task",
      createdAt: timestamp,
      updatedAt: timestamp,
      messages: [],
      trace: [],
      memory: {
        summary: "",
        facts: []
      },
      settings: {
        maxSteps: 8,
        maxCycles: 4,
        autonomyMode: "continuous",
        approvalMode: "never",
        ...settings
      }
    };

    this.data.sessions.push(session);
    return session;
  }

  getOrCreateByRoute({ userId, agentId, routeKey, title, settings, source }) {
    const existing = this.data.sessions.find(
      (session) =>
        session.userId === userId &&
        session.agentId === agentId &&
        session.routeKey === routeKey
    );

    if (existing) {
      return existing;
    }

    return this.createSession({
      userId,
      title,
      settings,
      agentId,
      routeKey,
      source
    });
  }

  getSession({ userId, sessionId }) {
    return (
      this.data.sessions.find((session) => session.userId === userId && session.id === sessionId) ||
      null
    );
  }

  appendMessages({ userId, sessionId, messages }) {
    const session = this.getSession({ userId, sessionId });
    if (!session) {
      return null;
    }

    session.messages.push(...messages);
    session.updatedAt = nowIso();
    return session;
  }

  updateAfterRun({ userId, sessionId, trace, memory }) {
    const session = this.getSession({ userId, sessionId });
    if (!session) {
      return null;
    }

    session.trace = trace;
    session.memory = memory;
    session.updatedAt = nowIso();
    return session;
  }
}
