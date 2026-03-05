import { promisify } from "node:util";
import { exec as execCb } from "node:child_process";
import { detectHfMcp, loadVsCodeMcpConfig } from "../lib/vscode-mcp.mjs";

const exec = promisify(execCb);

async function run(command, timeout = 30000) {
  const { stdout, stderr } = await exec(command, { timeout, windowsHide: true, maxBuffer: 5 * 1024 * 1024 });
  return { stdout: (stdout || "").trim(), stderr: (stderr || "").trim() };
}

export const skill = {
  id: "huggingface",
  name: "Hugging Face",
  description: "Hugging Face auth, dataset search/download, and model discovery.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["status", "login", "whoami", "search_datasets", "download_dataset", "search_models", "mcp_status", "mcp_probe"],
        description: "Action to perform"
      },
      token: { type: "string", description: "Hugging Face access token (for login)" },
      query: { type: "string", description: "Search query" },
      dataset: { type: "string", description: "Dataset id, e.g. squad" },
      split: { type: "string", description: "Dataset split", default: "train" },
      output: { type: "string", description: "Output path for downloaded dataset" }
    },
    required: ["action"],
    additionalProperties: false
  },
  async run({ input }) {
    const action = input?.action;
    try {
      switch (action) {
        case "mcp_status": {
          const cfg = await loadVsCodeMcpConfig();
          const hf = detectHfMcp(cfg);
          return { ok: true, action, vscodeMcpLoaded: cfg.ok, hfMcp: hf };
        }
        case "mcp_probe": {
          const cfg = await loadVsCodeMcpConfig();
          const hf = detectHfMcp(cfg);
          if (!hf?.configured || !hf?.url) {
            return { ok: false, error: "HF MCP server not configured in VS Code mcp.json" };
          }
          const token = input?.token || process.env.HF_TOKEN || process.env.HUGGINGFACE_HUB_TOKEN;
          if (!token) {
            return { ok: false, error: "HF token missing. Set HF_TOKEN or pass token input." };
          }
          const response = await fetch(hf.url, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`
            }
          });
          return {
            ok: response.ok,
            action,
            status: response.status,
            statusText: response.statusText,
            url: hf.url
          };
        }
        case "status":
        case "whoami": {
          const result = await run("huggingface-cli whoami");
          return { ok: true, action, ...result };
        }
        case "login": {
          if (!input?.token) {
            return { ok: false, error: "token is required" };
          }
          const cmd = `huggingface-cli login --token ${JSON.stringify(input.token)} --add-to-git-credential`;
          const result = await run(cmd);
          return { ok: true, action, ...result };
        }
        case "search_datasets": {
          const q = input?.query || "";
          const result = await run(`python -c "from huggingface_hub import list_datasets; import json; print(json.dumps([d.id for d in list_datasets(search=${JSON.stringify(q)}, limit=20)]))"`);
          return { ok: true, action, query: q, result: result.stdout };
        }
        case "search_models": {
          const q = input?.query || "";
          const result = await run(`python -c "from huggingface_hub import list_models; import json; print(json.dumps([m.id for m in list_models(search=${JSON.stringify(q)}, limit=20)]))"`);
          return { ok: true, action, query: q, result: result.stdout };
        }
        case "download_dataset": {
          if (!input?.dataset) return { ok: false, error: "dataset is required" };
          const split = input?.split || "train";
          const output = input?.output || "hf_dataset.jsonl";
          const cmd = `python -c "from datasets import load_dataset; ds=load_dataset(${JSON.stringify(input.dataset)}, split=${JSON.stringify(split)}); ds.to_json(${JSON.stringify(output)}); print('saved:${output}')"`;
          const result = await run(cmd, 120000);
          return { ok: true, action, dataset: input.dataset, split, output, ...result };
        }
        default:
          return { ok: false, error: `Unknown action: ${action}` };
      }
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }
};
