import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";

export const skill = {
  id: "database",
  name: "Database",
  description: "Multi-database operations - PostgreSQL, MySQL, SQLite, MongoDB, Redis. Query, analyze, migrate, and manage data.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["query", "execute", "insert", "update", "delete", "schema", "tables", "create_table", "drop_table", "analyze", "export", "import", "migrate", "backup", "connect", "describe"],
        description: "Database action to perform"
      },
      database: {
        type: "object",
        description: "Database connection configuration",
        properties: {
          type: { type: "string", enum: ["postgresql", "mysql", "sqlite", "mongodb", "redis"] },
          host: { type: "string" },
          port: { type: "number" },
          database: { type: "string" },
          user: { type: "string" },
          password: { type: "string" },
          path: { type: "string" }
        }
      },
      table: { type: "string" },
      collection: { type: "string" },
      sql: { type: "string" },
      query: { type: "object" },
      data: { type: "object" },
      pipeline: { type: "array" },
      where: { type: "object" },
      columns: { type: "array", items: { type: "string" } },
      limit: { type: "number" },
      offset: { type: "number" },
      orderBy: { type: "string" },
      format: { type: "string", enum: ["json", "csv", "parquet"], default: "json" },
      outputPath: { type: "string" },
      sourcePath: { type: "string" }
    },
    required: ["action"],
    additionalProperties: false
  },
  async run({ input, workspaceRoot }) {
    const action = input?.action;
    const dbConfig = input?.database || { type: "sqlite", path: "data/openclaw.db" };
    const dbType = dbConfig.type || "sqlite";
    
    const dataDir = path.join(workspaceRoot, "data");
    await mkdir(dataDir, { recursive: true });

    const getConnectionString = () => {
      switch (dbType) {
        case "postgresql":
          return `postgresql://${dbConfig.user || "postgres"}:${dbConfig.password || ""}@${dbConfig.host || "localhost"}:${dbConfig.port || 5432}/${dbConfig.database}`;
        case "mysql":
          return `mysql://${dbConfig.user || "root"}:${dbConfig.password || ""}@${dbConfig.host || "localhost"}:${dbConfig.port || 3306}/${dbConfig.database}`;
        case "sqlite":
          return dbConfig.path || path.join(dataDir, "openclaw.db");
        case "mongodb":
          return `mongodb://${dbConfig.user ? `${dbConfig.user}:${dbConfig.password}@` : ""}${dbConfig.host || "localhost"}:${dbConfig.port || 27017}/${dbConfig.database}`;
        case "redis":
          return `redis://${dbConfig.host || "localhost"}:${dbConfig.port || 6379}/${dbConfig.database || 0}`;
        default:
          return dbConfig.path || path.join(dataDir, "openclaw.db");
      }
    };

    const execSqlite = (sql, dbPath) => {
      return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        
        const child = spawn("sqlite3", [dbPath, sql], { windowsHide: true });
        
        const timeoutId = setTimeout(() => {
          child.kill("SIGTERM");
          resolve({ exitCode: -1, stdout, stderr, timedOut: true });
        }, 60000);
        
        child.stdout?.on("data", (data) => { stdout += data.toString(); });
        child.stderr?.on("data", (data) => { stderr += data.toString(); });
        
        child.on("close", (code) => {
          clearTimeout(timeoutId);
          resolve({ exitCode: code, stdout, stderr });
        });
        
        child.on("error", (err) => {
          clearTimeout(timeoutId);
          resolve({ exitCode: -1, stdout, stderr, error: err.message });
        });
      });
    };

    const execPsql = (sql, connStr) => {
      return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        
        const env = { ...process.env, PGPASSWORD: dbConfig.password || "" };
        const args = ["postgresql", "sql", "--connection-string", connStr, "--query", sql];
        
        const child = spawn("psql", [connStr, "-c", sql, "-t", "-A"], { env, windowsHide: true });
        
        const timeoutId = setTimeout(() => {
          child.kill("SIGTERM");
          resolve({ exitCode: -1, stdout, stderr, timedOut: true });
        }, 60000);
        
        child.stdout?.on("data", (data) => { stdout += data.toString(); });
        child.stderr?.on("data", (data) => { stderr += data.toString(); });
        
        child.on("close", (code) => {
          clearTimeout(timeoutId);
          resolve({ exitCode: code, stdout, stderr });
        });
        
        child.on("error", (err) => {
          clearTimeout(timeoutId);
          resolve({ exitCode: -1, stdout, stderr, error: err.message });
        });
      });
    };

    const execMysql = (sql, dbConfig) => {
      return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        
        const args = [
          `-h${dbConfig.host || "localhost"}`,
          `-P${dbConfig.port || 3306}`,
          `-u${dbConfig.user || "root"}`,
          `-e${sql}`
        ];
        if (dbConfig.password) args.push(`-p${dbConfig.password}`);
        if (dbConfig.database) args.push(dbConfig.database);
        
        const child = spawn("mysql", args, { windowsHide: true });
        
        const timeoutId = setTimeout(() => {
          child.kill("SIGTERM");
          resolve({ exitCode: -1, stdout, stderr, timedOut: true });
        }, 60000);
        
        child.stdout?.on("data", (data) => { stdout += data.toString(); });
        child.stderr?.on("data", (data) => { stderr += data.toString(); });
        
        child.on("close", (code) => {
          clearTimeout(timeoutId);
          resolve({ exitCode: code, stdout, stderr });
        });
        
        child.on("error", (err) => {
          clearTimeout(timeoutId);
          resolve({ exitCode: -1, stdout, stderr, error: err.message });
        });
      });
    };

    const parseSqlResults = (output, hasHeaders = true) => {
      const lines = output.trim().split("\n").filter(Boolean);
      if (lines.length === 0) return [];
      
      if (hasHeaders) {
        const headers = lines[0].split("\t");
        return lines.slice(1).map(line => {
          const values = line.split("\t");
          const row = {};
          headers.forEach((h, i) => { row[h] = values[i] || null; });
          return row;
        });
      }
      
      return lines.map(line => {
        const values = line.split("\t");
        return values;
      });
    };

    const escapeValue = (v) => {
      if (v === null || v === undefined) return "NULL";
      if (typeof v === "number") return v;
      if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
      return `'${String(v).replace(/'/g, "''")}'`;
    };

    const buildWhereClause = (where) => {
      if (!where || Object.keys(where).length === 0) return "";
      const conditions = Object.entries(where).map(([k, v]) => {
        if (Array.isArray(v)) return `${k} IN (${v.map(escapeValue).join(", ")})`;
        if (typeof v === "object" && v?.op) {
          return `${k} ${v.op} ${escapeValue(v.value)}`;
        }
        return `${k} = ${escapeValue(v)}`;
      });
      return `WHERE ${conditions.join(" AND ")}`;
    };

    switch (dbType) {
      case "sqlite": {
        const dbPath = getConnectionString();
        await mkdir(path.dirname(dbPath), { recursive: true });
        
        switch (action) {
          case "query": {
            const sql = input?.sql;
            if (!sql) throw new Error("sql is required for query");
            
            const result = await execSqlite(`${sql}\n.headers on\n.mode list`, dbPath);
            if (result.exitCode !== 0) return { ok: false, error: result.stderr };
            
            const lines = result.stdout.trim().split("\n");
            const headers = lines[0]?.split("|") || [];
            const rows = lines.slice(1).map(line => {
              const values = line.split("|");
              const row = {};
              headers.forEach((h, i) => { row[h] = values[i] || null; });
              return row;
            });
            
            return { ok: true, rows, rowCount: rows.length, columns: headers };
          }

          case "execute":
          case "insert":
          case "update":
          case "delete": {
            let sql = input?.sql;
            const table = input?.table;
            const data = input?.data;
            const where = input?.where;
            
            if (!sql && action === "insert" && table && data) {
              const cols = Object.keys(data);
              const vals = Object.values(data).map(escapeValue);
              sql = `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${vals.join(", ")})`;
            }
            
            if (!sql && action === "update" && table && data && where) {
              const sets = Object.entries(data).map(([k, v]) => `${k} = ${escapeValue(v)}`).join(", ");
              sql = `UPDATE ${table} SET ${sets} ${buildWhereClause(where)}`;
            }
            
            if (!sql && action === "delete" && table && where) {
              sql = `DELETE FROM ${table} ${buildWhereClause(where)}`;
            }
            
            if (!sql) throw new Error("sql or table/data is required");
            
            const result = await execSqlite(sql, dbPath);
            return { ok: result.exitCode === 0, sql, error: result.stderr || undefined };
          }

          case "tables": {
            const result = await execSqlite("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", dbPath);
            if (result.exitCode !== 0) return { ok: false, error: result.stderr };
            const tables = result.stdout.trim().split("\n").filter(Boolean);
            return { ok: true, tables };
          }

          case "schema": {
            const table = input?.table;
            const sql = table
              ? `SELECT sql FROM sqlite_master WHERE type='table' AND name='${table}'`
              : "SELECT name, sql FROM sqlite_master WHERE type='table'";
            const result = await execSqlite(sql, dbPath);
            return { ok: result.exitCode === 0, schema: result.stdout, error: result.stderr || undefined };
          }

          case "describe":
          case "analyze": {
            const table = input?.table;
            if (!table) throw new Error("table is required");
            
            const pragmaResult = await execSqlite(`PRAGMA table_info(${table})`, dbPath);
            const countResult = await execSqlite(`SELECT COUNT(*) as count FROM ${table}`, dbPath);
            
            const columns = pragmaResult.stdout.trim().split("\n").map(line => {
              const parts = line.split("|");
              return {
                name: parts[1],
                type: parts[2],
                notNull: parts[3] === "1",
                default: parts[4],
                primaryKey: parts[5] === "1"
              };
            });
            
            const count = parseInt(countResult.stdout.trim()) || 0;
            
            const statsResults = await Promise.all(
              columns.filter(c => c.type?.includes("INT") || c.type?.includes("REAL") || c.type?.includes("NUM")).map(async (col) => {
                const statsSql = `SELECT 
                  MIN(${col.name}) as min, 
                  MAX(${col.name}) as max, 
                  AVG(${col.name}) as avg,
                  SUM(CASE WHEN ${col.name} IS NULL THEN 1 ELSE 0 END) as nulls
                FROM ${table}`;
                const r = await execSqlite(statsSql, dbPath);
                const [min, max, avg, nulls] = r.stdout.trim().split("|");
                return { column: col.name, min, max, avg, nulls: parseInt(nulls) || 0 };
              })
            );
            
            return { ok: true, table, rowCount: count, columns, numericStats: statsResults };
          }

          case "export": {
            const table = input?.table;
            const format = input?.format || "csv";
            const outputPath = input?.outputPath || path.join(dataDir, `${table}.${format}`);
            
            let sql = input?.sql || `SELECT * FROM ${table}`;
            
            if (format === "csv") {
              const result = await execSqlite(`.headers on\n.mode csv\n.output ${outputPath}\n${sql}\n.output stdout`, dbPath);
              return { ok: result.exitCode === 0, path: outputPath, format };
            }
            
            const result = await execSqlite(`${sql}\n.headers on\n.mode list`, dbPath);
            if (result.exitCode !== 0) return { ok: false, error: result.stderr };
            
            const rows = parseSqlResults(result.stdout);
            await writeFile(outputPath, JSON.stringify(rows, null, 2), "utf8");
            return { ok: true, path: outputPath, format: "json", rowCount: rows.length };
          }

          case "create_table": {
            const table = input?.table;
            const columns = input?.columns;
            if (!table || !columns) throw new Error("table and columns are required");
            
            const sql = `CREATE TABLE IF NOT EXISTS ${table} (${columns.join(", ")})`;
            const result = await execSqlite(sql, dbPath);
            return { ok: result.exitCode === 0, table, sql, error: result.stderr || undefined };
          }

          case "drop_table": {
            const table = input?.table;
            if (!table) throw new Error("table is required");
            
            const sql = `DROP TABLE IF EXISTS ${table}`;
            const result = await execSqlite(sql, dbPath);
            return { ok: result.exitCode === 0, table, error: result.stderr || undefined };
          }

          default:
            throw new Error(`Unsupported action '${action}' for SQLite`);
        }
      }

      case "postgresql": {
        const connStr = getConnectionString();
        
        switch (action) {
          case "query": {
            const sql = input?.sql;
            if (!sql) throw new Error("sql is required");
            
            const result = await execPsql(sql, connStr);
            if (result.exitCode !== 0) return { ok: false, error: result.stderr };
            
            const rows = parseSqlResults(result.stdout);
            return { ok: true, rows, rowCount: rows.length };
          }

          case "execute":
          case "insert":
          case "update":
          case "delete": {
            let sql = input?.sql;
            const table = input?.table;
            const data = input?.data;
            const where = input?.where;
            
            if (!sql && action === "insert" && table && data) {
              const cols = Object.keys(data);
              const vals = Object.values(data).map(escapeValue);
              sql = `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${vals.join(", ")})`;
            }
            
            if (!sql && action === "update" && table && data && where) {
              const sets = Object.entries(data).map(([k, v]) => `${k} = ${escapeValue(v)}`).join(", ");
              sql = `UPDATE ${table} SET ${sets} ${buildWhereClause(where)}`;
            }
            
            if (!sql && action === "delete" && table && where) {
              sql = `DELETE FROM ${table} ${buildWhereClause(where)}`;
            }
            
            if (!sql) throw new Error("sql or table/data is required");
            
            const result = await execPsql(sql, connStr);
            return { ok: result.exitCode === 0, sql, error: result.stderr || undefined };
          }

          case "tables": {
            const result = await execPsql("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename", connStr);
            if (result.exitCode !== 0) return { ok: false, error: result.stderr };
            const tables = result.stdout.trim().split("\n").filter(Boolean);
            return { ok: true, tables };
          }

          case "describe":
          case "analyze": {
            const table = input?.table;
            if (!table) throw new Error("table is required");
            
            const colResult = await execPsql(`
              SELECT column_name, data_type, is_nullable, column_default
              FROM information_schema.columns
              WHERE table_name = '${table}'
              ORDER BY ordinal_position
            `, connStr);
            
            const rows = parseSqlResults(colResult.stdout);
            return { ok: true, table, columns: rows };
          }

          default:
            throw new Error(`Unsupported action '${action}' for PostgreSQL`);
        }
      }

      case "mysql": {
        switch (action) {
          case "query": {
            const sql = input?.sql;
            if (!sql) throw new Error("sql is required");
            
            const result = await execMysql(sql, dbConfig);
            if (result.exitCode !== 0) return { ok: false, error: result.stderr };
            
            return { ok: true, output: result.stdout };
          }

          case "execute":
          case "insert":
          case "update":
          case "delete": {
            let sql = input?.sql;
            const table = input?.table;
            const data = input?.data;
            const where = input?.where;
            
            if (!sql && action === "insert" && table && data) {
              const cols = Object.keys(data);
              const vals = Object.values(data).map(escapeValue);
              sql = `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${vals.join(", ")})`;
            }
            
            if (!sql && action === "update" && table && data && where) {
              const sets = Object.entries(data).map(([k, v]) => `${k} = ${escapeValue(v)}`).join(", ");
              sql = `UPDATE ${table} SET ${sets} ${buildWhereClause(where)}`;
            }
            
            if (!sql && action === "delete" && table && where) {
              sql = `DELETE FROM ${table} ${buildWhereClause(where)}`;
            }
            
            if (!sql) throw new Error("sql or table/data is required");
            
            const result = await execMysql(sql, dbConfig);
            return { ok: result.exitCode === 0, sql, error: result.stderr || undefined };
          }

          case "tables": {
            const result = await execMysql("SHOW TABLES", dbConfig);
            if (result.exitCode !== 0) return { ok: false, error: result.stderr };
            const tables = result.stdout.trim().split("\n").filter(Boolean).slice(1);
            return { ok: true, tables };
          }

          default:
            throw new Error(`Unsupported action '${action}' for MySQL`);
        }
      }

      case "mongodb": {
        const execMongosh = (script) => {
          return new Promise((resolve) => {
            let stdout = "";
            let stderr = "";
            
            const args = [getConnectionString(), "--eval", script, "--quiet"];
            const child = spawn("mongosh", args, { windowsHide: true });
            
            const timeoutId = setTimeout(() => {
              child.kill("SIGTERM");
              resolve({ exitCode: -1, stdout, stderr, timedOut: true });
            }, 60000);
            
            child.stdout?.on("data", (data) => { stdout += data.toString(); });
            child.stderr?.on("data", (data) => { stderr += data.toString(); });
            
            child.on("close", (code) => {
              clearTimeout(timeoutId);
              resolve({ exitCode: code, stdout, stderr });
            });
            
            child.on("error", (err) => {
              clearTimeout(timeoutId);
              resolve({ exitCode: -1, stdout, stderr, error: err.message });
            });
          });
        };

        switch (action) {
          case "query":
          case "find": {
            const collection = input?.collection || input?.table;
            const query = input?.query || input?.where || {};
            const limit = input?.limit || 100;
            
            if (!collection) throw new Error("collection is required");
            
            const script = `db.${collection}.find(${JSON.stringify(query)}).limit(${limit}).toArray()`;
            const result = await execMongosh(script);
            
            if (result.exitCode !== 0) return { ok: false, error: result.stderr };
            
            try {
              const docs = JSON.parse(result.stdout);
              return { ok: true, documents: docs, count: docs.length };
            } catch {
              return { ok: true, output: result.stdout };
            }
          }

          case "insert": {
            const collection = input?.collection || input?.table;
            const data = input?.data;
            
            if (!collection || !data) throw new Error("collection and data are required");
            
            const script = `db.${collection}.insertOne(${JSON.stringify(data)})`;
            const result = await execMongosh(script);
            return { ok: result.exitCode === 0, error: result.stderr || undefined };
          }

          case "update": {
            const collection = input?.collection || input?.table;
            const query = input?.query || input?.where || {};
            const data = input?.data;
            
            if (!collection || !data) throw new Error("collection and data are required");
            
            const script = `db.${collection}.updateMany(${JSON.stringify(query)}, {$set: ${JSON.stringify(data)}})`;
            const result = await execMongosh(script);
            return { ok: result.exitCode === 0, error: result.stderr || undefined };
          }

          case "delete": {
            const collection = input?.collection || input?.table;
            const query = input?.query || input?.where || {};
            
            if (!collection) throw new Error("collection is required");
            
            const script = `db.${collection}.deleteMany(${JSON.stringify(query)})`;
            const result = await execMongosh(script);
            return { ok: result.exitCode === 0, error: result.stderr || undefined };
          }

          case "aggregate": {
            const collection = input?.collection || input?.table;
            const pipeline = input?.pipeline || [];
            
            if (!collection) throw new Error("collection is required");
            
            const script = `db.${collection}.aggregate(${JSON.stringify(pipeline)}).toArray()`;
            const result = await execMongosh(script);
            
            if (result.exitCode !== 0) return { ok: false, error: result.stderr };
            
            try {
              const docs = JSON.parse(result.stdout);
              return { ok: true, results: docs };
            } catch {
              return { ok: true, output: result.stdout };
            }
          }

          case "collections":
          case "tables": {
            const script = "db.getCollectionNames()";
            const result = await execMongosh(script);
            
            if (result.exitCode !== 0) return { ok: false, error: result.stderr };
            
            try {
              const collections = JSON.parse(result.stdout);
              return { ok: true, collections };
            } catch {
              return { ok: true, output: result.stdout };
            }
          }

          default:
            throw new Error(`Unsupported action '${action}' for MongoDB`);
        }
      }

      case "redis": {
        const execRedisCli = (args) => {
          return new Promise((resolve) => {
            let stdout = "";
            let stderr = "";
            
            const fullArgs = [`-h${dbConfig.host || "localhost"}`, `-p${dbConfig.port || 6379}`, ...args];
            const child = spawn("redis-cli", fullArgs, { windowsHide: true });
            
            const timeoutId = setTimeout(() => {
              child.kill("SIGTERM");
              resolve({ exitCode: -1, stdout, stderr, timedOut: true });
            }, 30000);
            
            child.stdout?.on("data", (data) => { stdout += data.toString(); });
            child.stderr?.on("data", (data) => { stderr += data.toString(); });
            
            child.on("close", (code) => {
              clearTimeout(timeoutId);
              resolve({ exitCode: code, stdout, stderr });
            });
            
            child.on("error", (err) => {
              clearTimeout(timeoutId);
              resolve({ exitCode: -1, stdout, stderr, error: err.message });
            });
          });
        };

        switch (action) {
          case "query":
          case "get": {
            const key = input?.table || input?.key;
            if (!key) throw new Error("key is required");
            
            const result = await execRedisCli(["GET", key]);
            return { ok: result.exitCode === 0, key, value: result.stdout?.trim() };
          }

          case "insert":
          case "set": {
            const key = input?.table || input?.key;
            const value = input?.data?.value || input?.data;
            
            if (!key || value === undefined) throw new Error("key and value are required");
            
            const result = await execRedisCli(["SET", key, typeof value === "object" ? JSON.stringify(value) : String(value)]);
            return { ok: result.exitCode === 0, key, error: result.stderr || undefined };
          }

          case "delete":
          case "del": {
            const key = input?.table || input?.key;
            if (!key) throw new Error("key is required");
            
            const result = await execRedisCli(["DEL", key]);
            return { ok: result.exitCode === 0, key, deleted: result.stdout?.trim() === "1" };
          }

          case "tables":
          case "keys": {
            const pattern = input?.where?.pattern || "*";
            const result = await execRedisCli(["KEYS", pattern]);
            
            if (result.exitCode !== 0) return { ok: false, error: result.stderr };
            const keys = result.stdout.trim().split("\n").filter(Boolean);
            return { ok: true, keys, count: keys.length };
          }

          case "analyze":
          case "info": {
            const result = await execRedisCli(["INFO"]);
            return { ok: result.exitCode === 0, info: result.stdout };
          }

          default:
            throw new Error(`Unsupported action '${action}' for Redis`);
        }
      }

      default:
        throw new Error(`Unsupported database type: ${dbType}`);
    }
  }
};
