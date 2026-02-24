const BASE_URL = process.env.OPENCLAW_BASE_URL || "http://localhost:8787";
const OWNER_TOKEN = process.env.OPENCLAW_OWNER_TOKEN || "";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function getJson(path, { auth = false } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: auth
      ? {
          Authorization: `Bearer ${OWNER_TOKEN}`
        }
      : undefined
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function getJsonAuto(path) {
  const first = await getJson(path, { auth: false });
  if (first.status !== 401) {
    return first;
  }
  if (!OWNER_TOKEN) {
    return first;
  }
  return getJson(path, { auth: true });
}

async function postJson(path, payload, { auth = false } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: `Bearer ${OWNER_TOKEN}` } : {})
    },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function main() {
  const health = await getJson("/api/health");
  assert(health.status === 200 && health.body.ok === true, "Health check failed");

  const models = await getJsonAuto("/api/models");
  assert(models.status === 200 && Array.isArray(models.body.models), "Models endpoint failed");

  const skills = await getJsonAuto("/api/skills");
  assert(skills.status === 200 && Array.isArray(skills.body.skills), "Skills endpoint failed");

  const hooks = await getJsonAuto("/api/hooks");
  assert(hooks.status === 200 && Array.isArray(hooks.body.hooks), "Hooks endpoint failed");

  if (OWNER_TOKEN) {
    const me = await getJson("/api/me", { auth: true });
    assert(me.status === 200 && me.body?.user?.id, "Auth check failed");

    const created = await postJson(
      "/api/sessions",
      {
        title: `API Smoke ${new Date().toISOString()}`
      },
      { auth: true }
    );
    assert(created.status === 201 && created.body?.session?.id, "Session creation failed");

    const listed = await getJson("/api/sessions", { auth: true });
    assert(listed.status === 200 && Array.isArray(listed.body.sessions), "Session listing failed");
  }

  console.log("API smoke test passed");
}

main().catch((error) => {
  console.error(`API smoke test failed: ${String(error?.message || error)}`);
  process.exitCode = 1;
});
