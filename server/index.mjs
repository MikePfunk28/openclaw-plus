import "dotenv/config";
import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";
import { ModelRegistry } from "./lib/model-registry.mjs";
import { SkillRegistry } from "./lib/skill-registry.mjs";
import { McpRegistry } from "./lib/mcp-registry.mjs";
import { SessionStore } from "./lib/session-store.mjs";
import { runAutonomousTask } from "./lib/autonomous-runner.mjs";
import { buildAuth } from "./lib/auth.mjs";
import { checkToolPermission } from "./lib/tool-policy.mjs";
import { Router } from "./lib/router.mjs";
import { HookRegistry } from "./lib/hook-registry.mjs";
import { securityMiddleware } from "./lib/security.mjs";
import { startTelegramAdapter } from "./adapters/telegram.mjs";
import { startDiscordAdapter } from "./adapters/discord.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

async function loadConfig() {
  const configPath = path.join(__dirname, "config.json");
  const fallbackPath = path.join(__dirname, "config.example.json");

  try {
    const content = await readFile(configPath, "utf8");
    return JSON.parse(content);
  } catch {
    const fallback = await readFile(fallbackPath, "utf8");
    return JSON.parse(fallback);
  }
}

const app = express();
app.use(express.json({ limit: "2mb" }));

const config = await loadConfig();
const auth = buildAuth(config);
const models = new ModelRegistry(config.models ?? [], {
  failoverOn: config.agent?.failoverOn
});
const skills = new SkillRegistry(path.join(__dirname, "skills"), rootDir);
await skills.load();
const mcp = new McpRegistry(config.mcpServers ?? []);
await mcp.load();
const store = new SessionStore(rootDir);
await store.load();
const router = new Router(config);
const hooks = new HookRegistry(path.join(__dirname, "hooks"));
await hooks.load();
const security = securityMiddleware(config);
const adapterHandles = [];

app.locals.securityMode = security.mode;
app.use(security.cors);
app.use(security.headers);
app.use(security.rateLimit);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "openclaw-plus" });
});

app.use("/api", (req, res, next) => {
  if (req.path.startsWith("/inbound/")) {
    next();
    return;
  }
  auth.middleware(req, res, next);
});

app.get("/api/me", (req, res) => {
  res.json({
    user: {
      id: req.auth.userId,
      name: req.auth.name,
      role: req.auth.role,
      policy: req.auth.policy
    }
  });
});

app.get("/api/models", (_req, res) => {
  res.json({ models: models.publicModels() });
});

app.get("/api/skills", (_req, res) => {
  res.json({
    skills: [...skills.publicSkills(), ...mcp.publicTools()],
    warnings: mcp.loadErrors
  });
});

app.post("/api/skills/:skillId/invoke", async (req, res) => {
  const skillId = req.params.skillId;
  const input = req.body ?? {};

  const allSkills = [...skills.toolsFor(), ...mcp.toolsFor()];
  const skill = allSkills.find((s) => s.id === skillId);

  if (!skill) {
    res.status(404).json({ error: `Skill not found: ${skillId}` });
    return;
  }

  const policyResult = checkToolPermission({
    toolId: skillId,
    input,
    policy: {
      approvalMode: req.auth?.policy?.approvalMode || "never",
      allowPatterns: req.auth?.policy?.allowPatterns || ["*"],
      denyPatterns: req.auth?.policy?.denyPatterns || [],
      inputPolicies: config?.security?.toolInputPolicies || {}
    }
  });

  if (!policyResult.ok) {
    res.status(403).json({ error: policyResult.reason });
    return;
  }

  try {
    const result = await skill.run({ input, workspaceRoot: rootDir });
    res.json({ ok: true, skillId, result });
  } catch (error) {
    res.status(500).json({ ok: false, skillId, error: String(error?.message || error) });
  }
});

app.get("/api/hooks", (_req, res) => {
  res.json({ hooks: hooks.publicHooks() });
});

import { expertAdapter } from "./lib/expert-adapter.mjs";

app.get("/api/experts", (_req, res) => {
  res.json({ experts: expertAdapter.listExperts() });
});

