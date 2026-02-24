import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";

export const skill = {
  id: "data-processing",
  name: "Data Processing",
  description: "Data processing operations with pandas, numpy - load, clean, transform, aggregate, merge, filter datasets. Supports CSV, JSON, Parquet, Excel, SQL.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["load", "info", "head", "describe", "clean", "filter", "select", "transform", "aggregate", "groupby", "merge", "join", "concat", "pivot", "melt", "sort", "drop", "fill", "resample", "rolling", "apply", "save", "convert", "analyze", "profile", "validate", "dedupe", "sample", "split", "stats"],
        description: "Data processing action"
      },
      source: {
        type: "string",
        description: "Source file path or connection string"
      },
      sources: {
        type: "array",
        description: "Multiple source files for merge/concat",
        items: { type: "string" }
      },
      output: {
        type: "string",
        description: "Output file path"
      },
      format: {
        type: "string",
        enum: ["csv", "json", "parquet", "excel", "html", "markdown", "sql"],
        description: "Output format"
      },
      columns: {
        type: "array",
        description: "Columns to select",
        items: { type: "string" }
      },
      dropColumns: {
        type: "array",
        description: "Columns to drop",
        items: { type: "string" }
      },
      where: {
        type: "object",
        description: "Filter conditions"
      },
      groupBy: {
        type: "array",
        description: "Columns to group by",
        items: { type: "string" }
      },
      aggregations: {
        type: "object",
        description: "Aggregation functions per column"
      },
      sortBy: {
        type: "string",
        description: "Column to sort by"
      },
      ascending: {
        type: "boolean",
        description: "Sort ascending (default true)"
      },
      limit: {
        type: "number",
        description: "Limit number of rows"
      },
      offset: {
        type: "number",
        description: "Skip first N rows"
      },
      fillMethod: {
        type: "string",
        enum: ["ffill", "bfill", "mean", "median", "mode", "constant", "interpolate"],
        description: "Method to fill missing values"
      },
      fillValue: {
        type: "string",
        description: "Value to use for constant fill"
      },
      rename: {
        type: "object",
        description: "Column rename mapping {old: new}"
      },
      transformExpr: {
        type: "string",
        description: "Python expression for transformation"
      },
      mergeOn: {
        type: "array",
        description: "Columns to merge on",
        items: { type: "string" }
      },
      how: {
        type: "string",
        enum: ["inner", "outer", "left", "right"],
        description: "Merge type"
      },
      pivotIndex: { type: "string" },
      pivotColumns: { type: "string" },
      pivotValues: { type: "string" },
      meltIdVars: { type: "array", items: { type: "string" } },
      meltValueVars: { type: "array", items: { type: "string" } },
      sampleSize: { type: "number" },
      sampleFrac: { type: "number" },
      randomState: { type: "number" },
      options: {
        type: "object",
        description: "Additional options",
        additionalProperties: true
      }
    },
    required: ["action"],
    additionalProperties: false
  },
  async run({ input, workspaceRoot }) {
    const action = input?.action;
    const source = input?.source;
    const sources = input?.sources;
    const output = input?.output;
    const format = input?.format || "csv";
    const columns = input?.columns;
    const dropColumns = input?.dropColumns;
    const where = input?.where;
    const groupBy = input?.groupBy;
    const aggregations = input?.aggregations;
    const sortBy = input?.sortBy;
    const ascending = input?.ascending !== false;
    const limit = input?.limit;
    const offset = input?.offset;
    const fillMethod = input?.fillMethod;
    const fillValue = input?.fillValue;
    const rename = input?.rename;
    const transformExpr = input?.transformExpr;
    const mergeOn = input?.mergeOn;
    const how = input?.how || "inner";
    const options = input?.options || {};

    const dataDir = path.join(workspaceRoot, "data");
    const outputDir = path.join(workspaceRoot, "output");
    await mkdir(dataDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });

    const execPython = (code, timeoutMs = 120000) => {
      return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        
        const child = spawn("uv", ["run", "--with", "pandas", "--with", "numpy", "python", "-c", code], {
          env: { ...process.env, PYTHONIOENCODING: "utf-8", UV_SYSTEM_PYTHON: "1" },
          windowsHide: true,
          cwd: workspaceRoot
        });

        const timeoutId = setTimeout(() => {
          child.kill("SIGTERM");
          resolve({ exitCode: -1, stdout, stderr, timedOut: true });
        }, timeoutMs);

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

    const parseResult = (result) => {
      if (result.exitCode !== 0) {
        return { ok: false, error: result.stderr || result.error || "Python execution failed" };
      }
      try {
        const parsed = JSON.parse(result.stdout);
        return { ok: true, ...parsed };
      } catch {
        return { ok: true, output: result.stdout };
      }
    };

    const getSourcePath = (src) => {
      if (!src) return null;
      if (src.startsWith("http") || src.startsWith("s3://") || src.startsWith("gs://")) {
        return src;
      }
      return path.resolve(workspaceRoot, src).replace(/\\/g, "/");
    };

    const loadCode = (src, varName = "df") => {
      const srcPath = getSourcePath(src);
      if (src.endsWith(".parquet") || src.endsWith(".pq")) {
        return `${varName} = pd.read_parquet("${srcPath}")`;
      }
      if (src.endsWith(".xlsx") || src.endsWith(".xls")) {
        return `${varName} = pd.read_excel("${srcPath}")`;
      }
      if (src.endsWith(".json") || src.endsWith(".jsonl")) {
        return `${varName} = pd.read_json("${srcPath}", lines=${src.endsWith(".jsonl") ? "True" : "False"})`;
      }
      return `${varName} = pd.read_csv("${srcPath}")`;
    };

    const saveCode = (varName = "df", outputPath, fmt) => {
      const op = path.resolve(workspaceRoot, outputPath).replace(/\\/g, "/");
      if (fmt === "parquet") return `${varName}.to_parquet("${op}", index=False)`;
      if (fmt === "json") return `${varName}.to_json("${op}", orient='records', indent=2)`;
      if (fmt === "excel") return `${varName}.to_excel("${op}", index=False)`;
      if (fmt === "html") return `${varName}.to_html("${op}", index=False)`;
      if (fmt === "markdown") return `${varName}.to_markdown("${op}", index=False)`;
      return `${varName}.to_csv("${op}", index=False)`;
    };

    const baseCode = `
import pandas as pd
import numpy as np
import json
import sys

def json_serialize(obj):
    if hasattr(obj, 'to_dict'):
        return obj.to_dict()
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, (np.int64, np.int32)):
        return int(obj)
    if isinstance(obj, (np.float64, np.float32)):
        return float(obj)
    if pd.isna(obj):
        return None
    return str(obj)

def output(data):
    print(json.dumps(data, default=json_serialize))
`;

    switch (action) {
      case "load": {
        if (!source) throw new Error("source is required");
        const srcPath = getSourcePath(source);
        const code = `${baseCode}
${loadCode(source)}
result = {
    "shape": list(df.shape),
    "columns": list(df.columns),
    "dtypes": {col: str(dt) for col, dt in df.dtypes.items()},
    "memoryUsage": int(df.memory_usage(deep=True).sum())
}
output(result)
`;
        return parseResult(await execPython(code));
      }

      case "info": {
        if (!source) throw new Error("source is required");
        const code = `${baseCode}
${loadCode(source)}
import io
buf = io.StringIO()
df.info(buf=buf)
result = {
    "shape": list(df.shape),
    "columns": list(df.columns),
    "dtypes": {col: str(dt) for col, dt in df.dtypes.items()},
    "info": buf.getvalue(),
    "memoryUsage": int(df.memory_usage(deep=True).sum())
}
output(result)
`;
        return parseResult(await execPython(code));
      }

      case "head": {
        if (!source) throw new Error("source is required");
        const n = limit || 10;
        const code = `${baseCode}
${loadCode(source)}
result = df.head(${n}).to_dict(orient='records')
output({"rows": result, "count": len(result)})
`;
        return parseResult(await execPython(code));
      }

      case "describe": {
        if (!source) throw new Error("source is required");
        const code = `${baseCode}
${loadCode(source)}
desc = df.describe(include='all').to_dict()
result = {"describe": desc}
output(result)
`;
        return parseResult(await execPython(code));
      }

      case "stats": {
        if (!source) throw new Error("source is required");
        const cols = columns ? `columns = ${JSON.stringify(columns)}` : "columns = df.columns.tolist()";
        const code = `${baseCode}
${loadCode(source)}
${cols}
stats = {}
for col in columns:
    if col not in df.columns:
        continue
    col_data = df[col]
    stats[col] = {
        "count": int(col_data.count()),
        "nulls": int(col_data.isna().sum()),
        "unique": int(col_data.nunique()),
    }
    if pd.api.types.is_numeric_dtype(col_data):
        stats[col].update({
            "mean": float(col_data.mean()) if not col_data.isna().all() else None,
            "std": float(col_data.std()) if not col_data.isna().all() else None,
            "min": float(col_data.min()) if not col_data.isna().all() else None,
            "max": float(col_data.max()) if not col_data.isna().all() else None,
            "median": float(col_data.median()) if not col_data.isna().all() else None,
        })
    if pd.api.types.is_string_dtype(col_data):
        mode_val = col_data.mode()
        stats[col]["mode"] = str(mode_val.iloc[0]) if len(mode_val) > 0 else None
output(stats)
`;
        return parseResult(await execPython(code));
      }

      case "clean": {
        if (!source) throw new Error("source is required");
        const code = `${baseCode}
${loadCode(source)}
original_shape = df.shape

# Drop duplicates
df = df.drop_duplicates()

# Strip whitespace from string columns
for col in df.select_dtypes(include=['object']).columns:
    df[col] = df[col].astype(str).str.strip()
    df[col] = df[col].replace('nan', np.nan)

# Convert numeric-looking strings to numbers
for col in df.columns:
    try:
        df[col] = pd.to_numeric(df[col], errors='ignore')
    except:
        pass

# Standardize column names
df.columns = df.columns.str.lower().str.replace(' ', '_').str.replace('[^a-z0-9_]', '', regex=True)

result = {
    "originalShape": list(original_shape),
    "newShape": list(df.shape),
    "duplicatesRemoved": original_shape[0] - df.shape[0],
    "columns": list(df.columns)
}

${output ? saveCode("df", output, format) : ""}
output(result)
`;
        const result = await execPython(code);
        const parsed = parseResult(result);
        if (parsed.ok && output) parsed.outputPath = path.resolve(workspaceRoot, output);
        return parsed;
      }

      case "filter": {
        if (!source) throw new Error("source is required");
        const conditions = where ? Object.entries(where).map(([k, v]) => {
          if (typeof v === "object" && v?.op) {
            const op = v.op;
            const val = v.value;
            if (op === "==" || op === "eq") return `df['${k}'] == ${JSON.stringify(val)}`;
            if (op === "!=" || op === "ne") return `df['${k}'] != ${JSON.stringify(val)}`;
            if (op === ">" || op === "gt") return `df['${k}'] > ${val}`;
            if (op === ">=" || op === "gte") return `df['${k}'] >= ${val}`;
            if (op === "<" || op === "lt") return `df['${k}'] < ${val}`;
            if (op === "<=" || op === "lte") return `df['${k}'] <= ${val}`;
            if (op === "in") return `df['${k}'].isin(${JSON.stringify(val)})`;
            if (op === "contains") return `df['${k}'].astype(str).str.contains('${val}', na=False)`;
            if (op === "startswith") return `df['${k}'].astype(str).str.startswith('${val}', na=False)`;
            if (op === "endswith") return `df['${k}'].astype(str).str.endswith('${val}', na=False)`;
          }
          if (Array.isArray(v)) return `df['${k}'].isin(${JSON.stringify(v)})`;
          if (v === null) return `df['${k}'].isna()`;
          return `df['${k}'] == ${JSON.stringify(v)}`;
        }).join(" & ") : "";

        const code = `${baseCode}
${loadCode(source)}
original_count = len(df)
${conditions ? `df = df[${conditions}]` : ""}
${offset ? `df = df.iloc[${offset}:]` : ""}
${limit ? `df = df.head(${limit})` : ""}
${output ? saveCode("df", output, format) : ""}
result = {"originalCount": original_count, "filteredCount": len(df), "rows": df.to_dict(orient='records')[:100]}
output(result)
`;
        const result = await execPython(code);
        const parsed = parseResult(result);
        if (parsed.ok && output) parsed.outputPath = path.resolve(workspaceRoot, output);
        return parsed;
      }

      case "select": {
        if (!source) throw new Error("source is required");
        if (!columns || columns.length === 0) throw new Error("columns is required");
        const code = `${baseCode}
${loadCode(source)}
df = df[${JSON.stringify(columns)}]
${output ? saveCode("df", output, format) : ""}
result = {"columns": list(df.columns), "rowCount": len(df)}
output(result)
`;
        const result = await execPython(code);
        const parsed = parseResult(result);
        if (parsed.ok && output) parsed.outputPath = path.resolve(workspaceRoot, output);
        return parsed;
      }

      case "drop": {
        if (!source) throw new Error("source is required");
        const code = `${baseCode}
${loadCode(source)}
${dropColumns ? `df = df.drop(columns=${JSON.stringify(dropColumns)})` : ""}
${where ? `condition = ${Object.entries(where).map(([k, v]) => `df['${k}'] != ${JSON.stringify(v)}`).join(" & ")}; df = df[condition]` : ""}
${output ? saveCode("df", output, format) : ""}
result = {"columns": list(df.columns), "rowCount": len(df)}
output(result)
`;
        const result = await execPython(code);
        const parsed = parseResult(result);
        if (parsed.ok && output) parsed.outputPath = path.resolve(workspaceRoot, output);
        return parsed;
      }

      case "fill": {
        if (!source) throw new Error("source is required");
        const colSpec = columns ? `columns = ${JSON.stringify(columns)}` : "columns = df.columns.tolist()";
        let fillCode = "";
        if (fillMethod === "ffill") fillCode = "df[columns] = df[columns].ffill()";
        else if (fillMethod === "bfill") fillCode = "df[columns] = df[columns].bfill()";
        else if (fillMethod === "mean") fillCode = "df[columns] = df[columns].fillna(df[columns].mean(numeric_only=True))";
        else if (fillMethod === "median") fillCode = "df[columns] = df[columns].fillna(df[columns].median(numeric_only=True))";
        else if (fillMethod === "mode") fillCode = "df[columns] = df[columns].fillna(df[columns].mode().iloc[0])";
        else if (fillMethod === "interpolate") fillCode = "df[columns] = df[columns].interpolate()";
        else fillCode = `df[columns] = df[columns].fillna(${JSON.stringify(fillValue ?? "")})`;

        const code = `${baseCode}
${loadCode(source)}
${colSpec}
null_before = int(df.isna().sum().sum())
${fillCode}
null_after = int(df.isna().sum().sum())
${output ? saveCode("df", output, format) : ""}
result = {"nullsBefore": null_before, "nullsAfter": null_after, "filled": null_before - null_after}
output(result)
`;
        const result = await execPython(code);
        const parsed = parseResult(result);
        if (parsed.ok && output) parsed.outputPath = path.resolve(workspaceRoot, output);
        return parsed;
      }

      case "transform": {
        if (!source) throw new Error("source is required");
        const code = `${baseCode}
${loadCode(source)}
${columns ? `cols = ${JSON.stringify(columns)}; df[cols] = df[cols].apply(lambda x: ${transformExpr})` : `df = df.apply(lambda x: ${transformExpr})`}
${rename ? `df = df.rename(columns=${JSON.stringify(rename)})` : ""}
${output ? saveCode("df", output, format) : ""}
result = {"columns": list(df.columns), "rowCount": len(df)}
output(result)
`;
        const result = await execPython(code);
        const parsed = parseResult(result);
        if (parsed.ok && output) parsed.outputPath = path.resolve(workspaceRoot, output);
        return parsed;
      }

      case "aggregate":
      case "groupby": {
        if (!source) throw new Error("source is required");
        const gb = groupBy || [];
        const aggList = aggregations ? Object.entries(aggregations).flatMap(([col, funcs]) => 
          (Array.isArray(funcs) ? funcs : [funcs]).map(f => `('${col}', '${f}')`)
        ).join(", ") : "";
        
        const code = `${baseCode}
${loadCode(source)}
${gb.length > 0 ? `
agg_funcs = [${aggList}]
result_df = df.groupby(${JSON.stringify(gb)}).agg({col: func for col, func in agg_funcs})
` : `
result_df = df.agg(${JSON.stringify(aggregations)})
`}
${output ? saveCode("result_df", output, format) : ""}
result = {"aggregations": result_df.reset_index().to_dict(orient='records')}
output(result)
`;
        const result = await execPython(code);
        const parsed = parseResult(result);
        if (parsed.ok && output) parsed.outputPath = path.resolve(workspaceRoot, output);
        return parsed;
      }

      case "merge":
      case "join": {
        if (!sources || sources.length < 2) throw new Error("at least 2 sources required");
        const code = `${baseCode}
${loadCode(sources[0], "df1")}
${loadCode(sources[1], "df2")}
merged = pd.merge(df1, df2, on=${JSON.stringify(mergeOn || [])}, how='${how}')
${output ? saveCode("merged", output, format) : ""}
result = {"columns": list(merged.columns), "rowCount": len(merged)}
output(result)
`;
        const result = await execPython(code);
        const parsed = parseResult(result);
        if (parsed.ok && output) parsed.outputPath = path.resolve(workspaceRoot, output);
        return parsed;
      }

      case "concat": {
        if (!sources || sources.length < 2) throw new Error("at least 2 sources required");
        const loadAll = sources.map((s, i) => loadCode(s, `df${i}`)).join("\n");
        const dfsList = sources.map((_, i) => `df${i}`).join(", ");
        const code = `${baseCode}
${loadAll}
concatenated = pd.concat([${dfsList}], ignore_index=True)
${output ? saveCode("concatenated", output, format) : ""}
result = {"columns": list(concatenated.columns), "rowCount": len(concatenated)}
output(result)
`;
        const result = await execPython(code);
        const parsed = parseResult(result);
        if (parsed.ok && output) parsed.outputPath = path.resolve(workspaceRoot, output);
        return parsed;
      }

      case "sort": {
        if (!source) throw new Error("source is required");
        if (!sortBy) throw new Error("sortBy is required");
        const code = `${baseCode}
${loadCode(source)}
df = df.sort_values(by='${sortBy}', ascending=${ascending})
${limit ? `df = df.head(${limit})` : ""}
${output ? saveCode("df", output, format) : ""}
result = {"rowCount": len(df), "sortedBy": "${sortBy}"}
output(result)
`;
        const result = await execPython(code);
        const parsed = parseResult(result);
        if (parsed.ok && output) parsed.outputPath = path.resolve(workspaceRoot, output);
        return parsed;
      }

      case "pivot": {
        if (!source) throw new Error("source is required");
        const code = `${baseCode}
${loadCode(source)}
pivot = df.pivot(index='${input.pivotIndex}', columns='${input.pivotColumns}', values='${input.pivotValues}')
${output ? saveCode("pivot", output, format) : ""}
result = {"shape": list(pivot.shape), "columns": list(pivot.columns)}
output(result)
`;
        const result = await execPython(code);
        const parsed = parseResult(result);
        if (parsed.ok && output) parsed.outputPath = path.resolve(workspaceRoot, output);
        return parsed;
      }

      case "melt": {
        if (!source) throw new Error("source is required");
        const code = `${baseCode}
${loadCode(source)}
melted = df.melt(id_vars=${JSON.stringify(input.meltIdVars || [])}, value_vars=${JSON.stringify(input.meltValueVars || None)})
${output ? saveCode("melted", output, format) : ""}
result = {"rowCount": len(melted)}
output(result)
`;
        const result = await execPython(code);
        const parsed = parseResult(result);
        if (parsed.ok && output) parsed.outputPath = path.resolve(workspaceRoot, output);
        return parsed;
      }

      case "sample": {
        if (!source) throw new Error("source is required");
        const code = `${baseCode}
${loadCode(source)}
${input.sampleFrac ? `df = df.sample(frac=${input.sampleFrac}, random_state=${input.randomState || 'None'})` : `df = df.sample(n=${input.sampleSize || 100}, random_state=${input.randomState || 'None'})`}
${output ? saveCode("df", output, format) : ""}
result = {"rowCount": len(df)}
output(result)
`;
        const result = await execPython(code);
        const parsed = parseResult(result);
        if (parsed.ok && output) parsed.outputPath = path.resolve(workspaceRoot, output);
        return parsed;
      }

      case "split": {
        if (!source) throw new Error("source is required");
        const ratio = options.trainRatio || 0.8;
        const randomState = input.randomState || 42;
        const code = `${baseCode}
${loadCode(source)}
train = df.sample(frac=${ratio}, random_state=${randomState})
test = df.drop(train.index)
train_path = "${path.resolve(workspaceRoot, output?.replace(/\.([^.]+)$/, '_train.$1') || 'data/train.csv')}"
test_path = "${path.resolve(workspaceRoot, output?.replace(/\.([^.]+)$/, '_test.$1') || 'data/test.csv')}"
train.to_csv(train_path, index=False)
test.to_csv(test_path, index=False)
result = {"trainRows": len(train), "testRows": len(test), "trainPath": train_path, "testPath": test_path, "ratio": ${ratio}}
output(result)
`;
        return parseResult(await execPython(code));
      }

      case "convert": {
        if (!source) throw new Error("source is required");
        if (!output) throw new Error("output is required");
        const code = `${baseCode}
${loadCode(source)}
${saveCode("df", output, format)}
result = {"input": "${source}", "output": "${output}", "format": "${format}"}
output(result)
`;
        const result = await execPython(code);
        const parsed = parseResult(result);
        if (parsed.ok) parsed.outputPath = path.resolve(workspaceRoot, output);
        return parsed;
      }

      case "dedupe": {
        if (!source) throw new Error("source is required");
        const subset = columns ? JSON.stringify(columns) : "None";
        const code = `${baseCode}
${loadCode(source)}
original_count = len(df)
df = df.drop_duplicates(subset=${subset})
${output ? saveCode("df", output, format) : ""}
result = {"originalCount": original_count, "dedupedCount": len(df), "duplicatesRemoved": original_count - len(df)}
output(result)
`;
        const result = await execPython(code);
        const parsed = parseResult(result);
        if (parsed.ok && output) parsed.outputPath = path.resolve(workspaceRoot, output);
        return parsed;
      }

      case "profile": {
        if (!source) throw new Error("source is required");
        const code = `${baseCode}
${loadCode(source)}
profile = {
    "shape": list(df.shape),
    "columns": []
}
for col in df.columns:
    col_profile = {
        "name": col,
        "dtype": str(df[col].dtype),
        "count": int(df[col].count()),
        "nulls": int(df[col].isna().sum()),
        "nullPercent": round(df[col].isna().sum() / len(df) * 100, 2) if len(df) > 0 else 0,
        "unique": int(df[col].nunique()),
    }
    if pd.api.types.is_numeric_dtype(df[col]):
        col_profile.update({
            "min": float(df[col].min()) if not df[col].isna().all() else None,
            "max": float(df[col].max()) if not df[col].isna().all() else None,
            "mean": float(df[col].mean()) if not df[col].isna().all() else None,
            "median": float(df[col].median()) if not df[col].isna().all() else None,
            "std": float(df[col].std()) if not df[col].isna().all() else None,
        })
    profile["columns"].append(col_profile)
output(profile)
`;
        return parseResult(await execPython(code));
      }

      case "validate": {
        if (!source) throw new Error("source is required");
        const code = `${baseCode}
${loadCode(source)}
issues = []

for col in df.columns:
    null_count = df[col].isna().sum()
    if null_count > 0:
        issues.append({"column": col, "issue": "nulls", "count": int(null_count)})

for col in df.select_dtypes(include=[np.number]).columns:
    q1 = df[col].quantile(0.25)
    q3 = df[col].quantile(0.75)
    iqr = q3 - q1
    outliers = ((df[col] < (q1 - 1.5 * iqr)) | (df[col] > (q3 + 1.5 * iqr))).sum()
    if outliers > 0:
        issues.append({"column": col, "issue": "outliers", "count": int(outliers)})

dupes = df.duplicated().sum()
if dupes > 0:
    issues.append({"column": "_all", "issue": "duplicates", "count": int(dupes)})

result = {"valid": len(issues) == 0, "issues": issues, "totalIssues": len(issues)}
output(result)
`;
        return parseResult(await execPython(code));
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }
};
