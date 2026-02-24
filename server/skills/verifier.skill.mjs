import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { existsSync, readFileSync, statSync } from "node:fs";

export const skill = {
  id: "verifier",
  name: "Verifier",
  description: "Verify implementation matches specs - drift detection, spec compliance, code quality checks, implementation validation.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["verify", "drift_detect", "compliance", "quality", "validate", "compare", "checksum", "snapshot", "diff", "report", "audit"],
        description: "Verifier action"
      },
      specId: { type: "string", description: "Specification ID to verify against" },
      target: { type: "string", description: "Target file/directory to verify" },
      baseline: { type: "string", description: "Baseline snapshot/directory" },
      strict: { type: "boolean", description: "Enable strict verification" },
      checks: { type: "array", items: { type: "string" }, description: "Specific checks to run" },
      output: { type: "string", description: "Output file path" },
      options: { type: "object", additionalProperties: true }
    },
    required: ["action"],
    additionalProperties: false
  },
  async run({ input, workspaceRoot }) {
    const action = input?.action;
    const specId = input?.specId;
    const target = input?.target;
    const baseline = input?.baseline;
    const strict = input?.strict !== false;
    const checks = input?.checks || [];
    const output = input?.output;
    const options = input?.options || {};

    const verifyDir = path.join(workspaceRoot, ".knowledge", "verification");
    const snapshotsDir = path.join(verifyDir, "snapshots");
    await mkdir(verifyDir, { recursive: true });
    await mkdir(snapshotsDir, { recursive: true });

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

    const loadSpec = (id) => {
      const specPath = path.join(workspaceRoot, ".knowledge", "specs", `${id}.json`);
      if (existsSync(specPath)) {
        return JSON.parse(readFileSync(specPath, "utf8"));
      }
      return null;
    };

    switch (action) {
      case "verify": {
        const results = {
          id: `VERIFY-${Date.now()}`,
          timestamp: new Date().toISOString(),
          specId,
          target,
          passed: true,
          checks: [],
          failures: [],
          warnings: []
        };
        
        const spec = specId ? loadSpec(specId) : null;
        
        if (spec) {
          for (const req of spec.requirements || []) {
            const check = {
              id: req.id,
              type: "requirement",
              description: req.text,
              status: "unknown",
              details: []
            };
            
            if (target && existsSync(path.resolve(workspaceRoot, target))) {
              const content = readFileSync(path.resolve(workspaceRoot, target), "utf8");
              
              const keywords = req.text.toLowerCase().split(/\s+/).filter(w => w.length > 3);
              const foundKeywords = keywords.filter(k => content.toLowerCase().includes(k));
              
              if (foundKeywords.length > keywords.length * 0.5) {
                check.status = "likely_implemented";
                check.details.push(`Found ${foundKeywords.length}/${keywords.length} relevant keywords`);
              } else {
                check.status = "not_found";
                check.details.push(`Only found ${foundKeywords.length}/${keywords.length} relevant keywords`);
                if (strict) {
                  results.failures.push(check);
                }
              }
            }
            
            results.checks.push(check);
          }
          
          for (const ac of spec.acceptanceCriteria || []) {
            results.checks.push({
              id: ac.id,
              type: "acceptance_criteria",
              description: ac.then || ac.requirement,
              status: "manual_verification_needed",
              automated: false
            });
          }
        }
        
        results.passed = results.failures.length === 0;
        
        const outputPath = output || path.join(verifyDir, `verify-${Date.now()}.json`);
        await writeFile(outputPath, JSON.stringify(results, null, 2), "utf8");
        
        return { ok: results.passed, ...results, path: outputPath };
      }

      case "drift_detect": {
        const baselinePath = baseline || path.join(snapshotsDir, "baseline.json");
        const currentPath = target || workspaceRoot;
        
        const drift = {
          id: `DRIFT-${Date.now()}`,
          timestamp: new Date().toISOString(),
          baseline: baselinePath,
          target: currentPath,
          changes: [],
          added: [],
          removed: [],
          modified: [],
          driftScore: 0
        };
        
        if (!existsSync(baselinePath)) {
          return { ok: false, error: `Baseline not found: ${baselinePath}. Run snapshot first.` };
        }
        
        const baselineData = JSON.parse(readFileSync(baselinePath, "utf8"));
        
        const code = `
import os
import json
import hashlib
from pathlib import Path

root = "${currentPath.replace(/\\/g, "/")}"
baseline = ${JSON.stringify(baselineData.files || baselineData)}

def get_file_hash(filepath):
    try:
        with open(filepath, 'rb') as f:
            return hashlib.sha256(f.read()).hexdigest()
    except:
        return None

def scan_directory(root_path):
    files = {}
    for root_dir, dirs, files_list in os.walk(root_path):
        dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ['node_modules', '__pycache__', 'dist', 'build']]
        
        for filename in files_list:
            filepath = os.path.join(root_dir, filename)
            rel_path = os.path.relpath(filepath, root_path)
            try:
                stat = os.stat(filepath)
                files[rel_path] = {
                    "hash": get_file_hash(filepath),
                    "size": stat.st_size,
                    "modified": stat.st_mtime
                }
            except:
                pass
    return files

current = scan_directory(root)

added = [f for f in current if f not in baseline]
removed = [f for f in baseline if f not in current]
modified = []

for f in current:
    if f in baseline:
        if current[f].get("hash") != baseline[f].get("hash"):
            modified.append({
                "file": f,
                "baselineHash": baseline[f].get("hash")[:16],
                "currentHash": current[f].get("hash")[:16]
            })

total_files = len(set(list(current.keys()) + list(baseline.keys())))
drift_score = (len(added) + len(removed) + len(modified)) / max(total_files, 1) * 100

print(json.dumps({
    "ok": True,
    "added": added[:50],
    "removed": removed[:50],
    "modified": modified[:50],
    "stats": {
        "addedCount": len(added),
        "removedCount": len(removed),
        "modifiedCount": len(modified),
        "totalFiles": total_files,
        "driftScore": round(drift_score, 2)
    }
}))
`;
        const result = parseResult(await execPython(code));
        
        if (result.ok) {
          drift.added = result.added;
          drift.removed = result.removed;
          drift.modified = result.modified;
          drift.driftScore = result.stats?.driftScore || 0;
          drift.stats = result.stats;
        }
        
        drift.hasDrift = drift.added.length > 0 || drift.removed.length > 0 || drift.modified.length > 0;
        
        const outputPath = output || path.join(verifyDir, `drift-${Date.now()}.json`);
        await writeFile(outputPath, JSON.stringify(drift, null, 2), "utf8");
        
        return { 
          ok: !drift.hasDrift || !strict, 
          ...drift, 
          path: outputPath,
          message: drift.hasDrift 
            ? `Drift detected: ${drift.added.length} added, ${drift.removed.length} removed, ${drift.modified.length} modified`
            : "No drift detected"
        };
      }

      case "compliance": {
        const spec = specId ? loadSpec(specId) : null;
        
        const compliance = {
          id: `COMPLIANCE-${Date.now()}`,
          timestamp: new Date().toISOString(),
          specId,
          overallScore: 0,
          categories: {},
          issues: [],
          recommendations: []
        };
        
        if (spec) {
          const totalReqs = spec.requirements?.length || 0;
          const totalAC = spec.acceptanceCriteria?.length || 0;
          
          compliance.categories.requirements = {
            total: totalReqs,
            implemented: 0,
            pending: totalReqs,
            score: 0
          };
          
          compliance.categories.acceptanceCriteria = {
            total: totalAC,
            verified: 0,
            pending: totalAC,
            score: 0
          };
          
          compliance.categories.userStories = {
            total: spec.userStories?.length || 0,
            completed: 0,
            pending: spec.userStories?.length || 0,
            score: 0
          };
          
          compliance.overallScore = Math.round(
            (compliance.categories.requirements.score +
            compliance.categories.acceptanceCriteria.score +
            compliance.categories.userStories.score) / 3
          );
        }
        
        const code = `
import os
import json

root = "${workspaceRoot.replace(/\\/g, "/")}"

compliance_checks = {
    "has_readme": os.path.exists(os.path.join(root, "README.md")),
    "has_license": os.path.exists(os.path.join(root, "LICENSE")),
    "has_package_json": os.path.exists(os.path.join(root, "package.json")),
    "has_gitignore": os.path.exists(os.path.join(root, ".gitignore")),
    "has_env_example": os.path.exists(os.path.join(root, ".env.example")),
    "has_tests": os.path.exists(os.path.join(root, "tests")) or os.path.exists(os.path.join(root, "test")),
    "has_ci": os.path.exists(os.path.join(root, ".github", "workflows")),
    "has_docker": os.path.exists(os.path.join(root, "Dockerfile")) or os.path.exists(os.path.join(root, "docker-compose.yml")),
}

issues = []
if not compliance_checks["has_readme"]:
    issues.append({"severity": "warning", "message": "Missing README.md"})
if not compliance_checks["has_tests"]:
    issues.append({"severity": "error", "message": "No test directory found"})
if not compliance_checks["has_gitignore"]:
    issues.append({"severity": "warning", "message": "Missing .gitignore"})

score = sum(compliance_checks.values()) / len(compliance_checks) * 100

print(json.dumps({
    "ok": True,
    "checks": compliance_checks,
    "issues": issues,
    "score": round(score, 2)
}))
`;
        const result = parseResult(await execPython(code));
        
        if (result.ok) {
          compliance.checks = result.checks;
          compliance.issues = [...compliance.issues, ...result.issues];
          compliance.overallScore = result.score;
        }
        
        const outputPath = output || path.join(verifyDir, `compliance-${Date.now()}.json`);
        await writeFile(outputPath, JSON.stringify(compliance, null, 2), "utf8");
        
        return { ok: compliance.overallScore >= 70, ...compliance, path: outputPath };
      }

      case "quality": {
        const code = `
import os
import json
import re

root = "${workspaceRoot.replace(/\\/g, "/")}"

quality_metrics = {
    "code_quality": {},
    "documentation": {},
    "testing": {},
    "security": {},
    "maintainability": {}
}

# Count files
js_files = 0
ts_files = 0
py_files = 0
total_lines = 0
comment_lines = 0
todo_count = 0
fixme_count = 0

for root_dir, dirs, files in os.walk(root):
    dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ['node_modules', '__pycache__', 'dist', 'build', '.git']]
    
    for f in files:
        ext = os.path.splitext(f)[1].lower()
        if ext in ['.js', '.mjs', '.cjs']:
            js_files += 1
        elif ext in ['.ts', '.tsx']:
            ts_files += 1
        elif ext == '.py':
            py_files += 1
        
        if ext in ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.py']:
            filepath = os.path.join(root_dir, f)
            try:
                with open(filepath, 'r', encoding='utf-8', errors='ignore') as file:
                    content = file.read()
                    total_lines += content.count('\\n') + 1
                    comment_lines += len(re.findall(r'^(//|#|/\\*|\\*)', content, re.MULTILINE))
                    todo_count += len(re.findall(r'\\bTODO\\b', content, re.IGNORECASE))
                    fixme_count += len(re.findall(r\\bFIXME\\b', content, re.IGNORECASE))
            except:
                pass

quality_metrics["code_quality"] = {
    "jsFiles": js_files,
    "tsFiles": ts_files,
    "pyFiles": py_files,
    "totalLines": total_lines,
    "commentRatio": round(comment_lines / max(total_lines, 1) * 100, 2)
}

quality_metrics["maintainability"] = {
    "todos": todo_count,
    "fixmes": fixme_count,
    "technicalDebtScore": todo_count * 2 + fixme_count * 5
}

quality_metrics["documentation"] = {
    "hasReadme": os.path.exists(os.path.join(root, "README.md")),
    "hasContributing": os.path.exists(os.path.join(root, "CONTRIBUTING.md")),
    "hasChangelog": os.path.exists(os.path.join(root, "CHANGELOG.md"))
}

quality_metrics["testing"] = {
    "hasTests": os.path.exists(os.path.join(root, "tests")) or os.path.exists(os.path.join(root, "test")),
    "hasPytest": os.path.exists(os.path.join(root, "pytest.ini")),
    "hasJest": os.path.exists(os.path.join(root, "jest.config.js")) or os.path.exists(os.path.join(root, "jest.config.ts"))
}

quality_metrics["security"] = {
    "hasGitignore": os.path.exists(os.path.join(root, ".gitignore")),
    "hasEnvExample": os.path.exists(os.path.join(root, ".env.example")),
    "hasDependaBot": os.path.exists(os.path.join(root, ".github", "dependabot.yml"))
}

# Calculate overall score
score = 0
if quality_metrics["documentation"]["hasReadme"]: score += 20
if quality_metrics["testing"]["hasTests"]: score += 25
if quality_metrics["security"]["hasGitignore"]: score += 15
if quality_metrics["security"]["hasEnvExample"]: score += 10
if quality_metrics["code_quality"]["commentRatio"] > 10: score += 10
if quality_metrics["maintainability"]["technicalDebtScore"] < 20: score += 20

print(json.dumps({
    "ok": True,
    "metrics": quality_metrics,
    "overallScore": score,
    "grade": "A" if score >= 90 else "B" if score >= 80 else "C" if score >= 70 else "D" if score >= 60 else "F"
}))
`;
        return parseResult(await execPython(code));
      }

      case "validate": {
        const results = {
          valid: true,
          errors: [],
          warnings: []
        };
        
        const spec = specId ? loadSpec(specId) : null;
        
        if (spec) {
          if (!spec.title || spec.title.length < 3) {
            results.errors.push({ field: "title", message: "Title missing or too short" });
            results.valid = false;
          }
          
          if (!spec.requirements || spec.requirements.length === 0) {
            results.warnings.push({ field: "requirements", message: "No requirements defined" });
          }
          
          for (const req of spec.requirements || []) {
            if (!req.text) {
              results.errors.push({ field: `requirement.${req.id}`, message: "Requirement text is empty" });
              results.valid = false;
            }
          }
          
          for (const story of spec.userStories || []) {
            if (!story.asA || !story.iWant || !story.soThat) {
              results.warnings.push({ field: `userStory.${story.id}`, message: "Incomplete user story" });
            }
          }
        }
        
        return { ok: results.valid, ...results };
      }

      case "snapshot": {
        const targetPath = target ? path.resolve(workspaceRoot, target) : workspaceRoot;
        const snapshotName = options.name || `snapshot-${Date.now()}`;
        const outputPath = output || path.join(snapshotsDir, `${snapshotName}.json`);
        
        const code = `
import os
import json
import hashlib
from pathlib import Path

root = "${targetPath.replace(/\\/g, "/")}"

def get_file_hash(filepath):
    try:
        with open(filepath, 'rb') as f:
            return hashlib.sha256(f.read()).hexdigest()
    except:
        return None

snapshot = {
    "name": "${snapshotName}",
    "created": "${new Date().toISOString()}",
    "root": "${targetPath.replace(/\\/g, "/")}",
    "files": {}
}

for root_dir, dirs, files_list in os.walk(root):
    dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ['node_modules', '__pycache__', 'dist', 'build', '.git']]
    
    for filename in files_list:
        filepath = os.path.join(root_dir, filename)
        rel_path = os.path.relpath(filepath, root)
        
        ext = os.path.splitext(filename)[1].lower()
        if ext not in ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.py', '.go', '.rs', '.java', '.json', '.yaml', '.yml', '.md']:
            continue
        
        try:
            stat = os.stat(filepath)
            snapshot["files"][rel_path] = {
                "hash": get_file_hash(filepath),
                "size": stat.st_size,
                "modified": stat.st_mtime
            }
        except:
            pass

snapshot["stats"] = {
    "totalFiles": len(snapshot["files"]),
    "totalSize": sum(f["size"] for f in snapshot["files"].values())
}

print(json.dumps({"ok": True, "snapshot": snapshot, "path": "${outputPath.replace(/\\/g, "/")}"}))
`;
        const result = parseResult(await execPython(code));
        
        if (result.ok && result.snapshot) {
          await writeFile(outputPath, JSON.stringify(result.snapshot, null, 2), "utf8");
        }
        
        return { ok: true, snapshot: result.snapshot, path: outputPath };
      }

      case "checksum": {
        const targetPath = target ? path.resolve(workspaceRoot, target) : workspaceRoot;
        
        const code = `
import os
import json
import hashlib

target = "${targetPath.replace(/\\/g, "/")}"

if os.path.isfile(target):
    with open(target, 'rb') as f:
        checksum = hashlib.sha256(f.read()).hexdigest()
    size = os.path.getsize(target)
    print(json.dumps({"ok": True, "file": target, "sha256": checksum, "size": size}))
elif os.path.isdir(target):
    checksums = {}
    for root, dirs, files in os.walk(target):
        dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ['node_modules', '__pycache__', 'dist', 'build']]
        for f in files:
            filepath = os.path.join(root, f)
            rel_path = os.path.relpath(filepath, target)
            try:
                with open(filepath, 'rb') as file:
                    checksums[rel_path] = hashlib.sha256(file.read()).hexdigest()
            except:
                pass
    
    combined = hashlib.sha256(''.join(sorted(checksums.values())).encode()).hexdigest()
    print(json.dumps({"ok": True, "directory": target, "combinedSha256": combined, "fileCount": len(checksums), "files": checksums}))
else:
    print(json.dumps({"ok": False, "error": "Target not found"}))
`;
        return parseResult(await execPython(code));
      }

      case "diff": {
        const baselinePath = baseline;
        const currentPath = target;
        
        if (!baselinePath || !currentPath) {
          return { ok: false, error: "baseline and target are required for diff" };
        }
        
        const code = `
import subprocess
import json
import os

os.chdir("${workspaceRoot.replace(/\\/g, "/")}")

result = subprocess.run(
    ["git", "diff", "--no-color", "${baselinePath}", "${currentPath}"],
    capture_output=True,
    text=True
)

diff = result.stdout
lines = diff.split('\\n')
additions = len([l for l in lines if l.startswith('+') and not l.startswith('+++')])
deletions = len([l for l in lines if l.startswith('-') and not l.startswith('---')])

print(json.dumps({
    "ok": True,
    "diff": diff[:10000],
    "stats": {
        "additions": additions,
        "deletions": deletions,
        "totalChanges": additions + deletions
    }
}))
`;
        return parseResult(await execPython(code));
      }

      case "report": {
        const report = {
          id: `REPORT-${Date.now()}`,
          timestamp: new Date().toISOString(),
          specId,
          summary: {},
          details: {}
        };
        
        const verificationPath = path.join(verifyDir, "compliance-latest.json");
        if (existsSync(verificationPath)) {
          report.details.compliance = JSON.parse(readFileSync(verificationPath, "utf8"));
        }
        
        const driftPath = path.join(verifyDir, "drift-latest.json");
        if (existsSync(driftPath)) {
          report.details.drift = JSON.parse(readFileSync(driftPath, "utf8"));
        }
        
        report.summary = {
          complianceScore: report.details.compliance?.overallScore || 0,
          hasDrift: report.details.drift?.hasDrift || false,
          overallStatus: "unknown"
        };
        
        if (report.summary.complianceScore >= 80 && !report.summary.hasDrift) {
          report.summary.overallStatus = "passing";
        } else if (report.summary.complianceScore >= 60) {
          report.summary.overallStatus = "warning";
        } else {
          report.summary.overallStatus = "failing";
        }
        
        const outputPath = output || path.join(verifyDir, `report-${Date.now()}.json`);
        await writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");
        
        const mdReport = `# Verification Report

**Generated:** ${report.timestamp}
**Specification:** ${specId || "N/A"}
**Status:** ${report.summary.overallStatus.toUpperCase()}

## Summary

| Metric | Value |
|--------|-------|
| Compliance Score | ${report.summary.complianceScore}% |
| Drift Detected | ${report.summary.hasDrift ? "Yes" : "No"} |
| Overall Status | ${report.summary.overallStatus} |

## Recommendations

${report.summary.hasDrift ? "- **Critical:** Review and address detected drift\n" : ""}
${report.summary.complianceScore < 80 ? "- Improve compliance score by implementing missing requirements\n" : ""}
- Run full test suite before deployment
- Review and update documentation

---
*Report generated by OpenClaw Plus Verifier*
`;
        
        const mdPath = outputPath.replace(".json", ".md");
        await writeFile(mdPath, mdReport, "utf8");
        
        return { ok: report.summary.overallStatus !== "failing", ...report, path: outputPath, mdPath };
      }

      case "audit": {
        const audit = {
          id: `AUDIT-${Date.now()}`,
          timestamp: new Date().toISOString(),
          auditor: "system",
          findings: [],
          severity: { critical: 0, high: 0, medium: 0, low: 0 }
        };
        
        const code = `
import os
import json
import re

root = "${workspaceRoot.replace(/\\/g, "/")}"

findings = []

for root_dir, dirs, files in os.walk(root):
    dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ['node_modules', '__pycache__', 'dist', 'build', '.git']]
    
    for filename in files:
        ext = os.path.splitext(filename)[1].lower()
        if ext not in ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.py']:
            continue
        
        filepath = os.path.join(root_dir, filename)
        rel_path = os.path.relpath(filepath, root)
        
        try:
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
                lines = content.split('\\n')
                
                # Check for hardcoded secrets
                if re.search(r'(password|secret|api_key|token)\\s*=\\s*["\'][^"\']{10,}["\']', content, re.I):
                    findings.append({
                        "file": rel_path,
                        "severity": "critical",
                        "type": "security",
                        "message": "Potential hardcoded secret/credential"
                    })
                
                # Check for console.log in production code
                if ext in ['.js', '.ts'] and 'console.log' in content:
                    if not ('test' in rel_path or 'spec' in rel_path):
                        findings.append({
                            "file": rel_path,
                            "severity": "low",
                            "type": "code_quality",
                            "message": "console.log statement found"
                        })
                
                # Check for TODO/FIXME
                todos = len(re.findall(r'\\bTODO\\b', content, re.I))
                fixmes = len(re.findall(r'\\bFIXME\\b', content, re.I))
                if todos > 0 or fixmes > 0:
                    findings.append({
                        "file": rel_path,
                        "severity": "low",
                        "type": "maintainability",
                        "message": f"{todos} TODOs, {fixmes} FIXMEs"
                    })
                
                # Check file length
                if len(lines) > 500:
                    findings.append({
                        "file": rel_path,
                        "severity": "medium",
                        "type": "maintainability",
                        "message": f"File has {len(lines)} lines (threshold: 500)"
                    })
                
                # Check for debugger statements
                if 'debugger' in content:
                    findings.append({
                        "file": rel_path,
                        "severity": "medium",
                        "type": "code_quality",
                        "message": "debugger statement found"
                    })
                
        except:
            pass

severity_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
for f in findings:
    sev = f.get("severity", "low")
    severity_counts[sev] = severity_counts.get(sev, 0) + 1

print(json.dumps({
    "ok": severity_counts["critical"] == 0,
    "findings": findings[:100],
    "severity": severity_counts,
    "totalFindings": len(findings)
}))
`;
        const result = parseResult(await execPython(code));
        
        if (result.ok) {
          audit.findings = result.findings;
          audit.severity = result.severity;
          audit.totalFindings = result.totalFindings;
        }
        
        const outputPath = output || path.join(verifyDir, `audit-${Date.now()}.json`);
        await writeFile(outputPath, JSON.stringify(audit, null, 2), "utf8");
        
        return { 
          ok: audit.severity.critical === 0, 
          ...audit, 
          path: outputPath,
          message: audit.severity.critical > 0 
            ? `Critical issues found: ${audit.severity.critical}` 
            : `Audit complete: ${audit.totalFindings} findings`
        };
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }
};
