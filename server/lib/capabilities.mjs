import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

async function which(cmd) {
  try {
    const whichCmd = process.platform === "win32" ? "where" : "which";
    const result = await execAsync(`${whichCmd} ${cmd}`);
    return result.stdout.trim().split("\n")[0];
  } catch {
    return null;
  }
}

export class CapabilitiesManager {
  constructor(config, options = {}) {
    this.config = config;
    this.models = options.models;
    this.skills = options.skills;
    this.mcp = options.mcp;
    this.userManager = options.userManager;
    this.integrationManager = options.integrationManager;
    this.rootDir = options.rootDir;
    this.lastCheck = null;
    this.cachedCapabilities = null;
  }

  async getCapabilities() {
    if (this.cachedCapabilities && Date.now() - this.lastCheck < 30000) {
      return this.cachedCapabilities;
    }

    const capabilities = {
      version: "1.0.0",
      app: "openclaw-plus",
      timestamp: new Date().toISOString(),
      providers: await this._checkProviders(),
      auth: this._checkAuth(),
      skills: this._checkSkills(),
      adapters: this._checkAdapters(),
      messaging: await this._checkMessaging(),
      integrations: await this._checkIntegrations(),
      environment: await this._checkEnvironment(),
      envTools: await this._checkEnvTools(),
      runtime: this._checkRuntime(),
      security: this._checkSecurity(),
    };

    this.cachedCapabilities = capabilities;
    this.lastCheck = Date.now();
    return capabilities;
  }

