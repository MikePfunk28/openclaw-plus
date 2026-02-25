import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export const SETUP_WIZARD = {
  steps: [
    {
      id: "welcome",
      title: "Welcome to OpenClaw Plus",
      description: "Let's set up your AI agent control plane",
      fields: []
    },
    {
      id: "ai_providers",
      title: "AI Providers",
      description: "Configure your AI model providers",
      fields: [
        { name: "anthropic", label: "Anthropic (Claude)", type: "api_key", envVar: "ANTHROPIC_API_KEY", models: ["claude-opus-4.6", "claude-sonnet-4.6", "claude-haiku-3.5"] },
        { name: "openai", label: "OpenAI (GPT)", type: "api_key", envVar: "OPENAI_API_KEY", models: ["gpt-5.3", "gpt-5.3-codex", "gpt-5.3-mini", "o3"] },
        { name: "google", label: "Google (Gemini)", type: "api_key", envVar: "GOOGLE_API_KEY", models: ["gemini-3.1-pro", "gemini-3.1-flash", "veo-3.1", "lyria-3.1"] },
        { name: "deepseek", label: "DeepSeek", type: "api_key", envVar: "DEEPSEEK_API_KEY", models: ["deepseek-3.2", "deepseek-r1", "deepseek-coder"] },
        { name: "zhipu", label: "GLM / Zhipu", type: "api_key", envVar: "ZHIPU_API_KEY", models: ["glm-5", "glm-5-plus"] },
        { name: "mistral", label: "Mistral", type: "api_key", envVar: "MISTRAL_API_KEY", models: ["mistral-large-3", "codestral-3"] },
        { name: "cohere", label: "Cohere", type: "api_key", envVar: "COHERE_API_KEY", models: ["command-a"] },
        { name: "xai", label: "X.AI (Grok)", type: "api_key", envVar: "XAI_API_KEY", models: ["grok-3"] },
        { name: "minimax", label: "MiniMax", type: "api_key", envVar: "MINIMAX_API_KEY", models: ["minimax-2.5"] },
        { name: "together", label: "Together AI", type: "api_key", envVar: "TOGETHER_API_KEY", models: ["llama-4-maverick", "llama-4-scout", "qwen-3-72b"] }
      ]
    },
    {
      id: "local_ai",
      title: "Local AI",
      description: "Configure local AI runtimes (optional)",
      fields: [
        { name: "ollama", label: "Ollama", type: "url", envVar: "OLLAMA_HOST", default: "http://localhost:11434", check: "/api/tags" },
        { name: "vllm", label: "vLLM", type: "url", envVar: "VLLM_API_URL", default: "http://localhost:8000" },
        { name: "lmstudio", label: "LM Studio", type: "url", envVar: "LMSTUDIO_URL", default: "http://localhost:1234" }
      ]
    },
    {
      id: "databases",
      title: "Databases",
      description: "Connect your databases",
      fields: [
        { name: "postgresql", label: "PostgreSQL", type: "connection_string", envVar: "PG_CONNECTION_STRING", format: "postgresql://user:pass@host:port/db" },
        { name: "mysql", label: "MySQL", type: "connection_string", envVar: "MYSQL_CONNECTION_STRING", format: "mysql://user:pass@host:port/db" },
        { name: "mongodb", label: "MongoDB", type: "connection_string", envVar: "MONGODB_URI", format: "mongodb://user:pass@host:port/db" },
        { name: "redis", label: "Redis", type: "connection_string", envVar: "REDIS_URL", format: "redis://host:port" }
      ]
    },
    {
      id: "cloud_storage",
      title: "Cloud Storage",
      description: "Configure cloud storage providers",
      fields: [
        { name: "aws", label: "AWS (S3, etc.)", type: "credentials", envVars: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"] },
        { name: "gcp", label: "Google Cloud", type: "file", envVar: "GOOGLE_APPLICATION_CREDENTIALS", format: "path/to/service-account.json" },
        { name: "azure", label: "Azure", type: "connection_string", envVar: "AZURE_STORAGE_CONNECTION_STRING" }
      ]
    },
    {
      id: "services",
      title: "Backend Services",
      description: "Connect backend services",
      fields: [
        { name: "supabase", label: "Supabase", type: "credentials", envVars: ["SUPABASE_URL", "SUPABASE_SERVICE_KEY"] },
        { name: "convex", label: "Convex", type: "api_key", envVar: "CONVEX_DEPLOY_KEY" },
        { name: "vercel", label: "Vercel", type: "api_key", envVar: "VERCEL_TOKEN" },
        { name: "clerk", label: "Clerk Auth", type: "credentials", envVars: ["CLERK_SECRET_KEY", "CLERK_PUBLISHABLE_KEY"] }
      ]
    },
    {
      id: "default_model",
      title: "Default Model",
      description: "Choose your default AI model",
      fields: [
        { name: "defaultModel", label: "Default Model", type: "select", options: [
          { value: "claude-sonnet-4.6", label: "Claude Sonnet 4.6 (Recommended)" },
          { value: "claude-opus-4.6", label: "Claude Opus 4.6 (Most Capable)" },
          { value: "gpt-5.3", label: "GPT-5.3" },
          { value: "gemini-3.1-pro", label: "Gemini 3.1 Pro" },
          { value: "deepseek-3.2", label: "DeepSeek 3.2" }
        ]},
        { name: "codingModel", label: "Coding Model", type: "select", options: [
          { value: "gpt-5.3-codex", label: "GPT-5.3 Codex" },
          { value: "claude-sonnet-4.6", label: "Claude Sonnet 4.6" },
          { value: "deepseek-coder", label: "DeepSeek Coder" },
          { value: "codestral-3", label: "Codestral 3" }
        ]},
        { name: "quickModel", label: "Fast/Cheap Model", type: "select", options: [
          { value: "claude-haiku-3.5", label: "Claude Haiku 3.5" },
          { value: "gpt-5.3-mini", label: "GPT-5.3 Mini" },
          { value: "gemini-3.1-flash", label: "Gemini 3.1 Flash" }
        ]}
      ]
    },
    {
      id: "security",
      title: "Security",
      description: "Configure security settings",
      fields: [
        { name: "enableGuardrails", label: "Enable Guardrails", type: "boolean", default: true },
        { name: "enableTelemetry", label: "Enable Telemetry", type: "boolean", default: true },
        { name: "enableRateLimit", label: "Enable Rate Limiting", type: "boolean", default: true },
        { name: "authToken", label: "API Auth Token (optional)", type: "text", envVar: "OPENCLAW_AUTH_TOKEN" }
      ]
    },
    {
      id: "complete",
      title: "Setup Complete!",
      description: "Your OpenClaw Plus is ready to use",
      fields: []
    }
  ]
};

export class SetupWizard {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.envPath = path.join(rootDir, ".env");
    this.configPath = path.join(rootDir, "server", "config.json");
  }

  getSteps() {
    return SETUP_WIZARD.steps.map(s => ({
      id: s.id,
      title: s.title,
      description: s.description,
      fieldCount: s.fields.length
    }));
  }

  getStep(stepId) {
    return SETUP_WIZARD.steps.find(s => s.id === stepId);
  }

  async saveEnv(values) {
    let envContent = "";
    
    if (existsSync(this.envPath)) {
      envContent = await readFile(this.envPath, "utf-8");
    }

    for (const [key, value] of Object.entries(values)) {
      if (!value) continue;
      
      const regex = new RegExp(`^${key}=.*$`, "m");
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${value}`);
      } else {
        envContent += `\n${key}=${value}`;
      }
    }

    await writeFile(this.envPath, envContent.trim() + "\n");
    return { ok: true };
  }

  async testConnection(type, config) {
    switch (type) {
      case "ollama":
        try {
          const response = await fetch(`${config.url || "http://localhost:11434"}/api/tags`);
          const data = await response.json();
          return { ok: true, models: data.models?.map(m => m.name) || [] };
        } catch (error) {
          return { ok: false, error: error.message };
        }
      
      case "postgresql":
        try {
          const { Pool } = await import("pg");
          const pool = new Pool({ connectionString: config.connectionString });
          const result = await pool.query("SELECT 1");
          await pool.end();
          return { ok: true };
        } catch (error) {
          return { ok: false, error: error.message };
        }
      
      case "mongodb":
        try {
          const { MongoClient } = await import("mongodb");
          const client = new MongoClient(config.connectionString);
          await client.connect();
          await client.close();
          return { ok: true };
        } catch (error) {
          return { ok: false, error: error.message };
        }
      
      case "redis":
        try {
          const { createClient } = await import("redis");
          const client = createClient({ url: config.connectionString });
          await client.connect();
          await client.ping();
          await client.disconnect();
          return { ok: true };
        } catch (error) {
          return { ok: false, error: error.message };
        }
      
      default:
        return { ok: false, error: "Unknown connection type" };
    }
  }

  async quickSetup(provider, apiKey, options = {}) {
    const envValues = {};
    
    switch (provider) {
      case "anthropic":
        envValues.ANTHROPIC_API_KEY = apiKey;
        break;
      case "openai":
        envValues.OPENAI_API_KEY = apiKey;
        break;
      case "google":
        envValues.GOOGLE_API_KEY = apiKey;
        break;
      case "deepseek":
        envValues.DEEPSEEK_API_KEY = apiKey;
        break;
      case "zhipu":
        envValues.ZHIPU_API_KEY = apiKey;
        break;
      case "mistral":
        envValues.MISTRAL_API_KEY = apiKey;
        break;
      case "cohere":
        envValues.COHERE_API_KEY = apiKey;
        break;
      case "xai":
        envValues.XAI_API_KEY = apiKey;
        break;
    }

    if (options.defaultModel) {
      envValues.OPENCLAW_DEFAULT_MODEL = options.defaultModel;
    }

    await this.saveEnv(envValues);
    
    return {
      ok: true,
      message: `${provider} configured successfully`,
      envVars: Object.keys(envValues)
    };
  }

  async detectLocalServices() {
    const services = [];

    const endpoints = [
      { name: "Ollama", url: "http://localhost:11434/api/tags", type: "ollama" },
      { name: "vLLM", url: "http://localhost:8000/v1/models", type: "vllm" },
      { name: "LM Studio", url: "http://localhost:1234/v1/models", type: "lmstudio" },
      { name: "LocalAI", url: "http://localhost:8080/v1/models", type: "localai" },
      { name: "TextGen WebUI", url: "http://localhost:7860/api/v1/model", type: "textgen" }
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint.url, { method: "GET", signal: AbortSignal.timeout(2000) });
        if (response.ok) {
          services.push({
            name: endpoint.name,
            type: endpoint.type,
            url: endpoint.url.replace(/\/api\/.*|\/v1\/.*/, ""),
            status: "running"
          });
        }
      } catch {
        // Service not running
      }
    }

    return services;
  }

  generateEnvTemplate() {
    return `# OpenClaw Plus Environment Configuration
# Copy this file to .env and fill in your values

# ============== AI PROVIDERS ==============
# Anthropic (Claude Opus 4.6, Sonnet 4.6, Haiku 3.5)
ANTHROPIC_API_KEY=

# OpenAI (GPT-5.3, GPT-5.3 Codex, o3)
OPENAI_API_KEY=

# Google (Gemini 3.1 Pro/Flash, Veo 3.1, Lyria 3.1)
GOOGLE_API_KEY=

# DeepSeek (DeepSeek 3.2, R1, Coder)
DEEPSEEK_API_KEY=

# GLM / Zhipu AI (GLM 5)
ZHIPU_API_KEY=

# Mistral (Mistral Large 3, Codestral 3)
MISTRAL_API_KEY=

# Cohere (Command A)
COHERE_API_KEY=

# X.AI (Grok 3)
XAI_API_KEY=

# MiniMax (MiniMax 2.5)
MINIMAX_API_KEY=

# Together AI (Llama 4, Qwen 3)
TOGETHER_API_KEY=

# ============== LOCAL AI ==============
# Ollama
OLLAMA_HOST=http://localhost:11434

# vLLM
VLLM_API_URL=http://localhost:8000
VLLM_API_KEY=

# LM Studio
LMSTUDIO_URL=http://localhost:1234

# ============== DATABASES ==============
# PostgreSQL
PG_CONNECTION_STRING=

# MySQL
MYSQL_CONNECTION_STRING=

# MongoDB
MONGODB_URI=

# Redis
REDIS_URL=

# ============== CLOUD STORAGE ==============
# AWS
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1

# Google Cloud
GOOGLE_APPLICATION_CREDENTIALS=
GCP_PROJECT_ID=

# Azure
AZURE_STORAGE_CONNECTION_STRING=

# ============== BACKEND SERVICES ==============
# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_KEY=

# Convex
CONVEX_DEPLOY_KEY=

# Vercel
VERCEL_TOKEN=

# Clerk Auth
CLERK_SECRET_KEY=
CLERK_PUBLISHABLE_KEY=

# ============== OBSERVABILITY ==============
# Langfuse
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=

# Helicone
HELICONE_API_KEY=

# PostHog
POSTHOG_API_KEY=
POSTHOG_PROJECT_ID=

# ============== SECURITY ==============
# Optional auth token for API access
OPENCLAW_AUTH_TOKEN=

# ============== SETTINGS ==============
OPENCLAW_DEFAULT_MODEL=claude-sonnet-4.6
`;
  }
}

export const setupWizard = new SetupWizard(".");
