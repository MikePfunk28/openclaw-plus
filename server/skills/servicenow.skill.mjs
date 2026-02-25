export const id = "servicenow";
export const name = "ServiceNow";
export const description = "ServiceNow ITSM - incidents, changes, CMDB, service catalog, knowledge base";
export const version = "1.0.0";

export const inputs = {
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: ["list_incidents", "get_incident", "create_incident", "update_incident", "close_incident",
             "list_changes", "get_change", "create_change",
             "list_ci", "get_ci", "search_knowledge",
             "trigger_flow", "catalog_items", "catalog_checkout"]
    },
    sys_id: { type: "string", description: "ServiceNow sys_id for specific record" },
    data: { type: "object", description: "Data for create/update operations" },
    query: { type: "string", description: "Query string for searches" },
    limit: { type: "number", description: "Max results", default: 10 }
  },
  required: ["action"]
};

function getServiceNowConfig() {
  const instance = process.env.SERVICENOW_INSTANCE;
  const user = process.env.SERVICENOW_USER;
  const password = process.env.SERVICENOW_PASSWORD;

  if (!instance || !user || !password) {
    throw new Error("ServiceNow not configured. Set SERVICENOW_INSTANCE, SERVICENOW_USER, SERVICENOW_PASSWORD");
  }

  return { instance, user, password };
}

async function snRequest(endpoint, method = "GET", body = null) {
  const { instance, user, password } = getServiceNowConfig();
  const url = `https://${instance}.service-now.com${endpoint}`;
  
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json"
  };

  const auth = Buffer.from(`${user}:${password}`).toString("base64");
  headers["Authorization"] = `Basic ${auth}`;

  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ServiceNow error: ${response.status} - ${error}`);
  }

  return response.json();
}

export async function run({ input }) {
  const { action, sys_id, data = {}, query, limit = 10 } = input;

  try {
    switch (action) {
      case "list_incidents": {
        const params = new URLSearchParams({
          sysparm_limit: limit,
          sysparm_query: query || "active=true"
        });
        const result = await snRequest(`/api/now/table/incident?${params}`);
        return { ok: true, incidents: result.result };
      }

      case "get_incident": {
        if (!sys_id) throw new Error("sys_id required");
        const result = await snRequest(`/api/now/table/incident/${sys_id}`);
        return { ok: true, incident: result.result };
      }

      case "create_incident": {
        const result = await snRequest("/api/now/table/incident", "POST", data);
        return { ok: true, incident: result.result };
      }

      case "update_incident": {
        if (!sys_id) throw new Error("sys_id required");
        const result = await snRequest(`/api/now/table/incident/${sys_id}`, "PATCH", data);
        return { ok: true, incident: result.result };
      }

      case "close_incident": {
        if (!sys_id) throw new Error("sys_id required");
        const closeData = { ...data, state: "7", close_code: data.close_code || "Solved (Permanently)" };
        const result = await snRequest(`/api/now/table/incident/${sys_id}`, "PATCH", closeData);
        return { ok: true, incident: result.result };
      }

      case "list_changes": {
        const params = new URLSearchParams({
          sysparm_limit: limit,
          sysparm_query: query || "active=true"
        });
        const result = await snRequest(`/api/now/table/change_request?${params}`);
        return { ok: true, changes: result.result };
      }

      case "get_change": {
        if (!sys_id) throw new Error("sys_id required");
        const result = await snRequest(`/api/now/table/change_request/${sys_id}`);
        return { ok: true, change: result.result };
      }

      case "create_change": {
        const result = await snRequest("/api/now/table/change_request", "POST", data);
        return { ok: true, change: result.result };
      }

      case "list_ci": {
        const params = new URLSearchParams({
          sysparm_limit: limit,
          sysparm_query: query || ""
        });
        const result = await snRequest(`/api/now/table/cmdb_ci?${params}`);
        return { ok: true, cis: result.result };
      }

      case "get_ci": {
        if (!sys_id) throw new Error("sys_id required");
        const result = await snRequest(`/api/now/table/cmdb_ci/${sys_id}`);
        return { ok: true, ci: result.result };
      }

      case "search_knowledge": {
        const params = new URLSearchParams({
          sysparm_limit: limit,
          sysparm_query: query || ""
        });
        const result = await snRequest(`/api/now/table/kb_knowledge?${params}`);
        return { ok: true, articles: result.result };
      }

      case "catalog_items": {
        const result = await snRequest("/api/sn_sc/v1/servicecatalog/items");
        return { ok: true, items: result.result };
      }

      case "catalog_checkout": {
        const result = await snRequest("/api/sn_sc/v1/servicecatalog/checkout", "POST", data);
        return { ok: true, request: result.result };
      }

      case "trigger_flow": {
        const result = await snRequest("/api/now/flow/executor", "POST", data);
        return { ok: true, execution: result.result };
      }

      default:
        return { ok: false, error: `Unknown action: ${action}` };
    }
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export function checkConfig() {
  return {
    configured: !!(process.env.SERVICENOW_INSTANCE && process.env.SERVICENOW_USER && process.env.SERVICENOW_PASSWORD),
    missing: [
      !process.env.SERVICENOW_INSTANCE && "SERVICENOW_INSTANCE",
      !process.env.SERVICENOW_USER && "SERVICENOW_USER",
      !process.env.SERVICENOW_PASSWORD && "SERVICENOW_PASSWORD"
    ].filter(Boolean)
  };
}