  async _checkProviders() {
    const providers = {
      anthropic: { configured: false, available: false, models: [] },
      openai: { configured: false, available: false, models: [] },
      gemini: { configured: false, available: false, models: [] },
      deepseek: { configured: false, available: false, models: [] },
      xai: { configured: false, available: false, models: [] },
      ollama: { configured: false, available: false, models: [] },
    };

    // Check environment variables
    if (process.env.ANTHROPIC_API_KEY) {
      providers.anthropic.configured = true;
      providers.anthropic.available = true; // Would need actual API call to verify
    }

    if (process.env.OPENAI_API_KEY) {
      providers.openai.configured = true;
      providers.openai.available = true;
    }

    if (process.env.GEMINI_API_KEY) {
      providers.gemini.configured = true;
      providers.gemini.available = true;
    }

    if (process.env.DEEPSEEK_API_KEY) {
      providers.deepseek.configured = true;
      providers.deepseek.available = true;
    }

    if (process.env.XAI_API_KEY) {
      providers.xai.configured = true;
      providers.xai.available = true;
    }

    // Check Ollama (local)
    try {
      const response = await fetch("http://localhost:11434/api/tags", {
        method: "GET",
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        providers.ollama.configured = true;
        providers.ollama.available = true;
        const data = await response.json();
        providers.ollama.models = (data.models || []).map((m) => m.name);
      }
    } catch {
      // Ollama not running
    }

    // Get models from registry
    if (this.models) {
      const registeredModels = this.models.publicModels();
      registeredModels.forEach((model) => {
        const providerKey = model.provider?.toLowerCase();
        if (providers[providerKey]) {
          providers[providerKey].models.push({
            id: model.id,
            label: model.label,
          });
        }
      });
    }

    return providers;
  }

  _checkAuth() {
    const authConfig = this.config?.auth || {};
    const modes = [];

    if (authConfig.mode === "jwt") {
      modes.push("jwt");
    }

    if (authConfig.users && authConfig.users.length > 0) {
      modes.push("token");
    }

    if (
      this.userManager &&
      this.userManager.users &&
      this.userManager.users.size > 0
    ) {
      modes.push("session");
    }

    const enabled = modes.length > 0;

    return {
      enabled,
      modes,
      userCount: this.userManager?.users?.size || 0,
      hasDefaultAdmin: enabled,
    };
  }

  _checkSkills() {
    const localSkills = this.skills?.publicSkills() || [];
    const mcpTools = this.mcp?.publicTools() || [];

    return {
      local: localSkills.length,
      mcp: mcpTools.length,
      total: localSkills.length + mcpTools.length,
      categories: this._categorizeSkills(localSkills),
    };
  }

  _categorizeSkills(skills) {
    const categories = {};

    skills.forEach((skill) => {
      let category = "general";

      if (skill.id.includes("windows") || skill.id.includes("powershell")) {
        category = "windows";
      } else if (skill.id.includes("aws") || skill.id.includes("azure")) {
        category = "cloud";
      } else if (skill.id.includes("database") || skill.id.includes("git")) {
        category = "developer";
      } else if (skill.id.includes("web") || skill.id.includes("http")) {
        category = "network";
      } else if (skill.id.includes("ml") || skill.id.includes("training")) {
        category = "ml";
      }

      categories[category] = (categories[category] || 0) + 1;
    });

    return categories;
  }

  _checkAdapters() {
    const adapters = {
      telegram: { available: false, configured: false },
      discord: { available: false, configured: false },
      rabbitmq: { available: false, configured: false },
      websocket: { available: true, configured: true },
    };

    if (process.env.TELEGRAM_BOT_TOKEN) {
      adapters.telegram.configured = true;
      adapters.telegram.available = true;
    }

    if (process.env.DISCORD_BOT_TOKEN) {
      adapters.discord.configured = true;
      adapters.discord.available = true;
    }

    if (process.env.RABBITMQ_URL) {
      adapters.rabbitmq.configured = true;
      adapters.rabbitmq.url = process.env.RABBITMQ_URL.replace(
        /:[^@]*@/,
        ":****@",
      );
    }

    return adapters;
  }

  async _checkRabbitMQ() {
    const url = process.env.RABBITMQ_URL || "amqp://guest:guest@localhost:5672";
    const configured = !!process.env.RABBITMQ_URL;

    let amqplibInstalled = false;
    try {
      await import("amqplib");
      amqplibInstalled = true;
    } catch {
      amqplibInstalled = false;
    }

    let reachable = false;
    if (amqplibInstalled) {
      try {
        const amqplib = await import("amqplib");
        const conn = await amqplib.connect(url, { heartbeat: 5 });
        await conn.close();
        reachable = true;
      } catch {
        reachable = false;
      }
    }

    return {
      configured,
      amqplibInstalled,
      reachable,
      url: url.replace(/:[^@]*@/, ":****@"),
      fix: !amqplibInstalled
        ? "npm install amqplib"
        : !configured
          ? "Set RABBITMQ_URL environment variable"
          : !reachable
            ? "Start RabbitMQ: docker run -d -p 5672:5672 -p 15672:15672 rabbitmq:management"
            : null,
    };
  }

  async _checkEnvTools() {
    const toolChecks = {
      python: (await which("python")) || (await which("python3")),
      pip: (await which("pip")) || (await which("pip3")),
      conda: (await which("conda")) || (await which("mamba")),
      node: await which("node"),
      npm: await which("npm"),
      npx: await which("npx"),
      docker: await which("docker"),
      kubectl: await which("kubectl"),
      cargo: await which("cargo"),
      wasmPack: await which("wasm-pack"),
      git: await which("git"),
    };

    const tools = Object.fromEntries(
      Object.entries(toolChecks).map(([k, v]) => [
        k,
        { available: !!v, path: v || null },
      ]),
    );

    // Get versions for key tools
    const versions = {};
    if (tools.node.available) {
      try {
        versions.node = (await execAsync("node --version")).stdout.trim();
      } catch {}
    }
    if (tools.python.available) {
      try {
        versions.python = (
          await execAsync("python --version 2>&1")
        ).stdout.trim();
      } catch {}
    }
    if (tools.docker.available) {
      try {
        versions.docker = (await execAsync("docker --version")).stdout.trim();
      } catch {}
    }

    return { tools, versions };
  }

  async _checkMessaging() {
    const rabbitMQ = await this._checkRabbitMQ();
    return {
      rabbitmq: rabbitMQ,
    };
  }

  async _checkIntegrations() {
    const integrations = {
      configured: 0,
      active: 0,
      types: [],
    };

    if (this.integrationManager) {
      const allIntegrations = this.integrationManager.listIntegrations();
      integrations.configured = allIntegrations.length;
      integrations.types = this.integrationManager.listIntegrationTypes();
    }

    return integrations;
  }

  async _checkEnvironment() {
    const env = {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      cwd: process.cwd(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      missingEnvVars: [],
    };

    // Check for common missing env vars
    const requiredVars = [];
    const optionalVars = [
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
      "GEMINI_API_KEY",
      "DEEPSEEK_API_KEY",
      "XAI_API_KEY",
    ];

    const configuredVars = optionalVars.filter((v) => process.env[v]);
    env.configuredProviders = configuredVars.length;

    return env;
  }

  _checkRuntime() {
    return {
      websocket: { enabled: true },
      rest: { enabled: true },
      jsonRpc: { enabled: true },
      mcp: { enabled: true, servers: this.mcp?.servers?.size || 0 },
    };
  }

  _checkSecurity() {
    const security = {
      cors: !!this.config?.security?.cors,
      rateLimit: !!this.config?.security?.rateLimit,
      authRequired: this._checkAuth().enabled,
      toolPolicies: !!this.config?.security?.toolInputPolicies,
      guardrails: false,
    };

    return security;
  }

  async runDoctor() {
    const capabilities = await this.getCapabilities();
    const issues = [];
    const warnings = [];
    const checks = [];

    // Check providers
    const providerKeys = Object.keys(capabilities.providers);
    const configuredProviders = providerKeys.filter(
      (k) => capabilities.providers[k].configured,
    );

    if (configuredProviders.length === 0) {
      issues.push({
        severity: "error",
        category: "providers",
        message:
          "No AI providers configured. Set at least one API key (ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.)",
        fix: "Add API keys to environment or config",
      });
    } else {
      checks.push({
        status: "ok",
        category: "providers",
        message: `${configuredProviders.length} provider(s) configured: ${configuredProviders.join(", ")}`,
      });
    }

    // Check auth
    if (!capabilities.auth.enabled) {
      warnings.push({
        severity: "warning",
        category: "auth",
        message:
          "Authentication is disabled. All requests will use default admin access.",
        fix: "Configure auth users or JWT in config",
      });
    } else {
      checks.push({
        status: "ok",
        category: "auth",
        message: `Authentication enabled with modes: ${capabilities.auth.modes.join(", ")}`,
      });
    }

    // Check skills
    if (capabilities.skills.total === 0) {
      warnings.push({
        severity: "warning",
        category: "skills",
        message: "No skills loaded. Check server/skills directory.",
        fix: "Verify skill files exist and are properly formatted",
      });
    } else {
      checks.push({
        status: "ok",
        category: "skills",
        message: `${capabilities.skills.total} skills loaded (${capabilities.skills.local} local, ${capabilities.skills.mcp} MCP)`,
      });
    }

    // Check adapters
    const adapterKeys = Object.keys(capabilities.adapters);
    const configuredAdapters = adapterKeys.filter(
      (k) => capabilities.adapters[k].configured,
    );

    checks.push({
      status: "ok",
      category: "adapters",
      message: `${configuredAdapters.length} adapter(s) configured: ${configuredAdapters.join(", ")}`,
    });

    // Check Ollama
    if (!capabilities.providers.ollama.available) {
      warnings.push({
        severity: "info",
        category: "providers",
        message: "Ollama not detected. Local models will not be available.",
        fix: "Install and start Ollama for local model support",
      });
    }

    // Check RabbitMQ
    if (!capabilities.messaging?.rabbitmq?.configured) {
      warnings.push({
        severity: "info",
        category: "messaging",
        message:
          "RabbitMQ not configured. Message queuing will not be available.",
        fix: "Set RABBITMQ_URL environment variable",
      });
    } else if (!capabilities.messaging?.rabbitmq?.reachable) {
      warnings.push({
        severity: "warning",
        category: "messaging",
        message: "RabbitMQ is configured but not reachable.",
        fix:
          capabilities.messaging?.rabbitmq?.fix ||
          "Check RabbitMQ server status",
      });
    } else {
      checks.push({
        status: "ok",
        category: "messaging",
        message: "RabbitMQ connected and reachable",
      });
    }

    // Check amqplib
    if (!capabilities.messaging?.rabbitmq?.amqplibInstalled) {
      warnings.push({
        severity: "info",
        category: "messaging",
        message: "amqplib not installed. RabbitMQ support requires it.",
        fix: "npm install amqplib",
      });
    }

    // Check env tools
    const envTools = capabilities.envTools?.tools || {};
    const missingCritical = [];
    if (!envTools.node?.available) missingCritical.push("node");
    if (!envTools.npm?.available) missingCritical.push("npm");

    if (missingCritical.length > 0) {
      issues.push({
        severity: "error",
        category: "env_tools",
        message: `Critical tools missing: ${missingCritical.join(", ")}`,
        fix: "Install Node.js from https://nodejs.org",
      });
    } else {
      const availableTools = Object.entries(envTools)
        .filter(([, v]) => v.available)
        .map(([k]) => k);
      checks.push({
        status: "ok",
        category: "env_tools",
        message: `${availableTools.length} dev tools available: ${availableTools.join(", ")}`,
      });
    }

    const health = issues.length === 0 ? "healthy" : "issues";

    return {
      health,
      issues,
      warnings,
      checks,
      capabilities,
      timestamp: new Date().toISOString(),
    };
  }

  async quickHealthCheck() {
    try {
      const providers = await this._checkProviders();
      const configuredCount = Object.values(providers).filter(
        (p) => p.configured,
      ).length;

      return {
        status: configuredCount > 0 ? "ok" : "degraded",
        providers: configuredCount,
        skills:
          (this.skills?.publicSkills()?.length || 0) +
          (this.mcp?.publicTools()?.length || 0),
        auth: this._checkAuth().enabled,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: "error",
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
