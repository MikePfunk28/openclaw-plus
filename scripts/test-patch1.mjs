#!/usr/bin/env node

import { spawn } from "node:child_process";
import { parseArgs } from "node:util";

const args = parseArgs({
  options: {
    verbose: {
      type: "boolean",
      short: "v",
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
OpenClaw Plus Patch 1 Test Suite

Usage: node scripts/test-patch1.mjs [options]

Options:
  -v, --verbose    Show detailed output
  -h, --help       Show this help

This script tests:
  1. Server startup (no LSP crashes)
  2. Unified auth endpoints
  3. /api/capabilities endpoint
  4. /api/doctor endpoint
  5. /api/health/detailed endpoint
  6. Login and session token usage
`);
  process.exit(0);
}

const verbose = args.values.verbose;

let testsPassed = 0;
let testsFailed = 0;
let serverProcess = null;
const TEST_PORT = 8787;
const BASE_URL = `http://localhost:${TEST_PORT}`;

function log(message) {
  console.log(message);
}

function logVerbose(message) {
  if (verbose) {
    console.log(`  [verbose] ${message}`);
  }
}

function logTest(name, passed, details = null) {
  if (passed) {
    console.log(`  ✅ ${name}`);
    testsPassed++;
  } else {
    console.log(`  ❌ ${name}`);
    if (details) {
      console.log(`     ${details}`);
    }
    testsFailed++;
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}, timeout = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

async function startServer() {
  return new Promise((resolve, reject) => {
    log("\n📦 Starting test server...");

    serverProcess = spawn("node", ["server/index.mjs"], {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let hasStarted = false;

    serverProcess.stdout.on("data", (data) => {
      stdout += data.toString();
      logVerbose(`Server stdout: ${data.toString().trim()}`);

      if (stdout.includes(`running on http://localhost:${TEST_PORT}`)) {
        hasStarted = true;
        resolve({ success: true, stdout, stderr });
      }
    });

    serverProcess.stderr.on("data", (data) => {
      stderr += data.toString();
      logVerbose(`Server stderr: ${data.toString().trim()}`);
    });

    serverProcess.on("error", (error) => {
      if (!hasStarted) {
        reject({ success: false, error, stdout, stderr });
      }
    });

    serverProcess.on("exit", (code) => {
      if (!hasStarted) {
        reject({
          success: false,
          error: new Error(`Server exited with code ${code}`),
          stdout,
          stderr,
        });
      }
    });

    // Timeout if server doesn't start within 10 seconds
    setTimeout(() => {
      if (!hasStarted) {
        reject({
          success: false,
          error: new Error("Server startup timeout"),
          stdout,
          stderr,
        });
      }
    }, 10000);
  });
}

async function stopServer() {
  if (serverProcess) {
    logVerbose("Stopping server...");
    serverProcess.kill();
    await sleep(500);
  }
}

async function testHealthEndpoint() {
  try {
    const response = await fetchWithTimeout(`${BASE_URL}/api/health`);
    const data = await response.json();

    logTest(
      "Health endpoint returns ok",
      response.ok && data.ok === true && data.app === "openclaw-plus",
      JSON.stringify(data),
    );

    return response.ok;
  } catch (error) {
    logTest("Health endpoint", false, error.message);
    return false;
  }
}

async function testCapabilitiesEndpoint() {
  try {
    const response = await fetchWithTimeout(`${BASE_URL}/api/capabilities`);
    const data = await response.json();

    if (verbose) {
      console.log("\n  Capabilities response:");
      console.log(`    Status: ${response.status}`);
      console.log(`    Data: ${JSON.stringify(data).substring(0, 200)}...`);
    }

    if (!response.ok || !data.ok || !data.capabilities) {
      logTest(
        "Capabilities endpoint",
        false,
        `Status: ${response.status}, Data: ${JSON.stringify(data).substring(0, 100)}`,
      );
      return false;
    }

    const caps = data.capabilities;

    // Test structure
    logTest(
      "Capabilities has providers",
      caps.providers && typeof caps.providers === "object",
    );
    logTest(
      "Capabilities has auth info",
      caps.auth && typeof caps.auth === "object",
    );
    logTest(
      "Capabilities has skills info",
      caps.skills && typeof caps.skills === "object",
    );
    logTest(
      "Capabilities has adapters info",
      caps.adapters && typeof caps.adapters === "object",
    );
    logTest(
      "Capabilities has environment info",
      caps.environment && typeof caps.environment === "object",
    );
    logTest(
      "Capabilities has runtime info",
      caps.runtime && typeof caps.runtime === "object",
    );
    logTest(
      "Capabilities has security info",
      caps.security && typeof caps.security === "object",
    );

    if (verbose) {
      console.log("\n  Capabilities summary:");
      console.log(`    App: ${caps.app}`);
      console.log(`    Version: ${caps.version}`);
      console.log(`    Auth enabled: ${caps.auth?.enabled}`);
      console.log(`    Skills: ${caps.skills?.total}`);
      console.log(
        `    Providers configured: ${Object.values(caps.providers || {}).filter((p) => p.configured).length}`,
      );
    }

    return true;
  } catch (error) {
    logTest("Capabilities endpoint", false, error.message);
    return false;
  }
}

async function testDoctorEndpoint() {
  try {
    const response = await fetchWithTimeout(`${BASE_URL}/api/doctor`);
    const data = await response.json();

    if (verbose) {
      console.log("\n  Doctor response:");
      console.log(`    Status: ${response.status}`);
      console.log(`    Data: ${JSON.stringify(data).substring(0, 200)}...`);
    }

    if (!response.ok || !data.ok || !data.doctor) {
      logTest(
        "Doctor endpoint",
        false,
        `Status: ${response.status}, Data: ${JSON.stringify(data).substring(0, 100)}`,
      );
      return false;
    }

    const doctor = data.doctor;

    // Test structure
    logTest("Doctor has health status", typeof doctor.health === "string");
    logTest("Doctor has issues array", Array.isArray(doctor.issues));
    logTest("Doctor has warnings array", Array.isArray(doctor.warnings));
    logTest("Doctor has checks array", Array.isArray(doctor.checks));
    logTest("Doctor has capabilities", typeof doctor.capabilities === "object");

    if (verbose) {
      console.log("\n  Doctor summary:");
      console.log(`    Health: ${doctor.health}`);
      console.log(`    Issues: ${doctor.issues?.length || 0}`);
      console.log(`    Warnings: ${doctor.warnings?.length || 0}`);
      console.log(`    Checks: ${doctor.checks?.length || 0}`);
    }

    return true;
  } catch (error) {
    logTest("Doctor endpoint", false, error.message);
    return false;
  }
}

async function testDetailedHealthEndpoint() {
  try {
    const response = await fetchWithTimeout(`${BASE_URL}/api/health/detailed`);
    const data = await response.json();

    if (verbose) {
      console.log("\n  Detailed health response:");
      console.log(`    Status: ${response.status}`);
      console.log(`    Data: ${JSON.stringify(data)}`);
    }

    if (!response.ok || !data.ok || !data.health) {
      logTest(
        "Detailed health endpoint",
        false,
        `Status: ${response.status}, Data: ${JSON.stringify(data).substring(0, 100)}`,
      );
      return false;
    }

    const health = data.health;

    logTest("Detailed health has status", typeof health.status === "string");
    logTest(
      "Detailed health has timestamp",
      typeof health.timestamp === "string",
    );

    if (verbose) {
      console.log("\n  Detailed health:");
      console.log(`    Status: ${health.status}`);
      console.log(`    Providers: ${health.providers}`);
      console.log(`    Skills: ${health.skills}`);
      console.log(`    Auth: ${health.auth}`);
    }

    return true;
  } catch (error) {
    logTest("Detailed health endpoint", false, error.message);
    return false;
  }
}

async function testUnifiedAuth() {
  try {
    // Test 1: Try to login with default admin
    logVerbose("Testing login with default admin credentials...");
    const loginResponse = await fetchWithTimeout(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "admin@localhost",
        password: "admin123",
      }),
    });

    const loginData = await loginResponse.json();

    if (verbose) {
      console.log("\n  Login response details:");
      console.log(`    Status: ${loginResponse.status}`);
      console.log(`    OK: ${loginResponse.ok}`);
      console.log(`    Data: ${JSON.stringify(loginData)}`);
    }

    if (!loginResponse.ok || !loginData.success) {
      logTest("Unified auth login", false, loginData.error || "Login failed");
      return false;
    }

    logTest(
      "Unified auth login successful",
      true,
      `User: ${loginData.user?.email}`,
    );

    const sessionToken = loginData.token;
    if (!sessionToken) {
      logTest("Session token received", false, "No token in response");
      return false;
    }

    logTest("Session token received", true);

    // Test 2: Use session token to access protected endpoint
    logVerbose("Testing protected endpoint with session token...");
    logVerbose(`Using token: ${sessionToken.substring(0, 20)}...`);

    const meResponse = await fetchWithTimeout(`${BASE_URL}/api/me`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });

    if (verbose) {
      console.log("\n  Protected endpoint response:");
      console.log(`    Status: ${meResponse.status}`);
      console.log(`    OK: ${meResponse.ok}`);
    }

    if (!meResponse.ok) {
      const errorData = await meResponse.json();
      logTest(
        "Protected endpoint with session token",
        false,
        `Status: ${meResponse.status}, Error: ${JSON.stringify(errorData)}`,
      );
      return false;
    }

    const meData = await meResponse.json();

    if (verbose) {
      console.log(`    Response data: ${JSON.stringify(meData)}`);
    }

    logTest(
      "Protected endpoint accessible with session token",
      meData.user?.email === "admin@localhost",
      JSON.stringify(meData.user),
    );

    // Test 3: Validate session
    logVerbose("Testing session validation...");
    const validateResponse = await fetchWithTimeout(`${BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });

    const validateData = await validateResponse.json();
    logTest(
      "Session validation works",
      validateResponse.ok && validateData.user?.email === "admin@localhost",
      JSON.stringify(validateData.user),
    );

    return true;
  } catch (error) {
    logTest("Unified auth", false, error.message);
    return false;
  }
}

async function testLSPErrorHandling() {
  try {
    // Try to start a language server that doesn't exist
    logVerbose("Testing LSP error handling...");
    const response = await fetchWithTimeout(
      `${BASE_URL}/api/lsp/start`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverId: "typescript",
          projectRoot: process.cwd(),
        }),
      },
      3000,
    );

    // The request might fail (language server not installed)
    // but the server should still be running
    logVerbose(`LSP start response: ${response.status}`);

    // Wait a moment and check if server is still responsive
    await sleep(1000);
    const healthCheck = await fetchWithTimeout(`${BASE_URL}/api/health`);

    logTest(
      "Server handles LSP errors gracefully",
      healthCheck.ok,
      "Server crashed after LSP error",
    );

    return healthCheck.ok;
  } catch (error) {
    // Even if LSP test fails, server should still be running
    try {
      const healthCheck = await fetchWithTimeout(`${BASE_URL}/api/health`);
      logTest(
        "Server handles LSP errors gracefully",
        healthCheck.ok,
        "Server crashed after LSP error",
      );
      return healthCheck.ok;
    } catch {
      logTest("Server handles LSP errors gracefully", false, "Server crashed");
      return false;
    }
  }
}

async function runTests() {
  console.log("\n═══════════════════════════════════════");
  console.log("  OpenClaw Plus - Patch 1 Test Suite");
  console.log("═══════════════════════════════════════\n");

  try {
    // Start server
    const serverResult = await startServer();
    logTest("Server startup", serverResult.success);

    if (!serverResult.success) {
      console.log("\n❌ Server failed to start. Aborting tests.");
      if (verbose) {
        console.log("\nServer stdout:");
        console.log(serverResult.stdout);
        console.log("\nServer stderr:");
        console.log(serverResult.stderr);
      }
      process.exit(1);
    }

    // Wait for server to be fully ready
    await sleep(2000);

    // Run tests
    console.log("\n📋 Testing new endpoints...\n");
    await testHealthEndpoint();
    await testCapabilitiesEndpoint();
    await testDoctorEndpoint();
    await testDetailedHealthEndpoint();

    console.log("\n🔐 Testing unified auth...\n");
    await testUnifiedAuth();

    console.log("\n⚙️  Testing LSP error handling...\n");
    await testLSPErrorHandling();

    // Summary
    console.log("\n═══════════════════════════════════════");
    console.log("  Test Summary");
    console.log("═══════════════════════════════════════");
    console.log(`  ✅ Passed: ${testsPassed}`);
    console.log(`  ❌ Failed: ${testsFailed}`);
    console.log(`  📊 Total:  ${testsPassed + testsFailed}`);
    console.log("═══════════════════════════════════════\n");

    if (testsFailed === 0) {
      console.log("✅ All tests passed!\n");
    } else {
      console.log("⚠️  Some tests failed. Review the output above.\n");
    }
  } catch (error) {
    console.error("\n❌ Test suite error:", error.message);
    if (verbose) {
      console.error(error.stack);
    }
  } finally {
    await stopServer();
  }

  process.exit(testsFailed > 0 ? 1 : 0);
}

// Handle unhandled errors
process.on("unhandledRejection", (error) => {
  console.error("\n❌ Unhandled rejection:", error.message);
  if (verbose) {
    console.error(error.stack);
  }
  stopServer().then(() => process.exit(1));
});

process.on("SIGINT", async () => {
  console.log("\n\nInterrupted. Cleaning up...");
  await stopServer();
  process.exit(130);
});

// Run tests
runTests();
