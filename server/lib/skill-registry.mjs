import path from "node:path";
import { readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export class SkillRegistry {
  constructor(skillDir, workspaceRoot) {
    this.skillDir = skillDir;
    this.workspaceRoot = workspaceRoot;
    this.skills = new Map();
  }

  async load() {
    const files = await readdir(this.skillDir, { withFileTypes: true });

    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith(".skill.mjs")) {
        continue;
      }

      const fullPath = path.join(this.skillDir, file.name);
      const mod = await import(pathToFileURL(fullPath).href);
      const skill = mod.skill;

      if (!skill?.id || typeof skill?.run !== "function") {
        continue;
      }

      this.skills.set(skill.id, {
        ...skill,
        run: (args) => skill.run({ ...args, workspaceRoot: this.workspaceRoot })
      });
    }
  }

  publicSkills() {
    return [...this.skills.values()].map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      inputSchema: skill.inputSchema,
      source: "local"
    }));
  }

  toolsFor(enabledIds) {
    if (!Array.isArray(enabledIds) || enabledIds.length === 0) {
      return [...this.skills.values()];
    }

    const enabledSet = new Set(enabledIds);
    return [...this.skills.values()].filter((skill) => enabledSet.has(skill.id));
  }
}
