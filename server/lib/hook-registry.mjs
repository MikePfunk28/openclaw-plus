import path from "node:path";
import { readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export class HookRegistry {
  constructor(hookDir) {
    this.hookDir = hookDir;
    this.hooks = [];
  }

  async load() {
    let entries = [];
    try {
      entries = await readdir(this.hookDir, { withFileTypes: true });
    } catch {
      this.hooks = [];
      return;
    }

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".hook.mjs")) {
        continue;
      }

      const fullPath = path.join(this.hookDir, entry.name);
      const mod = await import(pathToFileURL(fullPath).href);
      const hook = mod.hook;
      if (!hook?.id || typeof hook?.run !== "function") {
        continue;
      }

      this.hooks.push({
        id: hook.id,
        description: hook.description || "",
        events: Array.isArray(hook.events) ? hook.events : [],
        run: hook.run
      });
    }
  }

  async emit(event) {
    for (const hook of this.hooks) {
      if (hook.events.length > 0 && !hook.events.includes(event.type)) {
        continue;
      }

      try {
        await hook.run(event);
      } catch {
        // keep hook failures isolated
      }
    }
  }

  publicHooks() {
    return this.hooks.map((hook) => ({
      id: hook.id,
      description: hook.description,
      events: hook.events
    }));
  }
}
