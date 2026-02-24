import path from "node:path";
import { readdir, readFile, writeFile } from "node:fs/promises";

function assertPathInWorkspace(workspaceRoot, unsafePath) {
  const resolved = path.resolve(workspaceRoot, unsafePath);
  if (!resolved.startsWith(workspaceRoot)) {
    throw new Error("Path escapes workspace root");
  }
  return resolved;
}

export const skill = {
  id: "workspace_files",
  name: "Workspace Files",
  description: "List, read, and write files inside the workspace.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "read", "write"]
      },
      target: {
        type: "string",
        description: "Relative path in workspace"
      },
      content: {
        type: "string",
        description: "Text content for write action"
      }
    },
    required: ["action", "target"],
    additionalProperties: false
  },
  async run({ input, workspaceRoot }) {
    const action = input?.action;
    const target = input?.target;

    if (!action || !target) {
      throw new Error("action and target are required");
    }

    const fullPath = assertPathInWorkspace(workspaceRoot, target);

    if (action === "list") {
      const items = await readdir(fullPath, { withFileTypes: true });
      return {
        path: target,
        entries: items.map((item) => ({
          name: item.name,
          type: item.isDirectory() ? "dir" : "file"
        }))
      };
    }

    if (action === "read") {
      const text = await readFile(fullPath, "utf8");
      return {
        path: target,
        content: text
      };
    }

    if (action === "write") {
      await writeFile(fullPath, String(input?.content ?? ""), "utf8");
      return {
        path: target,
        written: true,
        size: String(input?.content ?? "").length
      };
    }

    throw new Error(`Unsupported action: ${action}`);
  }
};
