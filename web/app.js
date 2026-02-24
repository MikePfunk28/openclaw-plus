const state = {
  models: [],
  skills: [],
  sessions: [],
  activeSessionId: null,
  enabledSkillIds: new Set(),
  authToken: localStorage.getItem("openclaw_token") || "",
  hooksAnnounced: false,
  ws: null,
  wsConnected: false,
  reconnectTimer: null,
  wsManuallyClosed: false,
  activeRun: null,
  transportMode: localStorage.getItem("openclaw_transport_mode") || "auto"
};

const modelSelect = document.querySelector("#modelSelect");
const skillList = document.querySelector("#skillList");
const sessionList = document.querySelector("#sessionList");
const chat = document.querySelector("#chat");
const traceList = document.querySelector("#traceList");
const promptInput = document.querySelector("#promptInput");
const sendBtn = document.querySelector("#sendBtn");
const refreshBtn = document.querySelector("#refreshBtn");
const newSessionBtn = document.querySelector("#newSessionBtn");
const tokenInput = document.querySelector("#tokenInput");
const reconnectBtn = document.querySelector("#reconnectBtn");
const connectionStatus = document.querySelector("#connectionStatus");
const transportModeSelect = document.querySelector("#transportModeSelect");
const maxStepsInput = document.querySelector("#maxStepsInput");
const maxCyclesInput = document.querySelector("#maxCyclesInput");
const autonomyModeSelect = document.querySelector("#autonomyModeSelect");
const approvalModeSelect = document.querySelector("#approvalModeSelect");
const messageTemplate = document.querySelector("#messageTemplate");

tokenInput.value = state.authToken;
transportModeSelect.value = state.transportMode;

function defaultWsUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

function setConnectionStatus(mode, text) {
  connectionStatus.className = `connection-status ${mode}`;
  connectionStatus.textContent = text;
}

function authHeaders() {
  if (!state.authToken) {
    return {};
  }
  return { authorization: `Bearer ${state.authToken}` };
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...authHeaders()
    }
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }

  return response;
}

function addMessage(role, content) {
  const node = messageTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector(".meta").textContent = role;
  node.querySelector(".content").textContent = content;
  chat.appendChild(node);
  chat.scrollTop = chat.scrollHeight;
}

function clearReconnectTimer() {
  if (state.reconnectTimer) {
    window.clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }
}

function scheduleReconnect() {
  clearReconnectTimer();
  state.reconnectTimer = window.setTimeout(() => {
    openWebSocket();
  }, 2000);
}

async function handleWsMessage(rawData) {
  let packet;
  try {
    packet = JSON.parse(rawData);
  } catch {
    return;
  }

  const type = packet?.type;
  const payload = packet?.payload || {};

  if (type === "hello") {
    return;
  }

  if (type === "init") {
    state.models = payload.models || [];
    state.skills = payload.skills || [];
    state.sessions = payload.sessions || [];
    state.enabledSkillIds = new Set(state.skills.map((skill) => skill.id));
    if (!state.activeSessionId && state.sessions.length > 0) {
      state.activeSessionId = state.sessions[0].id;
    }
    renderModels();
    renderSkills();
    renderSessions();
    if (state.activeSessionId) {
      await loadSession(state.activeSessionId);
    }
    return;
  }

  if (type === "progress") {
    if (payload.type === "cycle_start") {
      addMessage("system", `Cycle ${payload.cycle}/${payload.maxCycles} started...`);
    }
    if (payload.type === "tool" && state.activeRun) {
      state.activeRun.liveTrace.push(payload);
      renderTrace(state.activeRun.liveTrace);
    }
    return;
  }

  if (type === "done") {
    if (state.activeRun) {
      state.activeRun.resolve(payload);
      state.activeRun = null;
    }
    return;
  }

  if (type === "error") {
    const error = payload.error || "WebSocket run failed";
    if (state.activeRun) {
      state.activeRun.reject(new Error(error));
      state.activeRun = null;
    } else {
      addMessage("system", `Error: ${error}`);
    }
  }
}

function closeWebSocket(manual = false) {
  state.wsManuallyClosed = manual;
  clearReconnectTimer();
  if (state.ws) {
    try {
      state.ws.close();
    } catch {
      // ignore
    }
    state.ws = null;
  }
  state.wsConnected = false;
  if (manual) {
    setConnectionStatus("offline", "offline");
  }
}

