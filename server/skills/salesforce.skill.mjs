export const id = "salesforce";
export const name = "Salesforce";
export const description = "Salesforce CRM - leads, contacts, accounts, opportunities, cases, SOQL queries";
export const version = "1.0.0";

export const inputs = {
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: ["query", "describe", "get", "create", "update", "delete", "search", "convert_lead"]
    },
    object: { type: "string", description: "SObject type (Lead, Contact, Account, Opportunity, Case, Task, Event)" },
    id: { type: "string", description: "Record ID" },
    data: { type: "object", description: "Data for create/update" },
    soql: { type: "string", description: "SOQL query string" },
    sosl: { type: "string", description: "SOSL search string" },
    limit: { type: "number", description: "Max results", default: 100 }
  },
  required: ["action"]
};

let accessToken = null;
let tokenExpiry = null;

async function getAccessToken() {
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return accessToken;
  }

  const clientId = process.env.SALESFORCE_CLIENT_ID;
  const clientSecret = process.env.SALESFORCE_CLIENT_SECRET;
  const refreshToken = process.env.SALESFORCE_REFRESH_TOKEN;
  const instanceUrl = process.env.SALESFORCE_INSTANCE_URL;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Salesforce not configured. Set SALESFORCE_CLIENT_ID, SALESFORCE_CLIENT_SECRET, SALESFORCE_REFRESH_TOKEN");
  }

  const tokenUrl = `${instanceUrl}/services/oauth2/token`;
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Salesforce auth error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  accessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000 - 60000;
  
  return accessToken;
}

async function sfRequest(endpoint, method = "GET", body = null) {
  const token = await getAccessToken();
  const instanceUrl = process.env.SALESFORCE_INSTANCE_URL;
  const apiVersion = process.env.SALESFORCE_API_VERSION || "v59.0";
  
  const url = `${instanceUrl}/services/data/${apiVersion}${endpoint}`;
  
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json"
  };

  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(`Salesforce error: ${response.status} - ${JSON.stringify(error)}`);
  }

  if (response.status === 204) {
    return { success: true };
  }

  return response.json();
}

export async function run({ input }) {
  const { action, object: sobject, id: recordId, data = {}, soql, sosl, limit = 100 } = input;

  try {
    switch (action) {
      case "query": {
        if (!soql) throw new Error("soql query required");
        const encodedQuery = encodeURIComponent(soql);
        const result = await sfRequest(`/query?q=${encodedQuery}`);
        return { ok: true, records: result.records, totalSize: result.totalSize, done: result.done };
      }

      case "describe": {
        if (!sobject) throw new Error("object required");
        const result = await sfRequest(`/sobjects/${sobject}/describe`);
        return { ok: true, describe: result };
      }

      case "get": {
        if (!sobject || !recordId) throw new Error("object and id required");
        const result = await sfRequest(`/sobjects/${sobject}/${recordId}`);
        return { ok: true, record: result };
      }

      case "create": {
        if (!sobject) throw new Error("object required");
        const result = await sfRequest(`/sobjects/${sobject}`, "POST", data);
        return { ok: true, id: result.id, success: result.success };
      }

      case "update": {
        if (!sobject || !recordId) throw new Error("object and id required");
        await sfRequest(`/sobjects/${sobject}/${recordId}`, "PATCH", data);
        return { ok: true, success: true };
      }

      case "delete": {
        if (!sobject || !recordId) throw new Error("object and id required");
        await sfRequest(`/sobjects/${sobject}/${recordId}`, "DELETE");
        return { ok: true, success: true };
      }

      case "search": {
        if (!sosl) throw new Error("sosl search string required");
        const encodedSearch = encodeURIComponent(sosl);
        const result = await sfRequest(`/search?q=${encodedSearch}`);
        return { ok: true, records: result.searchRecords };
      }

      case "convert_lead": {
        if (!recordId) throw new Error("lead id required");
        const result = await sfRequest(`/actions/standard/convertLead`, "POST", {
          inputs: [{ LeadId: recordId, ...data }]
        });
        return { ok: true, result: result };
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
    configured: !!(process.env.SALESFORCE_CLIENT_ID && process.env.SALESFORCE_CLIENT_SECRET && process.env.SALESFORCE_REFRESH_TOKEN && process.env.SALESFORCE_INSTANCE_URL),
    missing: [
      !process.env.SALESFORCE_CLIENT_ID && "SALESFORCE_CLIENT_ID",
      !process.env.SALESFORCE_CLIENT_SECRET && "SALESFORCE_CLIENT_SECRET",
      !process.env.SALESFORCE_REFRESH_TOKEN && "SALESFORCE_REFRESH_TOKEN",
      !process.env.SALESFORCE_INSTANCE_URL && "SALESFORCE_INSTANCE_URL"
    ].filter(Boolean)
  };
}

export const sampleQueries = {
  openLeads: "SELECT Id, Name, Company, Email, Status, CreatedDate FROM Lead WHERE Status != 'Closed' ORDER BY CreatedDate DESC",
  recentOpportunities: "SELECT Id, Name, StageName, Amount, CloseDate, Account.Name FROM Opportunity WHERE CloseDate = THIS_QUARTER",
  openCases: "SELECT Id, CaseNumber, Subject, Status, Priority, Contact.Name FROM Case WHERE Status != 'Closed'",
  myTasks: "SELECT Id, Subject, ActivityDate, What.Name, Who.Name FROM Task WHERE OwnerId = '{userId}' AND IsClosed = false",
  topAccounts: "SELECT Id, Name, AnnualRevenue, NumberOfEmployees, BillingCity FROM Account WHERE AnnualRevenue > 1000000"
};
