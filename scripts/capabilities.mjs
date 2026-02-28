#!/usr/bin/env node

import { parseArgs } from "node:util";

const DEFAULT_URL = process.env.OPENCLAW_URL || "http://localhost:8787";

const args = parseArgs({
  options: {
    url: {
      type: "string",
      short: "u",
      default: DEFAULT_URL,
    },
    json: {
      type: "boolean",
      short: "j",
      default: false,
    },
    category: {
      type: "string",
      short: "c",
      default: null,
    },
    help: {
      type: "boolean",
      short: "h",
      default: false,
    },
  },
  allowPositionals: true,
});

if (args.values.help) {
  console.log(`
OpenClaw Plus Capabilities - System Information

Usage: node scripts/capabilities.mjs [options]

Options:
  -u, --url <url>       Server URL (default: ${DEFAULT_URL})
  -j, --json            Output raw JSON
  -c, --category <cat>  Show specific category (providers, auth, skills, adapters, environment)
  -h, --help            Show this help

Environment:
  OPENCLAW_URL          Default server URL if not specified

Examples:
  node scripts/capabilities.mjs
  node scripts/capabilities.mjs --category providers
  node scripts/capabilities.mjs --json
`);
  process.exit(0);
}

const serverUrl = args.values.url;
const outputJson = args.values.json;
const category = args.values.category;

