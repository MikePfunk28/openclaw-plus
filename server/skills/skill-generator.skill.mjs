import { writeFile, mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";

export const skill = {
  id: "skill_generator",
  name: "Skill Generator",
  description: "Create, modify, and manage OpenClaw skills. Can generate new skills from descriptions, list existing skills, and update skill code.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["create", "list", "read", "update", "delete", "generate"],
        description: "Action to perform"
      },
      skillId: {
        type: "string",
        description: "Skill ID (for read/update/delete)"
      },
      name: {
        type: "string",
        description: "Skill name (for create)"
      },
      description: {
        type: "string",
        description: "Skill description (for create)"
      },
      inputSchema: {
        type: "object",
        description: "JSON Schema for skill input (for create)",
        additionalProperties: true
      },
      code: {
        type: "string",
        description: "Skill run function code (for create/update)"
      },
      prompt: {
        type: "string",
        description: "Natural language description of what the skill should do (for generate)"
      }
    },
    required: ["action"],
    additionalProperties: false
  },
  async run({ input, workspaceRoot }) {
    const action = input?.action;
    const skillsDir = path.join(workspaceRoot, "server", "skills");

    switch (action) {
      case "list": {
        const files = await readdir(skillsDir).catch(() => []);
        const skills = files
          .filter(f => f.endsWith(".skill.mjs"))
          .map(f => f.replace(".skill.mjs", ""));
        return { ok: true, action: "list", count: skills.length, skills };
      }

      case "read": {
        const skillId = input?.skillId;
        if (!skillId) throw new Error("skillId is required");
        
        const skillPath = path.join(skillsDir, `${skillId}.skill.mjs`);
        if (!existsSync(skillPath)) {
          return { ok: false, error: `Skill not found: ${skillId}` };
        }
        
        const code = await readFile(skillPath, "utf8");
        return { ok: true, action: "read", skillId, code };
      }

      case "create":
      case "generate": {
        const skillId = input?.skillId || generateSkillId(input?.name);
        const name = input?.name || skillId;
        const description = input?.description || `Skill: ${name}`;
        const schema = input?.inputSchema || { type: "object", properties: {}, additionalProperties: false };
        
        let code = input?.code;
        
        if (!code && input?.prompt) {
          code = generateSkillCode(skillId, name, description, schema, input.prompt);
        } else if (!code) {
          code = generateBasicSkillCode(skillId, name, description, schema);
        }
        
        const skillPath = path.join(skillsDir, `${skillId}.skill.mjs`);
        
        if (existsSync(skillPath) && action === "create") {
          return { ok: false, error: `Skill already exists: ${skillId}. Use update to modify.` };
        }
        
        await mkdir(skillsDir, { recursive: true });
        await writeFile(skillPath, code, "utf8");
        
        return {
          ok: true,
          action: "create",
          skillId,
          path: skillPath,
          message: `Skill ${skillId} created. Restart server to load it.`
        };
      }

      case "update": {
        const skillId = input?.skillId;
        const code = input?.code;
        
        if (!skillId || !code) {
          throw new Error("skillId and code are required for update");
        }
        
        const skillPath = path.join(skillsDir, `${skillId}.skill.mjs`);
        if (!existsSync(skillPath)) {
          return { ok: false, error: `Skill not found: ${skillId}` };
        }
        
        await writeFile(skillPath, code, "utf8");
        
        return {
          ok: true,
          action: "update",
          skillId,
          path: skillPath,
          message: `Skill ${skillId} updated. Restart server to apply changes.`
        };
      }

      case "delete": {
        const skillId = input?.skillId;
        if (!skillId) throw new Error("skillId is required");
        
        const skillPath = path.join(skillsDir, `${skillId}.skill.mjs`);
        if (!existsSync(skillPath)) {
          return { ok: false, error: `Skill not found: ${skillId}` };
        }
        
        const { unlink } = await import("node:fs/promises");
        await unlink(skillPath);
        
        return {
          ok: true,
          action: "delete",
          skillId,
          message: `Skill ${skillId} deleted. Restart server to apply.`
        };
      }

      default:
        throw new Error(`Unsupported action: ${action}`);
    }
  }
};

function generateSkillId(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40) || `skill_${Date.now()}`;
}

function generateBasicSkillCode(skillId, name, description, schema) {
  const schemaJson = JSON.stringify(schema, null, 4);
  
  return `export const skill = {
  id: "${skillId}",
  name: "${name}",
  description: "${description}",
  inputSchema: ${schemaJson},
  async run({ input }) {
    // TODO: Implement skill logic
    return {
      ok: true,
      message: "Skill ${skillId} executed",
      input
    };
  }
};
`;
}

function generateSkillCode(skillId, name, description, schema, prompt) {
  const schemaJson = JSON.stringify(schema, null, 4);
  const props = Object.keys(schema?.properties || {});
  
  let paramHandling = "";
  if (props.length > 0) {
    paramHandling = props.map(p => `const ${p} = input?.${p};`).join("\n    ");
  }
  
  return `// Auto-generated skill: ${name}
// Prompt: ${prompt}

export const skill = {
  id: "${skillId}",
  name: "${name}",
  description: "${description}",
  inputSchema: ${schemaJson},
  async run({ input }) {
    ${paramHandling}
    
    // Implementation based on: ${prompt}
    // Add your logic here
    
    return {
      ok: true,
      message: "Skill executed successfully",
      input
    };
  }
};
`;
}
