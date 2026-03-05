import { promisify } from "node:util";
import { exec as execCb } from "node:child_process";
import { detectHfMcp, loadVsCodeMcpConfig } from "./vscode-mcp.mjs";

const exec = promisify(execCb);

const PROVIDERS = [
  { id: "openai", env: ["OPENAI_API_KEY"] },
  { id: "anthropic", env: ["ANTHROPIC_API_KEY"] },
  { id: "google", env: ["GOOGLE_API_KEY", "GEMINI_API_KEY"] },
  { id: "huggingface", env: ["HUGGINGFACE_HUB_TOKEN", "HF_TOKEN"] },
  { id: "kaggle", env: ["KAGGLE_USERNAME", "KAGGLE_KEY"] },
  { id: "together", env: ["TOGETHER_API_KEY"] },
  { id: "replicate", env: ["REPLICATE_API_TOKEN"] },
  { id: "fireworks", env: ["FIREWORKS_API_KEY"] },
  { id: "cohere", env: ["COHERE_API_KEY"] }
];

async function runCheck(command, timeout = 5000) {
  try {
    const { stdout, stderr } = await exec(command, { timeout, windowsHide: true, maxBuffer: 1024 * 1024 });
    return { ok: true, stdout: (stdout || "").trim(), stderr: (stderr || "").trim() };
  } catch (error) {
    return {
      ok: false,
      error: String(error?.message || error),
      stdout: (error?.stdout || "").trim(),
      stderr: (error?.stderr || "").trim()
    };
  }
}

function providerStatusFromEnv(env) {
  return PROVIDERS.map((provider) => {
    const presentKeys = provider.env.filter((key) => Boolean(env[key]));
    return {
      id: provider.id,
      connected: presentKeys.length > 0,
      presentKeys,
      missingKeys: presentKeys.length > 0 ? [] : provider.env
    };
  });
}

export async function getConnectionStatus() {
  const providerStatus = providerStatusFromEnv(process.env);
  const vscodeMcp = await loadVsCodeMcpConfig();
  const hfMcp = detectHfMcp(vscodeMcp);

  const checks = await Promise.all([
    runCheck("openclaw --version"),
    runCheck("gh auth status"),
    runCheck("huggingface-cli whoami"),
    runCheck("kaggle config view"),
    runCheck("gcloud auth list --filter=status:ACTIVE --format=value(account)"),
    runCheck("wsl --status")
  ]);

  const [openclaw, github, huggingface, kaggle, gcloud, wsl] = checks;

  return {
    connected: providerStatus.some((p) => p.connected) || Boolean(hfMcp?.configured),
    providers: providerStatus,
    vscodeMcp: {
      loaded: vscodeMcp.ok,
      path: vscodeMcp.path,
      serverCount: Object.keys(vscodeMcp.servers || {}).length,
      hfMcp
    },
    tools: {
      openclaw: {
        installed: openclaw.ok,
        authenticated: openclaw.ok,
        detail: openclaw.ok ? openclaw.stdout : openclaw.error
      },
      github: {
        installed: !/not recognized|command not found/i.test(github.error || ""),
        authenticated: github.ok,
        detail: github.ok ? github.stdout : github.error
      },
      huggingface: {
        installed: !/not recognized|command not found/i.test(huggingface.error || ""),
        authenticated: huggingface.ok,
        detail: huggingface.ok ? huggingface.stdout : huggingface.error
      },
      kaggle: {
        installed: !/not recognized|command not found/i.test(kaggle.error || ""),
        authenticated: kaggle.ok,
        detail: kaggle.ok ? kaggle.stdout : kaggle.error
      },
      gcloud: {
        installed: !/not recognized|command not found/i.test(gcloud.error || ""),
        authenticated: gcloud.ok && Boolean(gcloud.stdout),
        detail: gcloud.ok ? gcloud.stdout : gcloud.error
      },
      wsl: {
        installed: wsl.ok,
        detail: wsl.ok ? wsl.stdout : wsl.error
      }
    },
    checkedAt: new Date().toISOString()
  };
}