async function getCapabilities() {
  try {
    // Check if server is reachable
    const healthCheck = await fetch(`${serverUrl}/api/health`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!healthCheck.ok) {
      console.error("❌ Server health check failed");
      process.exit(1);
    }

    // Get capabilities
    const response = await fetch(`${serverUrl}/api/capabilities`, {
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Capabilities endpoint failed: ${response.status} ${errorText}`);
      process.exit(1);
    }

    const data = await response.json();
    const capabilities = data.capabilities;

    if (outputJson) {
      if (category && capabilities[category]) {
        console.log(JSON.stringify(capabilities[category], null, 2));
      } else {
        console.log(JSON.stringify(capabilities, null, 2));
      }
      process.exit(0);
    }

    // Format output
    console.log("📋 OpenClaw Plus Capabilities\n");
    console.log(`App: ${capabilities.app}`);
    console.log(`Version: ${capabilities.version}`);
    console.log(`Timestamp: ${capabilities.timestamp}\n`);

    // Show specific category if requested
    if (category) {
      if (!capabilities[category]) {
        console.error(`❌ Unknown category: ${category}`);
        console.error(`Valid categories: ${Object.keys(capabilities).join(', ')}`);
        process.exit(1);
      }
      displayCategory(category, capabilities[category]);
      process.exit(0);
    }

    // Show all categories
    displayAllCapabilities(capabilities);
    process.exit(0);

  } catch (error) {
    if (error.name === "AbortError") {
      console.error(`❌ Connection timeout: Could not reach server at ${serverUrl}`);
      console.error("\n💡 Make sure the server is running:");
      console.error("   npm run dev");
      console.error("   # or");
      console.error("   npm start\n");
    } else if (error.code === "ECONNREFUSED") {
      console.error(`❌ Connection refused: Server not running at ${serverUrl}`);
      console.error("\n💡 Start the server with:");
      console.error("   npm run dev\n");
    } else {
      console.error(`❌ Error getting capabilities: ${error.message}\n`);
    }
    process.exit(1);
  }
}

function displayAllCapabilities(capabilities) {
  // Providers
  console.log("═══════════════════════════════════════");
  console.log("🤖 AI PROVIDERS\n");
  displayProviders(capabilities.providers);

  // Auth
  console.log("═══════════════════════════════════════");
  console.log("🔐 AUTHENTICATION\n");
  displayAuth(capabilities.auth);

  // Skills
  console.log("═══════════════════════════════════════");
  console.log("⚡ SKILLS\n");
  displaySkills(capabilities.skills);

  // Adapters
  console.log("═══════════════════════════════════════");
  console.log("🔌 ADAPTERS\n");
  displayAdapters(capabilities.adapters);

  // Integrations
  console.log("═══════════════════════════════════════");
  console.log("🔗 INTEGRATIONS\n");
  displayIntegrations(capabilities.integrations);

  // Environment
  console.log("═══════════════════════════════════════");
  console.log("🖥️  ENVIRONMENT\n");
  displayEnvironment(capabilities.environment);

  // Runtime
  console.log("═══════════════════════════════════════");
  console.log("⚙️  RUNTIME\n");
  displayRuntime(capabilities.runtime);

  // Security
  console.log("═══════════════════════════════════════");
  console.log("🛡️  SECURITY\n");
  displaySecurity(capabilities.security);
}

function displayCategory(categoryName, categoryData) {
  switch (categoryName) {
    case 'providers':
      displayProviders(categoryData);
      break;
    case 'auth':
      displayAuth(categoryData);
      break;
    case 'skills':
      displaySkills(categoryData);
      break;
    case 'adapters':
      displayAdapters(categoryData);
      break;
    case 'integrations':
      displayIntegrations(categoryData);
      break;
    case 'environment':
      displayEnvironment(categoryData);
      break;
    case 'runtime':
      displayRuntime(categoryData);
      break;
    case 'security':
      displaySecurity(categoryData);
      break;
    default:
      console.log(JSON.stringify(categoryData, null, 2));
  }
}

function displayProviders(providers) {
  const providerList = Object.entries(providers || {});

  if (providerList.length === 0) {
    console.log("  No providers configured\n");
    return;
  }

  providerList.forEach(([name, config]) => {
    const status = config.configured ? "✅" : "❌";
    const available = config.available ? "🟢" : "🔴";
    console.log(`  ${status} ${name.padEnd(12)} ${available}`);

    if (config.models && config.models.length > 0) {
      config.models.forEach(model => {
        console.log(`     • ${model.id} (${model.label})`);
      });
    }

    if (name === 'ollama' && config.models) {
      console.log(`     Local models: ${config.models.length}`);
    }
  });
  console.log();
}

function displayAuth(auth) {
  console.log(`  Enabled: ${auth.enabled ? "✅ Yes" : "❌ No"}`);
  console.log(`  Modes: ${auth.modes.length > 0 ? auth.modes.join(', ') : 'none'}`);
  console.log(`  Users: ${auth.userCount}`);
  console.log(`  Default Admin: ${auth.hasDefaultAdmin ? "✅ Yes" : "❌ No"}`);
  console.log();
}

function displaySkills(skills) {
  console.log(`  Total: ${skills.total}`);
  console.log(`  Local: ${skills.local}`);
  console.log(`  MCP: ${skills.mcp}`);

  if (skills.categories && Object.keys(skills.categories).length > 0) {
    console.log("\n  Categories:");
    Object.entries(skills.categories).forEach(([category, count]) => {
      console.log(`    • ${category}: ${count}`);
    });
  }
  console.log();
}

function displayAdapters(adapters) {
  const adapterList = Object.entries(adapters || {});

  adapterList.forEach(([name, config]) => {
    const status = config.configured ? "✅" : "❌";
    const available = config.available ? "🟢" : "🔴";
    console.log(`  ${status} ${name.padEnd(12)} ${available}`);
  });
  console.log();
}

function displayIntegrations(integrations) {
  console.log(`  Configured: ${integrations.configured}`);
  console.log(`  Active: ${integrations.active}`);

  if (integrations.types && integrations.types.length > 0) {
    console.log("\n  Available Types:");
    integrations.types.forEach(type => {
      console.log(`    • ${type}`);
    });
  }
  console.log();
}

function displayEnvironment(env) {
  console.log(`  Platform: ${env.platform}`);
  console.log(`  Architecture: ${env.arch}`);
  console.log(`  Node Version: ${env.nodeVersion}`);
  console.log(`  Uptime: ${Math.floor(env.uptime)}s`);
  console.log(`  Working Directory: ${env.cwd}`);
  console.log(`  Configured Providers: ${env.configuredProviders}`);

  if (env.memory) {
    const mb = (bytes) => Math.round(bytes / 1024 / 1024);
    console.log(`  Memory:`);
    console.log(`    RSS: ${mb(env.memory.rss)}MB`);
    console.log(`    Heap Total: ${mb(env.memory.heapTotal)}MB`);
    console.log(`    Heap Used: ${mb(env.memory.heapUsed)}MB`);
  }
  console.log();
}

function displayRuntime(runtime) {
  console.log(`  WebSocket: ${runtime.websocket.enabled ? "✅ Enabled" : "❌ Disabled"}`);
  console.log(`  REST API: ${runtime.rest.enabled ? "✅ Enabled" : "❌ Disabled"}`);
  console.log(`  JSON-RPC: ${runtime.jsonRpc.enabled ? "✅ Enabled" : "❌ Disabled"}`);
  console.log(`  MCP: ${runtime.mcp.enabled ? "✅ Enabled" : "❌ Disabled"} (${runtime.mcp.servers} servers)`);
  console.log();
}

function displaySecurity(security) {
  console.log(`  CORS: ${security.cors ? "✅ Enabled" : "❌ Disabled"}`);
  console.log(`  Rate Limit: ${security.rateLimit ? "✅ Enabled" : "❌ Disabled"}`);
  console.log(`  Auth Required: ${security.authRequired ? "✅ Yes" : "❌ No"}`);
  console.log(`  Tool Policies: ${security.toolPolicies ? "✅ Enabled" : "❌ Disabled"}`);
  console.log(`  Guardrails: ${security.guardrails ? "✅ Enabled" : "❌ Disabled"}`);
  console.log();
}

getCapabilities();