app.get("/api/experts/:domainId", (req, res) => {
  const expert = expertAdapter.getExpert(req.params.domainId);
  if (!expert) {
    res.status(404).json({ error: "Expert not found" });
    return;
  }
  res.json({ expert });
});

app.post("/api/sessions/:sessionId/expert", (req, res) => {
  const { sessionId } = req.params;
  const { domainId } = req.body;
  
  if (!domainId) {
    res.status(400).json({ error: "domainId is required" });
    return;
  }
  
  try {
    const expert = expertAdapter.setExpert(sessionId, domainId);
    res.json({ ok: true, expert });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/sessions/:sessionId/expert", (req, res) => {
  const expert = expertAdapter.getExpert(req.params.sessionId);
  res.json({ expert });
});

app.post("/api/experts/detect", (req, res) => {
  const { query } = req.body;
  if (!query) {
    res.status(400).json({ error: "query is required" });
    return;
  }
  
  import("./lib/expert-router.mjs").then(({ expertRouter }) => {
    const domainId = expertRouter.detectDomain(query);
    const expert = expertRouter.getExpert(domainId);
    res.json({ domainId, expert });
  });
});

import { workflowEngine } from "./lib/industry-workflows.mjs";

app.get("/api/workflows", (_req, res) => {
  res.json({ industries: workflowEngine.getAllIndustries() });
});

app.get("/api/workflows/:industryId", (req, res) => {
  const workflows = workflowEngine.getIndustryWorkflows(req.params.industryId);
  const templates = workflowEngine.getTemplates(req.params.industryId);
  res.json({ workflows, templates });
});

app.get("/api/workflows/:industryId/:workflowId", (req, res) => {
  const workflow = workflowEngine.getWorkflow(req.params.industryId, req.params.workflowId);
  if (!workflow) {
    res.status(404).json({ error: "Workflow not found" });
    return;
  }
  res.json({ workflow });
});

app.post("/api/workflows/:industryId/:workflowId/execute", (req, res) => {
  const workflow = workflowEngine.getWorkflow(req.params.industryId, req.params.workflowId);
  if (!workflow) {
    res.status(404).json({ error: "Workflow not found" });
    return;
  }
  const inputs = req.body || {};
  const execution = workflowEngine.executeWorkflow(workflow, inputs);
  res.json({ execution });
});

app.get("/api/onboarding/:industryId", (req, res) => {
  const onboarding = workflowEngine.getOnboarding(req.params.industryId);
  if (!onboarding) {
    res.status(404).json({ error: "Onboarding not found" });
    return;
  }
  res.json({ onboarding });
});

import { WrapperGenerator, INDUSTRY_THEMES } from "./lib/wrapper-generator.mjs";

const wrapperGen = new WrapperGenerator(path.join(rootDir, "wrappers"));

app.get("/api/wrappers/industries", (_req, res) => {
  res.json({ industries: wrapperGen.listAvailableIndustries() });
});

app.get("/api/wrappers/themes", (_req, res) => {
  res.json({ themes: INDUSTRY_THEMES });
});

app.post("/api/wrappers/generate", async (req, res) => {
  const { industryId, name, domain, pricing } = req.body;
  
  if (!industryId) {
    res.status(400).json({ error: "industryId is required" });
    return;
  }
  
  try {
    const result = await wrapperGen.generateWrapper(industryId, { name, domain, pricing });
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

import { adapterRegistry } from "./lib/industry-adapters.mjs";

app.get("/api/adapters", (_req, res) => {
  res.json({ industries: adapterRegistry.listIndustries() });
});

app.get("/api/adapters/:industryId", (req, res) => {
  const adapters = adapterRegistry.getIndustryAdapters(req.params.industryId);
  res.json({ adapters });
});

app.get("/api/adapters/:industryId/:adapterId", (req, res) => {
  const config = adapterRegistry.getAdapterConfig(req.params.industryId, req.params.adapterId);
  if (!config) {
    res.status(404).json({ error: "Adapter not found" });
    return;
  }
  const envCheck = adapterRegistry.checkEnvConfigured(req.params.industryId, req.params.adapterId);
  res.json({ adapter: config, envConfigured: envCheck.configured, missingEnv: envCheck.missing });
});

app.post("/api/adapters/:industryId/:adapterId/:endpoint", async (req, res) => {
  const { industryId, adapterId, endpoint } = req.params;
  const params = req.body || {};
  
  try {
    const result = await adapterRegistry.callAdapter(industryId, adapterId, endpoint, params);
    res.json({ ok: true, result });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

import { TerraformExecutor } from "./lib/terraform-executor.mjs";

const terraformExec = new TerraformExecutor(rootDir);

app.post("/api/terraform/init", async (req, res) => {
  const config = req.body;
  try {
    const result = await terraformExec.init(config);
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/terraform/plan", async (req, res) => {
  const config = req.body;
  try {
    const result = await terraformExec.plan(config);
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/terraform/apply", async (req, res) => {
  const config = req.body;
  try {
    const result = await terraformExec.apply(config);
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/terraform/destroy", async (req, res) => {
  const { targets } = req.body;
  try {
    const result = await terraformExec.destroy(targets);
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

import { getAllAdapters, listAllAdapters } from "./lib/universal-adapters.mjs";

app.get("/api/universal-adapters", (_req, res) => {
  res.json({ adapters: listAllAdapters() });
});

app.get("/api/universal-adapters/:category", (req, res) => {
  const adapters = getAllAdapters()[req.params.category];
  if (!adapters) {
    res.status(404).json({ error: "Category not found" });
    return;
  }
  res.json({ adapters });
});

import { telemetry, wrapModelCall } from "./lib/ai-telemetry.mjs";
import { guardrails, GUARDRAILS, applyAwsGuardrails } from "./lib/guardrails.mjs";
import { SERVICE_PROVISIONING, AI_SERVICES, AI_SDKS, listServiceCategories } from "./lib/service-provisioning.mjs";

app.get("/api/telemetry/metrics", (_req, res) => {
  res.json({ metrics: telemetry.getMetrics() });
});

app.get("/api/telemetry/traces", (req, res) => {
  const traces = telemetry.searchTraces({
    name: req.query.name,
    status: req.query.status,
    startTime: req.query.startTime ? parseInt(req.query.startTime) : undefined,
    endTime: req.query.endTime ? parseInt(req.query.endTime) : undefined
  });
  res.json({ traces });
});

app.get("/api/telemetry/traces/:traceId", (req, res) => {
  const trace = telemetry.getTrace(req.params.traceId);
  if (!trace) {
    res.status(404).json({ error: "Trace not found" });
    return;
  }
  res.json({ trace });
});

app.get("/api/telemetry/generations", (req, res) => {
  const generations = telemetry.searchGenerations({
    model: req.query.model,
    provider: req.query.provider,
    status: req.query.status
  });
  res.json({ generations });
});

app.get("/api/telemetry/export", (req, res) => {
  const data = telemetry.exportAll();
  res.json(data);
});

app.get("/api/guardrails", (_req, res) => {
  res.json({ guardrails: GUARDRAILS });
});

app.get("/api/guardrails/violations", (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  res.json({ violations: guardrails.getViolations(limit) });
});

app.get("/api/guardrails/audit", (req, res) => {
  const limit = parseInt(req.query.limit) || 1000;
  res.json({ auditLog: guardrails.getAuditLog(limit) });
});

app.post("/api/guardrails/check/input", (req, res) => {
  const { input } = req.body;
  if (!input) {
    res.status(400).json({ error: "input is required" });
    return;
  }
  const result = guardrails.checkInput(input);
  res.json(result);
});

app.post("/api/guardrails/check/output", (req, res) => {
  const { output } = req.body;
  if (!output) {
    res.status(400).json({ error: "output is required" });
    return;
  }
  const result = guardrails.checkOutput(output);
  res.json(result);
});

app.post("/api/guardrails/:guardrailId/enable", (req, res) => {
  const success = guardrails.enable(req.params.guardrailId);
  res.json({ ok: success });
});

app.post("/api/guardrails/:guardrailId/disable", (req, res) => {
  const success = guardrails.disable(req.params.guardrailId);
  res.json({ ok: success });
});

app.get("/api/services", (_req, res) => {
  res.json({ categories: listServiceCategories() });
});

app.get("/api/services/:category", (req, res) => {
  const services = SERVICE_PROVISIONING[req.params.category] || AI_SERVICES[req.params.category];
  if (!services) {
    res.status(404).json({ error: "Service category not found" });
    return;
  }
  res.json({ services });
});

app.get("/ai-sdks", (_req, res) => {
  res.json({ sdks: AI_SDKS });
});

app.post("/rpc", async (req, res) => {
  const { jsonrpc, method, params, id } = req.body;
  
  if (jsonrpc !== "2.0") {
    res.json({ jsonrpc: "2.0", error: { code: -32600, message: "Invalid Request" }, id: null });
    return;
  }

  const success = (result) => res.json({ jsonrpc: "2.0", result, id });
  const error = (code, message, data) => res.json({ jsonrpc: "2.0", error: { code, message, data }, id });

  try {
    switch (method) {
      case "health":
        success({ ok: true, app: "openclaw-plus", version: "0.5.0" });
        break;

      case "models.list":
        success(models.publicModels());
        break;

      case "skills.list":
        success([...skills.publicSkills(), ...mcp.publicTools()]);
        break;

      case "skills.invoke": {
        const { skillId, input } = params || {};
        if (!skillId) {
          error(-32602, "skillId is required");
          return;
        }
        
        const allSkills = [...skills.toolsFor(), ...mcp.toolsFor()];
        const skill = allSkills.find(s => s.id === skillId);
        
        if (!skill) {
          error(-32602, `Skill not found: ${skillId}`);
          return;
        }

        const policyResult = checkToolPermission({
          toolId: skillId,
          input,
          policy: {
            approvalMode: req.auth?.policy?.approvalMode || "never",
            allowPatterns: req.auth?.policy?.allowPatterns || ["*"],
            denyPatterns: req.auth?.policy?.denyPatterns || [],
            inputPolicies: config?.security?.toolInputPolicies || {}
          }
        });

        if (!policyResult.ok) {
          error(-32603, policyResult.reason);
          return;
        }

        try {
          const result = await skill.run({ input, workspaceRoot: rootDir });
          success(result);
        } catch (err) {
          error(-32603, String(err?.message || err));
        }
        break;
      }

      case "sessions.list":
        success(store.listSessions({ userId: req.auth?.userId || "anonymous" }));
        break;

      case "sessions.create": {
        const { title, settings, agentId } = params || {};
        const session = store.createSession({
          userId: req.auth?.userId || "anonymous",
          title,
          settings,
          agentId
        });
        await store.flush();
        success(session);
        break;
      }

      case "sessions.get": {
        const { sessionId } = params || {};
        const session = store.getSession({
          userId: req.auth?.userId || "anonymous",
          sessionId
        });
        success(session || null);
        break;
      }

      case "run": {
        const { modelId, objective, sessionId, enabledSkillIds, settings } = params || {};
        
        if (!modelId || !objective) {
          error(-32602, "modelId and objective are required");
          return;
        }

        const model = models.get(modelId);
        if (!model) {
          error(-32602, `Unknown model: ${modelId}`);
          return;
        }

        const session = sessionId
          ? store.getSession({ userId: req.auth?.userId || "anonymous", sessionId })
          : store.createSession({
              userId: req.auth?.userId || "anonymous",
              title: objective.slice(0, 60),
              settings: settings || {}
            });

        const result = await runAutonomousTask({
          requestData: {
            model,
            session,
            route: null,
            userPolicy: req.auth?.policy || { approvalMode: "never", allowPatterns: ["*"] },
            objective,
            enabledSkillIds,
            settings: { ...session.settings, ...settings }
          },
          onEvent() {},
          context: { rootDir, automation: config?.automation }
        });

        await store.flush();
        success(result);
        break;
      }

      default:
        error(-32601, `Method not found: ${method}`);
    }
  } catch (err) {
    error(-32603, String(err?.message || err));
  }
});

app.get("/api/sessions", (req, res) => {
  res.json({ sessions: store.listSessions({ userId: req.auth.userId }) });
});

app.post("/api/sessions", async (req, res) => {
  const { title, settings, agentId, routeKey, source } = req.body ?? {};
  const created = store.createSession({
    userId: req.auth.userId,
    title,
    settings,
    agentId,
    routeKey,
    source
  });
  await hooks.emit({
    type: "session_created",
    userId: req.auth.userId,
    sessionId: created.id,
    routeKey: created.routeKey,
    details: {
      title: created.title,
      agentId: created.agentId
    },
    context: { rootDir, automation: config?.automation }
  });
  await store.flush();
  res.status(201).json({ session: created });
});

app.get("/api/sessions/:sessionId", (req, res) => {
  const session = store.getSession({
    userId: req.auth.userId,
    sessionId: req.params.sessionId
  });

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  res.json({ session });
});

function parseRunRequest(req, res) {
  const { modelId, objective, enabledSkillIds, sessionId, settings, source } = req.body ?? {};
  if (!modelId || !objective) {
    res.status(400).json({ error: "modelId and objective are required" });
    return null;
  }

  const model = models.get(modelId);
  if (!model) {
    res.status(404).json({ error: `Unknown model: ${modelId}` });
    return null;
  }

  let session = null;
  let route = null;

  if (sessionId) {
    session = store.getSession({ userId: req.auth.userId, sessionId });
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return null;
    }
  } else {
    route = router.resolve(source || { channel: "api", accountId: "default" });
    session = store.getOrCreateByRoute({
      userId: req.auth.userId,
      agentId: route.agentId,
      routeKey: route.routeKey,
      source: route.source,
      title: `${route.agentName} :: ${route.routeKey}`,
      settings
    });
  }

  return {
    model,
    session,
    route,
    userPolicy: req.auth.policy,
    objective,
    enabledSkillIds,
    settings: {
      ...session.settings,
      ...(settings || {})
    }
  };
}

async function runAndPersist({ requestData, onEvent }) {
  const availableTools = [
    ...skills.toolsFor(requestData.enabledSkillIds),
    ...mcp.toolsFor(requestData.enabledSkillIds)
  ];

  const requestedPolicy = requestData.settings.toolPolicy || {};
  const globalInputPolicies = config?.security?.toolInputPolicies || {};
  const policy = {
    approvalMode:
      requestData.settings.approvalMode ||
      requestedPolicy.approvalMode ||
      requestData.userPolicy?.approvalMode ||
      "never",
    allowPatterns:
      requestedPolicy.allowPatterns || requestData.userPolicy?.allowPatterns || ["*"],
    denyPatterns: [
      ...(requestData.userPolicy?.denyPatterns || []),
      ...(requestedPolicy.denyPatterns || [])
    ],
    inputPolicies: {
      ...(globalInputPolicies || {}),
      ...(requestData.userPolicy?.inputPolicies || {}),
      ...(requestedPolicy.inputPolicies || {})
    }
  };

  await hooks.emit({
    type: "run_started",
    userId: requestData.session.userId,
    sessionId: requestData.session.id,
    routeKey: requestData.session.routeKey,
    details: {
      objective: requestData.objective,
      modelId: requestData.model.id
    },
    context: { rootDir, automation: config?.automation }
  });

  const emitEvent = async (event) => {
    if (onEvent) {
      await onEvent(event);
    }

    if (event?.type === "model_attempt") {
      await hooks.emit({
        type: "model_attempt",
        userId: requestData.session.userId,
        sessionId: requestData.session.id,
        routeKey: requestData.session.routeKey,
        details: event,
        context: { rootDir, automation: config?.automation }
      });
    }
  };

  const result = await runAutonomousTask({
    model: requestData.model,
    tools: availableTools,
    objective: requestData.objective,
    session: requestData.session,
    maxSteps: Number(requestData.settings.maxSteps ?? config.agent?.maxSteps ?? 8),
    maxCycles:
      requestData.settings.autonomyMode === "single-cycle"
        ? 1
        : Number(requestData.settings.maxCycles ?? config.agent?.maxCycles ?? 4),
      canRunTool(toolId, input) {
        return checkToolPermission({
          toolId,
          input,
          policy: {
            approvalMode: requestData.settings.approvalMode || policy.approvalMode || "never",
            allowPatterns: policy.allowPatterns || ["*"],
            denyPatterns: policy.denyPatterns || [],
            inputPolicies: policy.inputPolicies || {}
          }
        });
      },
    onEvent: emitEvent
  });

  const session = store.appendMessages({
    userId: requestData.session.userId,
    sessionId: requestData.session.id,
    messages: result.messagesToPersist
  });

  session.settings = {
    ...session.settings,
    ...requestData.settings
  };

  store.updateAfterRun({
    userId: requestData.session.userId,
    sessionId: requestData.session.id,
    trace: result.trace,
    memory: result.memory
  });
  await store.flush();

  await hooks.emit({
    type: "run_completed",
    userId: requestData.session.userId,
    sessionId: requestData.session.id,
    routeKey: requestData.session.routeKey,
    details: {
      done: result.done,
      cycles: result.cycles
    },
    context: { rootDir, automation: config?.automation }
  });

  return {
    ...result,
    session
  };
}

async function executeInbound({
  channel,
  accountId = "default",
  peer,
  objective,
  enabledSkillIds,
  settings,
  metadata,
  modelId
}) {
  const selectedModelId = modelId || config?.channels?.[channel]?.modelId || config.models?.[0]?.id;
  const model = models.get(selectedModelId);
  if (!model) {
    throw new Error(`Unknown model: ${selectedModelId}`);
  }

  const route = router.resolve({
    channel,
    accountId,
    peer
  });

  await hooks.emit({
    type: "inbound_message",
    userId: "gateway-inbound",
    sessionId: null,
    routeKey: route.routeKey,
    details: {
      channel,
      accountId,
      peer,
      metadata: metadata || {}
    },
    context: { rootDir, automation: config?.automation }
  });

  const session = store.getOrCreateByRoute({
    userId: "gateway-inbound",
    agentId: route.agentId,
    routeKey: route.routeKey,
    source: route.source,
    title: `${route.agentName} :: ${route.routeKey}`,
    settings
  });

  const result = await runAndPersist({
    requestData: {
      model,
      session,
      route,
      userPolicy: {
        approvalMode: settings?.approvalMode || "never",
        allowPatterns: ["*"],
        denyPatterns: []
      },
      objective,
      enabledSkillIds,
      settings: {
        ...(session.settings || {}),
        ...(settings || {})
      }
    }
  });

  return {
    sessionId: session.id,
    agentId: route.agentId,
    answer: result.answer,
    done: result.done,
    trace: result.trace
  };
}

app.post("/api/run", async (req, res) => {
  const requestData = parseRunRequest(req, res);
  if (!requestData) {
    return;
  }

  try {
    const result = await runAndPersist({ requestData });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: String(error?.message ?? error) });
  }
});

app.post("/api/run/stream", async (req, res) => {
  const requestData = parseRunRequest(req, res);
  if (!requestData) {
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const writeEvent = (event, payload) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    const result = await runAndPersist({
      requestData,
      onEvent(event) {
        writeEvent("progress", event);
      }
    });

    writeEvent("done", result);
  } catch (error) {
    writeEvent("error", { error: String(error?.message ?? error) });
  } finally {
    res.end();
  }
});

app.post("/api/inbound/:channel", async (req, res) => {
  const expectedToken = config?.security?.inboundTokenEnv
    ? process.env[config.security.inboundTokenEnv]
    : null;
  if (expectedToken) {
    const provided = req.headers["x-inbound-token"];
    if (provided !== expectedToken) {
      res.status(401).json({ error: "Unauthorized inbound token" });
      return;
    }
  }

  const channel = String(req.params.channel || "api");
  const {
    modelId,
    objective,
    accountId = "default",
    peer,
    enabledSkillIds,
    settings,
    metadata
  } = req.body ?? {};

  if (!modelId || !objective) {
    res.status(400).json({ error: "modelId and objective are required" });
    return;
  }

  try {
    const result = await executeInbound({
      channel,
      accountId,
      peer,
      objective,
      enabledSkillIds,
      settings,
      metadata,
      modelId
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: String(error?.message ?? error) });
  }
});

app.use(express.static(path.join(rootDir, "web")));

app.get("*", (_req, res) => {
  res.sendFile(path.join(rootDir, "web", "index.html"));
});

function sendWs(client, type, payload) {
  if (client.readyState !== 1) {
    return;
  }
  client.send(JSON.stringify({ type, payload }));
}

const wsToken = config?.security?.wsTokenEnv ? process.env[config.security.wsTokenEnv] : null;
const wsAuthRequired = Boolean(wsToken) || Boolean(auth.authEnabled);

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  let parsedUrl;
  try {
    parsedUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  } catch {
    socket.destroy();
    return;
  }

  if (parsedUrl.pathname !== "/ws") {
    socket.destroy();
    return;
  }

  const token = parsedUrl.searchParams.get("token");
  if (wsToken && token !== wsToken) {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (client) => {
    wss.emit("connection", client, request, { token });
  });
});

wss.on("connection", (client, _request, context) => {
  const clientId = randomUUID();
  let principal = {
    userId: `ws:${clientId}`,
    name: "WebSocket Client",
    role: "member",
    policy: {
      approvalMode: "never",
      allowPatterns: ["*"],
      denyPatterns: []
    }
  };

  if (auth.authEnabled) {
    const authResult = auth.authenticateToken(context?.token || null);
    if (!authResult.ok) {
      client.close(1008, "Unauthorized");
      return;
    }
    principal = authResult.auth;
  } else if (wsAuthRequired && wsToken && context?.token !== wsToken) {
    client.close(1008, "Unauthorized");
    return;
  }

  sendWs(client, "hello", {
    clientId,
    user: {
      id: principal.userId,
      name: principal.name,
      role: principal.role
    }
  });

  client.on("message", async (raw) => {
    let incoming;
    try {
      incoming = JSON.parse(String(raw));
    } catch {
      sendWs(client, "error", { error: "Invalid JSON message" });
      return;
    }

    const messageType = incoming?.type;

    if (messageType === "ping") {
      sendWs(client, "pong", { at: Date.now() });
      return;
    }

    if (messageType === "init") {
      sendWs(client, "init", {
        models: models.publicModels(),
        skills: [...skills.publicSkills(), ...mcp.publicTools()],
        hooks: hooks.publicHooks(),
        sessions: store.listSessions({ userId: principal.userId })
      });
      return;
    }

    if (messageType !== "run") {
      sendWs(client, "error", { error: `Unsupported message type: ${messageType}` });
      return;
    }

    const modelId = incoming?.modelId;
    const objective = String(incoming?.objective || "").trim();
    if (!modelId || !objective) {
      sendWs(client, "error", { error: "modelId and objective are required" });
      return;
    }

    const model = models.get(modelId);
    if (!model) {
      sendWs(client, "error", { error: `Unknown model: ${modelId}` });
      return;
    }

    const sessionId = incoming?.sessionId || null;
    let session = sessionId
      ? store.getSession({ userId: principal.userId, sessionId })
      : null;

    if (!session) {
      const route = router.resolve({
        channel: "ws",
        accountId: "default",
        peer: { kind: "direct", id: clientId }
      });
      session = store.getOrCreateByRoute({
        userId: principal.userId,
        agentId: route.agentId,
        routeKey: route.routeKey,
        source: route.source,
        title: `${route.agentName} :: ${route.routeKey}`,
        settings: incoming?.settings || {}
      });
      await store.flush();
    }

    try {
      const result = await runAndPersist({
        requestData: {
          model,
          session,
          route: null,
          userPolicy: principal.policy,
          objective,
          enabledSkillIds: incoming?.enabledSkillIds,
          settings: {
            ...session.settings,
            ...(incoming?.settings || {})
          }
        },
        onEvent(event) {
          sendWs(client, "progress", event);
        }
      });

      sendWs(client, "done", {
        sessionId: session.id,
        answer: result.answer,
        done: result.done,
        trace: result.trace
      });
    } catch (error) {
      sendWs(client, "error", { error: String(error?.message || error) });
    }
  });
});

const port = Number(config.port ?? process.env.PORT ?? 8787);
server.listen(port, () => {
  console.log(`OpenClaw Plus running on http://localhost:${port}`);
});

const telegramHandle = await startTelegramAdapter({
  config: config?.channels?.telegram,
  onInbound: executeInbound,
  logger(message) {
    console.log(`[adapter] ${message}`);
  }
});
if (telegramHandle) {
  adapterHandles.push(telegramHandle);
}

const discordHandle = await startDiscordAdapter({
  config: config?.channels?.discord,
  onInbound: executeInbound,
  logger(message) {
    console.log(`[adapter] ${message}`);
  }
});
if (discordHandle) {
  adapterHandles.push(discordHandle);
}
