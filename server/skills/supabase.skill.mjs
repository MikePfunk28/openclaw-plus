export const id = "supabase";
export const name = "Supabase";
export const description = "PostgreSQL, Auth, Storage, Realtime, Edge Functions - full backend platform";
export const version = "1.0.0";

export const inputs = {
  type: "object",
  properties: {
    operation: { type: "string", description: "Operation to perform" },
    table: { type: "string", description: "Table name for database ops" },
    data: { type: "object", description: "Data for insert/update" },
    filter: { type: "object", description: "Filter for queries" },
    sql: { type: "string", description: "SQL query" },
    bucket: { type: "string", description: "Storage bucket name" },
    path: { type: "string", description: "File path" },
    functionName: { type: "string", description: "Edge function name" },
    payload: { type: "object", description: "Function payload" }
  },
  required: ["operation"]
};

let supabaseClient = null;

async function getClient() {
  if (!supabaseClient) {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
    
    if (!url || !key) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY required");
    }
    
    supabaseClient = createClient(url, key);
  }
  return supabaseClient;
}

export async function run({ input }) {
  const client = await getClient();
  const { operation, table, data, filter, sql, bucket, path, functionName, payload } = input;

  try {
    switch (operation) {
      case "listTables": {
        const { data, error } = await client.rpc("get_tables");
        if (error) throw error;
        return { ok: true, tables: data };
      }
      
      case "query": {
        const { data, error } = await client.rpc("exec_sql", { query: sql });
        if (error) throw error;
        return { ok: true, rows: data };
      }
      
      case "select": {
        let query = client.from(table).select("*");
        if (filter) {
          for (const [key, value] of Object.entries(filter)) {
            query = query.eq(key, value);
          }
        }
        const { data, error } = await query;
        if (error) throw error;
        return { ok: true, rows: data };
      }
      
      case "insert": {
        const { data: result, error } = await client.from(table).insert(data).select();
        if (error) throw error;
        return { ok: true, inserted: result };
      }
      
      case "update": {
        let query = client.from(table).update(data);
        if (filter) {
          for (const [key, value] of Object.entries(filter)) {
            query = query.eq(key, value);
          }
        }
        const { data: result, error } = await query.select();
        if (error) throw error;
        return { ok: true, updated: result };
      }
      
      case "delete": {
        let query = client.from(table).delete();
        if (filter) {
          for (const [key, value] of Object.entries(filter)) {
            query = query.eq(key, value);
          }
        }
        const { error } = await query;
        if (error) throw error;
        return { ok: true };
      }
      
      case "uploadFile": {
        const { data: result, error } = await client.storage.from(bucket).upload(path, payload);
        if (error) throw error;
        return { ok: true, path: result.path };
      }
      
      case "downloadFile": {
        const { data, error } = await client.storage.from(bucket).download(path);
        if (error) throw error;
        return { ok: true, data: data.toString() };
      }
      
      case "listFiles": {
        const { data, error } = await client.storage.from(bucket).list();
        if (error) throw error;
        return { ok: true, files: data };
      }
      
      case "invokeFunction": {
        const { data, error } = await client.functions.invoke(functionName, { body: payload });
        if (error) throw error;
        return { ok: true, result: data };
      }
      
      case "listUsers": {
        const { data, error } = await client.auth.admin.listUsers();
        if (error) throw error;
        return { ok: true, users: data.users };
      }
      
      case "createUser": {
        const { data: result, error } = await client.auth.admin.createUser({
          email: data.email,
          password: data.password,
          email_confirm: true
        });
        if (error) throw error;
        return { ok: true, user: result.user };
      }
      
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export function checkConfig() {
  return {
    configured: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY),
    missing: [
      !process.env.SUPABASE_URL && "SUPABASE_URL",
      !process.env.SUPABASE_SERVICE_KEY && "SUPABASE_SERVICE_KEY"
    ].filter(Boolean)
  };
}