function openWebSocket() {
  closeWebSocket(false);
  const token = state.authToken.trim();
  const url = new URL(defaultWsUrl());
  if (token) {
    url.searchParams.set("token", token);
  }

  setConnectionStatus("connecting", "connecting");

  const ws = new WebSocket(url.toString());
  state.ws = ws;
  state.wsManuallyClosed = false;

  ws.addEventListener("open", () => {
    state.wsConnected = true;
    setConnectionStatus("online", "online");
    ws.send(JSON.stringify({ type: "init" }));
  });

  ws.addEventListener("message", async (event) => {
    await handleWsMessage(String(event.data || ""));
  });

  ws.addEventListener("close", () => {
    if (state.activeRun) {
      state.activeRun.reject(new Error("Realtime connection closed"));
      state.activeRun = null;
    }
    state.wsConnected = false;
    if (!state.wsManuallyClosed) {
      setConnectionStatus("offline", "offline (retrying)");
      scheduleReconnect();
    } else {
      setConnectionStatus("offline", "offline");
    }
  });

  ws.addEventListener("error", () => {
    state.wsConnected = false;
    setConnectionStatus("offline", "offline");
  });
}

function wsRun(payload) {
  if (!state.ws || !state.wsConnected) {
    throw new Error("Realtime connection is offline");
  }
  if (state.activeRun) {
    throw new Error("Another run is already in progress");
  }

  return new Promise((resolve, reject) => {
    state.activeRun = {
      resolve,
      reject,
      liveTrace: []
    };
    state.ws.send(
      JSON.stringify({
        type: "run",
        ...payload
      })
    );
  });
}

function renderModels() {
  modelSelect.innerHTML = "";
  for (const model of state.models) {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = `${model.label} (${model.provider})`;
    modelSelect.appendChild(option);
  }
}

function renderSkills() {
  skillList.innerHTML = "";

  for (const skill of state.skills) {
    const card = document.createElement("article");
    card.className = "skill";

    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.enabledSkillIds.has(skill.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.enabledSkillIds.add(skill.id);
      } else {
        state.enabledSkillIds.delete(skill.id);
      }
    });

    const text = document.createElement("span");
    text.textContent = skill.name;

    label.appendChild(checkbox);
    label.appendChild(text);

    const description = document.createElement("p");
    description.textContent = `[${skill.source}] ${skill.description}`;

    card.appendChild(label);
    card.appendChild(description);
    skillList.appendChild(card);
  }
}

function renderSessions() {
  sessionList.innerHTML = "";

  for (const session of state.sessions) {
    const card = document.createElement("article");
    card.className = `session-item${session.id === state.activeSessionId ? " active" : ""}`;

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = session.title;

    const stamp = document.createElement("div");
    stamp.className = "stamp";
    const routeLabel = session.routeKey ? ` | ${session.routeKey}` : "";
    stamp.textContent = `${new Date(session.updatedAt).toLocaleString()} | ${session.agentId || "main"}${routeLabel}`;

    card.appendChild(title);
    card.appendChild(stamp);
    card.addEventListener("click", async () => {
      state.activeSessionId = session.id;
      renderSessions();
      await loadSession(session.id);
    });

    sessionList.appendChild(card);
  }
}

function renderTrace(trace) {
  traceList.innerHTML = "";
  for (const item of trace ?? []) {
    const row = document.createElement("article");
    row.className = "trace-item";
    const status = item.ok ? "ok" : "fail";
    row.innerHTML = `<div class="${status}">${item.ok ? "OK" : "FAIL"} :: ${item.tool}</div>`;
    const details = document.createElement("pre");
    details.textContent = JSON.stringify(item, null, 2);
    row.appendChild(details);
    traceList.appendChild(row);
  }
}

async function loadState() {
  const [modelsResponse, skillsResponse, sessionsResponse, hooksResponse] = await Promise.all([
    api("/api/models"),
    api("/api/skills"),
    api("/api/sessions"),
    api("/api/hooks")
  ]);

  const modelsJson = await modelsResponse.json();
  const skillsJson = await skillsResponse.json();
  const sessionsJson = await sessionsResponse.json();
  const hooksJson = await hooksResponse.json();

  state.models = modelsJson.models ?? [];
  state.skills = skillsJson.skills ?? [];
  state.sessions = sessionsJson.sessions ?? [];
  state.enabledSkillIds = new Set(state.skills.map((skill) => skill.id));
  if (!state.activeSessionId && state.sessions.length > 0) {
    state.activeSessionId = state.sessions[0].id;
  }

  renderModels();
  renderSkills();
  renderSessions();

  for (const warning of skillsJson.warnings ?? []) {
    addMessage("system", `MCP warning: ${warning}`);
  }

  if (!state.hooksAnnounced) {
    addMessage("system", `Loaded ${(hooksJson.hooks || []).length} hooks.`);
    state.hooksAnnounced = true;
  }

  if (!state.activeSessionId) {
    await createSession("First Task");
  } else {
    await loadSession(state.activeSessionId);
  }
}

