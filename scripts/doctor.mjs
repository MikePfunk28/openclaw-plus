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
OpenClaw Plus Doctor - System Diagnostics

Usage: node scripts/doctor.mjs [options]

Options:
  -u, --url <url>    Server URL (default: ${DEFAULT_URL})
  -j, --json         Output raw JSON
  -h, --help         Show this help

Environment:
  OPENCLAW_URL       Default server URL if not specified
`);
  process.exit(0);
}

const serverUrl = args.values.url;
const outputJson = args.values.json;

async function runDoctor() {
  console.log("🔍 Running OpenClaw Plus system diagnostics...\n");

  try {
    // First check if server is reachable
    const healthCheck = await fetch(`${serverUrl}/api/health`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!healthCheck.ok) {
      console.error("❌ Server health check failed");
      process.exit(1);
    }

    // Run doctor diagnostics
    const response = await fetch(`${serverUrl}/api/doctor`, {
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Doctor endpoint failed: ${response.status} ${errorText}`);
      process.exit(1);
    }

    const data = await response.json();
    const doctor = data.doctor;

    if (outputJson) {
      console.log(JSON.stringify(doctor, null, 2));
      process.exit(0);
    }

    // Format output
    console.log(`📊 System Health: ${doctor.health.toUpperCase()}`);
    console.log(`📅 Timestamp: ${doctor.timestamp}\n`);

    // Show issues
    if (doctor.issues && doctor.issues.length > 0) {
      console.log("❌ ISSUES FOUND:\n");
      doctor.issues.forEach((issue, index) => {
        console.log(`  ${index + 1}. [${issue.severity.toUpperCase()}] ${issue.category}`);
        console.log(`     ${issue.message}`);
        if (issue.fix) {
          console.log(`     💡 Fix: ${issue.fix}`);
        }
        console.log();
      });
    }

    // Show warnings
    if (doctor.warnings && doctor.warnings.length > 0) {
      console.log("⚠️  WARNINGS:\n");
      doctor.warnings.forEach((warning, index) => {
        console.log(`  ${index + 1}. [${warning.severity.toUpperCase()}] ${warning.category}`);
        console.log(`     ${warning.message}`);
        if (warning.fix) {
          console.log(`     💡 Fix: ${warning.fix}`);
        }
        console.log();
      });
    }

    // Show checks
    if (doctor.checks && doctor.checks.length > 0) {
      console.log("✅ CHECKS PASSED:\n");
      doctor.checks.forEach((check, index) => {
        const statusIcon = check.status === "ok" ? "✓" : "?";
        console.log(`  ${statusIcon} [${check.category}] ${check.message}`);
      });
      console.log();
    }

    // Show capabilities summary
    if (doctor.capabilities) {
      const caps = doctor.capabilities;
      console.log("📋 CAPABILITIES SUMMARY:\n");
      console.log(`  Version: ${caps.version}`);
      console.log(`  App: ${caps.app}`);
      console.log(`  Platform: ${caps.environment?.platform || "unknown"}`);
      console.log(`  Node: ${caps.environment?.nodeVersion || "unknown"}`);
      console.log(`  Auth: ${caps.auth?.enabled ? "Enabled" : "Disabled"}`);
      console.log(`  Skills: ${caps.skills?.total || 0} loaded`);
      console.log(`  Providers: ${Object.values(caps.providers || {}).filter(p => p.configured).length} configured`);
      console.log(`  Adapters: ${Object.values(caps.adapters || {}).filter(a => a.configured).length} configured`);
      console.log();
    }

    // Exit with appropriate code
    if (doctor.health === "healthy") {
      console.log("✅ System is healthy\n");
      process.exit(0);
    } else if (doctor.issues && doctor.issues.length > 0) {
      console.log("❌ System has issues that need attention\n");
      process.exit(1);
    } else {
      console.log("⚠️  System is operational but has warnings\n");
      process.exit(0);
    }

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
      console.error(`❌ Error running diagnostics: ${error.message}\n`);
      if (args.values.verbose) {
        console.error(error.stack);
      }
    }
    process.exit(1);
  }
}

runDoctor();
