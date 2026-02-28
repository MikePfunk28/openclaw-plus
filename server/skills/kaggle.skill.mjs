import { promisify } from "node:util";
import { exec as execCb } from "node:child_process";

const exec = promisify(execCb);

async function run(command, timeout = 60000) {
  const { stdout, stderr } = await exec(command, { timeout, windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
  return { stdout: (stdout || "").trim(), stderr: (stderr || "").trim() };
}

export const skill = {
  id: "kaggle",
  name: "Kaggle",
  description: "Kaggle auth, datasets listing, and downloads via Kaggle CLI.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["status", "configure", "list_datasets", "download_dataset", "list_competitions", "download_competition"],
        description: "Action to perform"
      },
      username: { type: "string", description: "Kaggle username" },
      key: { type: "string", description: "Kaggle API key" },
      query: { type: "string", description: "Dataset search query" },
      dataset: { type: "string", description: "Dataset ref user/dataset" },
      competition: { type: "string", description: "Competition slug" },
      output: { type: "string", description: "Download directory" }
    },
    required: ["action"],
    additionalProperties: false
  },
  async run({ input }) {
    const action = input?.action;
    try {
      switch (action) {
        case "status": {
          const result = await run("kaggle config view");
          return { ok: true, action, ...result };
        }
        case "configure": {
          const username = input?.username;
          const key = input?.key;
          if (!username || !key) {
            return { ok: false, error: "username and key are required" };
          }
          process.env.KAGGLE_USERNAME = username;
          process.env.KAGGLE_KEY = key;
          return { ok: true, action, message: "Kaggle credentials set for current process" };
        }
        case "list_datasets": {
          const q = input?.query || "";
          const result = await run(`kaggle datasets list -s ${JSON.stringify(q)} --csv`);
          return { ok: true, action, query: q, result: result.stdout };
        }
        case "download_dataset": {
          if (!input?.dataset) return { ok: false, error: "dataset is required" };
          const out = input?.output || "./data/kaggle";
          const result = await run(`kaggle datasets download -d ${JSON.stringify(input.dataset)} -p ${JSON.stringify(out)} --unzip`, 180000);
          return { ok: true, action, dataset: input.dataset, output: out, ...result };
        }
        case "list_competitions": {
          const result = await run("kaggle competitions list --csv");
          return { ok: true, action, result: result.stdout };
        }
        case "download_competition": {
          if (!input?.competition) return { ok: false, error: "competition is required" };
          const out = input?.output || "./data/kaggle";
          const result = await run(`kaggle competitions download -c ${JSON.stringify(input.competition)} -p ${JSON.stringify(out)}`, 180000);
          return { ok: true, action, competition: input.competition, output: out, ...result };
        }
        default:
          return { ok: false, error: `Unknown action: ${action}` };
      }
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }
};
