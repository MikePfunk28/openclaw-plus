import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, readdir, stat, watch } from "node:fs/promises";
import path from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export const skill = {
  id: "codebase-analyzer",
  name: "Codebase Analyzer",
  description: "Analyze and index codebases - AST parsing, symbol extraction, dependency graphs, knowledge base creation. Supports JS/TS, Python, Go, Rust, Java, C/C++.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["index", "symbols", "dependencies", "structure", "ast", "search", "knowledge", "watch", "graph", "analyze", "diff", "summarize"],
        description: "Analysis action"
      },
      path: { type: "string", description: "Path to analyze" },
      file: { type: "string", description: "Single file to analyze" },
      pattern: { type: "string", description: "File pattern (glob)" },
      query: { type: "string", description: "Search query" },
      symbolType: { type: "string", enum: ["function", "class", "interface", "variable", "import", "export", "all"] },
      language: { type: "string", description: "Language filter" },
      depth: { type: "number", description: "Analysis depth" },
      output: { type: "string", description: "Output file path" },
      options: { type: "object", additionalProperties: true }
    },
    required: ["action"],
    additionalProperties: false
  },
  async run({ input, workspaceRoot }) {
    const action = input?.action;
    const targetPath = input?.path || ".";
    const file = input?.file;
    const pattern = input?.pattern || "**/*.{js,mjs,ts,tsx,py,go,rs,java,c,cpp,h}";
    const query = input?.query;
    const symbolType = input?.symbolType || "all";
    const language = input?.language;
    const depth = input?.depth || 3;
    const output = input?.output;
    const options = input?.options || {};

    const knowledgeDir = path.join(workspaceRoot, ".knowledge");
    const indexDir = path.join(knowledgeDir, "index");
    await mkdir(indexDir, { recursive: true });

    const execPython = (code, timeoutMs = 120000) => {
      return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        const child = spawn("uv", ["run", "python", "-c", code], {
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
        return { ok: false, error: result.stderr || result.error || "Execution failed" };
      }
      try {
        return { ok: true, ...JSON.parse(result.stdout) };
      } catch {
        return { ok: true, output: result.stdout };
      }
    };

    const execCmd = (cmd, args, cwd, timeoutMs = 60000) => {
      return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        const child = spawn(cmd, args, { cwd, windowsHide: true });
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

    const resolvePath = (p) => path.resolve(workspaceRoot, p);

    switch (action) {
      case "index": {
        const rootPath = resolvePath(targetPath);
        const indexPath = path.join(indexDir, "codebase-index.json");
        
        const code = `
import os
import json
import re
from pathlib import Path
from collections import defaultdict

root = "${rootPath.replace(/\\/g, "/")}"
index = {
    "files": {},
    "symbols": defaultdict(list),
    "imports": defaultdict(list),
    "exports": defaultdict(list),
    "dependencies": set(),
    "structure": {}
}

EXT_MAP = {
    ".js": "javascript", ".mjs": "javascript", ".cjs": "javascript",
    ".ts": "typescript", ".tsx": "typescript",
    ".py": "python",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".c": "c", ".cpp": "cpp", ".h": "c", ".hpp": "cpp"
}

def get_language(ext):
    return EXT_MAP.get(ext.lower(), "unknown")

def extract_js_symbols(content, filepath):
    symbols = []
    patterns = [
        (r'(?:export\\s+)?(?:async\\s+)?function\\s+(\\w+)', 'function'),
        (r'(?:export\\s+)?const\\s+(\\w+)\\s*=', 'variable'),
        (r'(?:export\\s+)?let\\s+(\\w+)\\s*=', 'variable'),
        (r'(?:export\\s+)?class\\s+(\\w+)', 'class'),
        (r'(?:export\\s+)?interface\\s+(\\w+)', 'interface'),
        (r'(?:export\\s+)?type\\s+(\\w+)', 'type'),
        (r'export\\s+\\{([^}]+)\\}', 'export'),
        (r'import\\s+.*?from\\s+[\'"]([^\'"]+)[\'"]', 'import'),
    ]
    for pattern, stype in patterns:
        for match in re.finditer(pattern, content, re.MULTILINE):
            if stype == 'export':
                names = [n.strip() for n in match.group(1).split(',')]
                for name in names:
                    symbols.append({"name": name, "type": "export", "file": filepath})
            elif stype == 'import':
                symbols.append({"name": match.group(1), "type": "import", "file": filepath})
            else:
                line = content[:match.start()].count('\\n') + 1
                symbols.append({"name": match.group(1), "type": stype, "file": filepath, "line": line})
    return symbols

def extract_py_symbols(content, filepath):
    symbols = []
    patterns = [
        (r'def\\s+(\\w+)\\s*\\(', 'function'),
        (r'async\\s+def\\s+(\\w+)\\s*\\(', 'async_function'),
        (r'class\\s+(\\w+)', 'class'),
        (r'from\\s+(\\w+(?:\\.\\w+)*)\\s+import', 'import'),
        (r'import\\s+(\\w+(?:\\.\\w+)*)', 'import'),
    ]
    for pattern, stype in patterns:
        for match in re.finditer(pattern, content, re.MULTILINE):
            line = content[:match.start()].count('\\n') + 1
            symbols.append({"name": match.group(1), "type": stype, "file": filepath, "line": line})
    return symbols

def extract_go_symbols(content, filepath):
    symbols = []
    patterns = [
        (r'func\\s+(?:\\([^)]+\\)\\s*)?(\\w+)\\s*\\(', 'function'),
        (r'type\\s+(\\w+)\\s+struct', 'struct'),
        (r'type\\s+(\\w+)\\s+interface', 'interface'),
        (r'import\\s+"([^"]+)"', 'import'),
    ]
    for pattern, stype in patterns:
        for match in re.finditer(pattern, content, re.MULTILINE):
            line = content[:match.start()].count('\\n') + 1
            symbols.append({"name": match.group(1), "type": stype, "file": filepath, "line": line})
    return symbols

file_count = 0
total_lines = 0

for root_dir, dirs, files in os.walk(root):
    dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ['node_modules', '__pycache__', 'venv', '.git', 'dist', 'build']]
    
    for filename in files:
        ext = Path(filename).suffix.lower()
        if ext not in EXT_MAP:
            continue
        
        filepath = os.path.join(root_dir, filename)
        rel_path = os.path.relpath(filepath, root)
        
        try:
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
        except:
            continue
        
        lines = content.count('\\n') + 1
        total_lines += lines
        file_count += 1
        
        lang = get_language(ext)
        file_info = {
            "path": rel_path,
            "language": lang,
            "lines": lines,
            "size": os.path.getsize(filepath)
        }
        index["files"][rel_path] = file_info
        
        if lang in ['javascript', 'typescript']:
            symbols = extract_js_symbols(content, rel_path)
        elif lang == 'python':
            symbols = extract_py_symbols(content, rel_path)
        elif lang == 'go':
            symbols = extract_go_symbols(content, rel_path)
        else:
            symbols = []
        
        for sym in symbols:
            index["symbols"][sym["type"]].append(sym)

index["symbols"] = {k: v for k, v in index["symbols"].items()}
index["stats"] = {
    "totalFiles": file_count,
    "totalLines": total_lines,
    "languages": {},
    "symbolCounts": {k: len(v) for k, v in index["symbols"].items()}
}

for f in index["files"].values():
    lang = f["language"]
    index["stats"]["languages"][lang] = index["stats"]["languages"].get(lang, 0) + 1

with open("${indexPath.replace(/\\/g, "/")}", 'w') as f:
    json.dump(index, f, indent=2)

print(json.dumps({"ok": True, "indexPath": "${indexPath.replace(/\\/g, "/")}", "stats": index["stats"]}))
`;
        return parseResult(await execPython(code, 300000));
      }

      case "symbols": {
        const indexPath = path.join(indexDir, "codebase-index.json");
        if (!existsSync(indexPath)) {
          return { ok: false, error: "Run 'index' first to create the codebase index" };
        }
        
        const index = JSON.parse(readFileSync(indexPath, "utf8"));
        let symbols = [];
        
        if (symbolType === "all") {
          for (const [type, syms] of Object.entries(index.symbols || {})) {
            symbols.push(...syms.map(s => ({ ...s, category: type })));
          }
        } else {
          symbols = (index.symbols?.[symbolType] || []).map(s => ({ ...s, category: symbolType }));
        }
        
        if (query) {
          const q = query.toLowerCase();
          symbols = symbols.filter(s => s.name?.toLowerCase().includes(q));
        }
        
        return { ok: true, symbols: symbols.slice(0, 100), total: symbols.length };
      }

      case "dependencies": {
        const rootPath = resolvePath(targetPath);
        const deps = { npm: [], python: [], go: [], other: [] };
        
        const packageJsonPath = path.join(rootPath, "package.json");
        if (existsSync(packageJsonPath)) {
          try {
            const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
            const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
            deps.npm = Object.entries(allDeps).map(([name, version]) => ({ name, version }));
          } catch {}
        }
        
        const requirementsPath = path.join(rootPath, "requirements.txt");
        if (existsSync(requirementsPath)) {
          try {
            const content = readFileSync(requirementsPath, "utf8");
            deps.python = content.split("\n")
              .filter(line => line.trim() && !line.startsWith("#"))
              .map(line => {
                const [name, version] = line.trim().split(/[=<>!]+/);
                return { name: name?.trim(), version: version?.trim() || "latest" };
              });
          } catch {}
        }
        
        const goModPath = path.join(rootPath, "go.mod");
        if (existsSync(goModPath)) {
          try {
            const content = readFileSync(goModPath, "utf8");
            const lines = content.split("\n");
            let inRequire = false;
            for (const line of lines) {
              if (line.includes("require (")) { inRequire = true; continue; }
              if (inRequire && line.includes(")")) { inRequire = false; continue; }
              if (inRequire || line.startsWith("require ")) {
                const match = line.match(/(\S+)\s+(v?\d+[^ ]*)/);
                if (match) deps.go.push({ name: match[1], version: match[2] });
              }
            }
          } catch {}
        }
        
        return { ok: true, dependencies: deps };
      }

      case "structure": {
        const rootPath = resolvePath(targetPath);
        const code = `
import os
import json
from pathlib import Path

root = "${rootPath.replace(/\\/g, "/")}"
max_depth = ${depth}

def get_structure(path, depth=0):
    if depth > max_depth:
        return None
    
    try:
        items = []
        for item in sorted(os.listdir(path)):
            if item.startswith('.') or item in ['node_modules', '__pycache__', 'venv', '.git', 'dist', 'build']:
                continue
            
            full_path = os.path.join(path, item)
            is_dir = os.path.isdir(full_path)
            
            entry = {
                "name": item,
                "type": "directory" if is_dir else "file",
                "path": os.path.relpath(full_path, root)
            }
            
            if is_dir and depth < max_depth:
                children = get_structure(full_path, depth + 1)
                if children:
                    entry["children"] = children
            
            items.append(entry)
        return items
    except:
        return []

structure = get_structure(root)
print(json.dumps({"ok": True, "structure": structure, "root": "${targetPath}"}))
`;
        return parseResult(await execPython(code));
      }

      case "ast": {
        if (!file) throw new Error("file is required for AST analysis");
        const filePath = resolvePath(file);
        
        if (!existsSync(filePath)) {
          return { ok: false, error: `File not found: ${filePath}` };
        }
        
        const ext = path.extname(filePath);
        const code = `
import json
import re

filepath = "${filePath.replace(/\\/g, "/")}"
with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

ext = "${ext}"
ast_nodes = []

if ext in ['.js', '.mjs', '.cjs', '.ts', '.tsx']:
    patterns = [
        (r'(?:export\\s+)?(?:async\\s+)?function\\s+(\\w+)\\s*\\(([^)]*)\\)', 'FunctionDeclaration'),
        (r'(?:export\\s+)?const\\s+(\\w+)\\s*=\\s*(?:async\\s+)?(?:\\([^)]*\\)|[^=])\\s*=>', 'ArrowFunctionExpression'),
        (r'(?:export\\s+)?class\\s+(\\w+)(?:\\s+extends\\s+(\\w+))?', 'ClassDeclaration'),
        (r'interface\\s+(\\w+)(?:\\s+extends\\s+(\\w+))?', 'InterfaceDeclaration'),
        (r'type\\s+(\\w+)\\s*=', 'TypeAlias'),
        (r'import\\s+(?:\\{([^}]+)\\}|(\\w+))(?:\\s*,\\s*\\{([^}]+)\\})?\\s*from\\s*[\'"]([^\'"]+)[\'"]', 'ImportDeclaration'),
        (r'export\\s+(?:default\\s+)?(?:function\\s+)?(\\w+)', 'ExportDeclaration'),
    ]
    for pattern, node_type in patterns:
        for match in re.finditer(pattern, content, re.MULTILINE):
            line = content[:match.start()].count('\\n') + 1
            end_line = content[:match.end()].count('\\n') + 1
            node = {
                "type": node_type,
                "startLine": line,
                "endLine": end_line,
                "raw": match.group(0)[:200]
            }
            if node_type == 'FunctionDeclaration':
                node["name"] = match.group(1)
                node["params"] = [p.strip() for p in match.group(2).split(',') if p.strip()]
            elif node_type == 'ClassDeclaration':
                node["name"] = match.group(1)
                node["extends"] = match.group(2) if len(match.groups()) > 1 else None
            elif node_type == 'InterfaceDeclaration':
                node["name"] = match.group(1)
            elif node_type == 'ImportDeclaration':
                node["source"] = match.group(match.lastindex)
            elif node_type == 'ExportDeclaration':
                node["name"] = match.group(1)
            ast_nodes.append(node)

elif ext == '.py':
    patterns = [
        (r'def\\s+(\\w+)\\s*\\(([^)]*)\\)', 'FunctionDef'),
        (r'async\\s+def\\s+(\\w+)\\s*\\(([^)]*)\\)', 'AsyncFunctionDef'),
        (r'class\\s+(\\w+)(?:\\s*\\(([^)]*)\\))?', 'ClassDef'),
        (r'from\\s+([\\w.]+)\\s+import\\s+(.+)', 'ImportFrom'),
        (r'import\\s+([\\w.]+)', 'Import'),
        (r'@(\\w+)', 'Decorator'),
    ]
    for pattern, node_type in patterns:
        for match in re.finditer(pattern, content, re.MULTILINE):
            line = content[:match.start()].count('\\n') + 1
            node = {"type": node_type, "line": line, "raw": match.group(0)[:200]}
            if node_type in ['FunctionDef', 'AsyncFunctionDef']:
                node["name"] = match.group(1)
                node["params"] = [p.strip() for p in match.group(2).split(',') if p.strip()]
            elif node_type == 'ClassDef':
                node["name"] = match.group(1)
                node["bases"] = match.group(2).split(',') if match.group(2) else []
            elif node_type == 'ImportFrom':
                node["module"] = match.group(1)
                node["names"] = [n.strip() for n in match.group(2).split(',')]
            elif node_type == 'Import':
                node["module"] = match.group(1)
            elif node_type == 'Decorator':
                node["name"] = match.group(1)
            ast_nodes.append(node)

print(json.dumps({"ok": True, "file": "${file}", "nodes": ast_nodes, "totalLines": content.count(chr(10)) + 1}))
`;
        return parseResult(await execPython(code));
      }

      case "search": {
        if (!query) throw new Error("query is required for search");
        
        const rootPath = resolvePath(targetPath);
        const result = await execCmd("rg", [
          "-i", "--json", "-C", "2",
          query,
          rootPath
        ], rootPath, 30000);
        
        if (result.exitCode !== 0 && !result.stdout) {
          return { ok: true, matches: [], message: "No matches found" };
        }
        
        const matches = [];
        for (const line of result.stdout.split("\n").filter(Boolean)) {
          try {
            const data = JSON.parse(line);
            if (data.type === "match") {
              matches.push({
                file: data.data?.path?.text,
                line: data.data?.line_number,
                text: data.data?.lines?.text?.trim(),
                matches: data.data?.submatches?.map(s => s.match?.text)
              });
            }
          } catch {}
        }
        
        return { ok: true, matches: matches.slice(0, 50), total: matches.length, query };
      }

      case "knowledge": {
        const rootPath = resolvePath(targetPath);
        const indexPath = path.join(indexDir, "codebase-index.json");
        const knowledgePath = path.join(knowledgeDir, "knowledge-base.json");
        
        let indexData = {};
        if (existsSync(indexPath)) {
          indexData = JSON.parse(readFileSync(indexPath, "utf8"));
        }
        
        const knowledge = {
          generated: new Date().toISOString(),
          root: targetPath,
          summary: {
            totalFiles: indexData.stats?.totalFiles || 0,
            totalLines: indexData.stats?.totalLines || 0,
            languages: indexData.stats?.languages || {},
            symbolCounts: indexData.stats?.symbolCounts || {}
          },
          architecture: {
            entryPoints: [],
            coreModules: [],
            utilities: [],
            tests: [],
            configs: []
          },
          patterns: [],
          recommendations: []
        };
        
        for (const [filePath, fileData] of Object.entries(indexData.files || {})) {
          if (filePath.includes("test") || filePath.includes("spec")) {
            knowledge.architecture.tests.push(filePath);
          } else if (filePath.startsWith("src/") || filePath.startsWith("lib/")) {
            if (fileData.language === "typescript" || fileData.language === "javascript") {
              if (filePath.includes("util") || filePath.includes("helper")) {
                knowledge.architecture.utilities.push(filePath);
              } else if (filePath.includes("index")) {
                knowledge.architecture.entryPoints.push(filePath);
              } else {
                knowledge.architecture.coreModules.push(filePath);
              }
            }
          } else if (filePath.endsWith(".json") || filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
            knowledge.architecture.configs.push(filePath);
          }
        }
        
        const allSymbols = Object.values(indexData.symbols || {}).flat();
        const functionCount = allSymbols.filter(s => s.type?.includes("function")).length;
        const classCount = allSymbols.filter(s => s.type === "class").length;
        
        if (functionCount > 50) {
          knowledge.patterns.push("Large codebase with many functions - consider modularization");
        }
        if (classCount > 20) {
          knowledge.patterns.push("Object-oriented architecture with multiple classes");
        }
        
        knowledge.recommendations = [
          "Review entry points for API surface area",
          "Analyze test coverage ratio",
          "Check for circular dependencies",
          "Review utility function reusability"
        ];
        
        writeFileSync(knowledgePath, JSON.stringify(knowledge, null, 2));
        
        return { ok: true, knowledge, path: knowledgePath };
      }

      case "graph": {
        const indexPath = path.join(indexDir, "codebase-index.json");
        if (!existsSync(indexPath)) {
          return { ok: false, error: "Run 'index' first" };
        }
        
        const indexData = JSON.parse(readFileSync(indexPath, "utf8"));
        const graph = { nodes: [], edges: [] };
        const nodeMap = new Map();
        
        for (const [filePath, fileData] of Object.entries(indexData.files || {})) {
          const nodeId = `file:${filePath}`;
          nodeMap.set(filePath, nodeId);
          graph.nodes.push({
            id: nodeId,
            type: "file",
            label: path.basename(filePath),
            path: filePath,
            language: fileData.language,
            lines: fileData.lines
          });
        }
        
        for (const imp of (indexData.symbols?.import || [])) {
          const sourceId = nodeMap.get(imp.file);
          if (!sourceId) continue;
          
          let targetPath = imp.name;
          if (!targetPath.startsWith(".")) continue;
          
          const dir = path.dirname(imp.file);
          const resolved = path.normalize(path.join(dir, targetPath));
          
          for (const [filePath] of Object.entries(indexData.files || {})) {
            if (filePath.startsWith(resolved) || resolved.startsWith(filePath.replace(/\.[^.]+$/, ""))) {
              const targetId = nodeMap.get(filePath);
              if (targetId && sourceId !== targetId) {
                graph.edges.push({
                  source: sourceId,
                  target: targetId,
                  type: "imports"
                });
              }
            }
          }
        }
        
        const graphPath = path.join(knowledgeDir, "dependency-graph.json");
        writeFileSync(graphPath, JSON.stringify(graph, null, 2));
        
        return { ok: true, graph, path: graphPath, stats: { nodes: graph.nodes.length, edges: graph.edges.length } };
      }

      case "analyze": {
        const rootPath = resolvePath(targetPath);
        
        const analysis = {
          path: targetPath,
          timestamp: new Date().toISOString(),
          overview: {},
          codeQuality: {},
          security: {},
          performance: {},
          recommendations: []
        };
        
        const indexPath = path.join(indexDir, "codebase-index.json");
        if (existsSync(indexPath)) {
          const indexData = JSON.parse(readFileSync(indexPath, "utf8"));
          analysis.overview = {
            files: indexData.stats?.totalFiles || 0,
            lines: indexData.stats?.totalLines || 0,
            languages: indexData.stats?.languages || {},
            functions: indexData.stats?.symbolCounts?.function || 0,
            classes: indexData.stats?.symbolCounts?.class || 0
          };
        }
        
        const packageJsonPath = path.join(rootPath, "package.json");
        if (existsSync(packageJsonPath)) {
          const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
          analysis.overview.name = pkg.name;
          analysis.overview.version = pkg.version;
          analysis.overview.description = pkg.description;
          
          if (pkg.scripts?.test) analysis.codeQuality.hasTests = true;
          if (pkg.scripts?.lint) analysis.codeQuality.hasLinting = true;
          if (pkg.devDependencies?.typescript) analysis.codeQuality.usesTypeScript = true;
        }
        
        const gitignorePath = path.join(rootPath, ".gitignore");
        analysis.security.hasGitignore = existsSync(gitignorePath);
        
        const envExamplePath = path.join(rootPath, ".env.example");
        analysis.security.hasEnvExample = existsSync(envExamplePath);
        
        if (analysis.overview.lines && analysis.overview.lines > 10000) {
          analysis.recommendations.push("Large codebase - consider splitting into modules");
        }
        if (!analysis.codeQuality.hasTests) {
          analysis.recommendations.push("Add test suite for code reliability");
        }
        if (!analysis.codeQuality.hasLinting) {
          analysis.recommendations.push("Add linting configuration");
        }
        
        return { ok: true, analysis };
      }

      case "diff": {
        const code = `
import subprocess
import json
import os

os.chdir("${workspaceRoot.replace(/\\/g, "/")}")
result = subprocess.run(["git", "diff", "--stat", "HEAD~1"], capture_output=True, text=True)
diff_output = result.stdout + result.stderr

files_changed = []
for line in diff_output.strip().split('\\n'):
    if '|' in line:
        parts = line.split('|')
        filename = parts[0].strip()
        changes = parts[1].strip() if len(parts) > 1 else ''
        files_changed.append({"file": filename, "changes": changes})

print(json.dumps({"ok": True, "filesChanged": files_changed[:50], "raw": diff_output[:2000]}))
`;
        return parseResult(await execPython(code));
      }

      case "summarize": {
        const indexPath = path.join(indexDir, "codebase-index.json");
        const knowledgePath = path.join(knowledgeDir, "knowledge-base.json");
        
        let summary = { generated: new Date().toISOString() };
        
        if (existsSync(indexPath)) {
          const indexData = JSON.parse(readFileSync(indexPath, "utf8"));
          summary.stats = indexData.stats;
          summary.topFiles = Object.entries(indexData.files || {})
            .sort((a, b) => (b[1].lines || 0) - (a[1].lines || 0))
            .slice(0, 10)
            .map(([path, data]) => ({ path, lines: data.lines, language: data.language }));
        }
        
        if (existsSync(knowledgePath)) {
          const knowledgeData = JSON.parse(readFileSync(knowledgePath, "utf8"));
          summary.architecture = knowledgeData.architecture;
          summary.patterns = knowledgeData.patterns;
          summary.recommendations = knowledgeData.recommendations;
        }
        
        return { ok: true, summary };
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }
};