async function createSession(title = "Untitled Task") {
  const response = await api("/api/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title })
  });
  const json = await response.json();
  state.sessions.unshift(json.session);
  state.activeSessionId = json.session.id;
  chat.innerHTML = "";
  traceList.innerHTML = "";
  renderSessions();
}

async function loadSession(sessionId) {
  const response = await api(`/api/sessions/${sessionId}`);
  const json = await response.json();
  const session = json.session;

  chat.innerHTML = "";
  for (const message of session.messages || []) {
    if (message.role === "tool") {
      continue;
    }
    addMessage(message.role, String(message.content || ""));
  }
  renderTrace(session.trace || []);

  maxStepsInput.value = session.settings?.maxSteps || 8;
  maxCyclesInput.value = session.settings?.maxCycles || 4;
  autonomyModeSelect.value = session.settings?.autonomyMode || "continuous";
  approvalModeSelect.value = session.settings?.approvalMode || "never";
}

async function streamRun(payload) {
  const response = await fetch("/api/run/stream", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeaders()
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const json = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(json.error || "Run failed");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  const liveTrace = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() || "";

    for (const block of blocks) {
      const lines = block.split("\n");
      const eventLine = lines.find((line) => line.startsWith("event:"));
      const dataLine = lines.find((line) => line.startsWith("data:"));
      if (!eventLine || !dataLine) {
        continue;
      }

      const eventName = eventLine.slice("event:".length).trim();
      const payloadJson = JSON.parse(dataLine.slice("data:".length).trim());

      if (eventName === "progress") {
        if (payloadJson.type === "cycle_start") {
          addMessage("system", `Cycle ${payloadJson.cycle}/${payloadJson.maxCycles} started...`);
        }
        if (payloadJson.type === "tool") {
          liveTrace.push(payloadJson);
          renderTrace(liveTrace);
        }
      }

      if (eventName === "done") {
        return payloadJson;
      }

      if (eventName === "error") {
        throw new Error(payloadJson.error || "Run failed");
      }
    }
  }

  throw new Error("Stream ended unexpectedly");
}

async function sendPrompt() {
  const text = promptInput.value.trim();
  if (!text) {
    return;
  }

  const modelId = modelSelect.value;
  const enabledSkillIds = [...state.enabledSkillIds];
  if (!state.activeSessionId) {
    await createSession("Untitled Task");
  }

  addMessage("you", text);
  promptInput.value = "";
  sendBtn.disabled = true;
  sendBtn.textContent = "Running...";

  try {
    const payload = {
      modelId,
      sessionId: state.activeSessionId,
      objective: text,
      enabledSkillIds,
      settings: {
        maxSteps: Number(maxStepsInput.value || 8),
        maxCycles: Number(maxCyclesInput.value || 4),
        autonomyMode: autonomyModeSelect.value,
        approvalMode: approvalModeSelect.value
      }
    };

    let result;
    if (state.transportMode === "ws") {
      result = await wsRun(payload);
    } else if (state.transportMode === "http") {
      result = await streamRun(payload);
    } else {
      result = state.wsConnected ? await wsRun(payload) : await streamRun(payload);
    }

    addMessage("assistant", result.answer || "(No response)");
    renderTrace(result.trace || []);
    await loadState();
  } catch (error) {
    addMessage("system", `Error: ${String(error.message || error)}`);
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = "Run Agent";
  }
}

sendBtn.addEventListener("click", sendPrompt);
refreshBtn.addEventListener("click", loadState);
reconnectBtn.addEventListener("click", () => {
  openWebSocket();
});
transportModeSelect.addEventListener("change", () => {
  state.transportMode = transportModeSelect.value;
  localStorage.setItem("openclaw_transport_mode", state.transportMode);
  if (state.transportMode === "http") {
    closeWebSocket(true);
  } else if (!state.wsConnected) {
    openWebSocket();
  }
});
newSessionBtn.addEventListener("click", async () => {
  await createSession(`Task ${state.sessions.length + 1}`);
});
tokenInput.addEventListener("change", () => {
  state.authToken = tokenInput.value.trim();
  localStorage.setItem("openclaw_token", state.authToken);
  openWebSocket();
  loadState().catch((error) => addMessage("system", `Error: ${String(error.message || error)}`));
});
promptInput.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    sendPrompt();
  }
});

await loadState();
if (state.transportMode !== "http") {
  openWebSocket();
}
addMessage("system", "Ready. Pick a model, choose a session, and run autonomous tasks.");
