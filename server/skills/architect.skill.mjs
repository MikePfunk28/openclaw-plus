import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";

export const skill = {
  id: "architect",
  name: "Architect",
  description: "Design software architecture - system design, component diagrams, flow diagrams, sequence diagrams, architecture decisions (ADRs).",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["design", "component_diagram", "sequence_diagram", "flow_diagram", "adr", "tech_stack", "architecture_review", "microservices", "monolith", "layered", "event_driven", "c4", "export"],
        description: "Architecture action"
      },
      name: { type: "string", description: "Architecture/design name" },
      description: { type: "string", description: "Description" },
      specId: { type: "string", description: "Link to specification" },
      components: { type: "array", description: "List of components" },
      connections: { type: "array", description: "Component connections" },
      flows: { type: "array", description: "Sequence/flow steps" },
      format: { type: "string", enum: ["mermaid", "plantuml", "json", "svg"], description: "Output format" },
      output: { type: "string", description: "Output file path" },
      options: { type: "object", additionalProperties: true }
    },
    required: ["action"],
    additionalProperties: false
  },
  async run({ input, workspaceRoot }) {
    const action = input?.action;
    const name = input?.name || "Architecture";
    const description = input?.description || "";
    const specId = input?.specId;
    const components = input?.components || [];
    const connections = input?.connections || [];
    const flows = input?.flows || [];
    const format = input?.format || "mermaid";
    const output = input?.output;
    const options = input?.options || {};

    const archDir = path.join(workspaceRoot, ".knowledge", "architecture");
    await mkdir(archDir, { recursive: true });

    const execPython = (code, timeoutMs = 60000) => {
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

    switch (action) {
      case "design": {
        const architecture = {
          id: `ARCH-${Date.now()}`,
          name,
          description,
          version: "1.0.0",
          created: new Date().toISOString(),
          style: options.style || "layered",
          components: components.length > 0 ? components : [
            { id: "api", name: "API Layer", type: "service", description: "REST/GraphQL API" },
            { id: "business", name: "Business Logic", type: "service", description: "Core business rules" },
            { id: "data", name: "Data Layer", type: "storage", description: "Database and caching" },
            { id: "auth", name: "Authentication", type: "service", description: "Auth and authorization" }
          ],
          connections: connections.length > 0 ? connections : [
            { from: "api", to: "business", type: "sync" },
            { from: "business", to: "data", type: "sync" },
            { from: "api", to: "auth", type: "sync" }
          ],
          patterns: options.patterns || ["MVC", "Repository", "Dependency Injection"],
          principles: options.principles || ["SOLID", "DRY", "KISS"],
          qualityAttributes: {
            scalability: options.scalability || "horizontal",
            availability: options.availability || "99.9%",
            security: options.security || "OAuth2 + RBAC",
            performance: options.performance || "< 200ms p95"
          },
          decisions: [],
          risks: []
        };
        
        const outputPath = output || path.join(archDir, `${name.toLowerCase().replace(/\s+/g, "-")}-architecture.json`);
        await writeFile(outputPath, JSON.stringify(architecture, null, 2), "utf8");
        
        return { ok: true, architecture, path: outputPath };
      }

      case "component_diagram": {
        const comps = components.length > 0 ? components : [
          { id: "client", name: "Client App", type: "frontend" },
          { id: "api", name: "API Gateway", type: "service" },
          { id: "svc1", name: "User Service", type: "microservice" },
          { id: "svc2", name: "Order Service", type: "microservice" },
          { id: "db", name: "Database", type: "database" }
        ];
        
        const conns = connections.length > 0 ? connections : [
          { from: "client", to: "api" },
          { from: "api", to: "svc1" },
          { from: "api", to: "svc2" },
          { from: "svc1", to: "db" },
          { from: "svc2", to: "db" }
        ];
        
        let diagram = "";
        if (format === "mermaid") {
          diagram = `graph TB
${comps.map(c => {
  const shape = c.type === "database" ? `[(${c.name})]` : 
                c.type === "frontend" ? `[${c.name}]` : 
                `[${c.name}]`;
  return `    ${c.id}${shape}`;
}).join("\n")}
${conns.map(c => `    ${c.from} -->${c.label ? `|${c.label}|` : ""} ${c.to}`).join("\n")}

classDef frontend fill:#e1f5fe
classDef service fill:#fff3e0
classDef database fill:#e8f5e9
classDef queue fill:#fce4ec

${comps.filter(c => c.type === "frontend").map(c => `class ${c.id} frontend`).join("\n")}
${comps.filter(c => c.type === "service" || c.type === "microservice").map(c => `class ${c.id} service`).join("\n")}
${comps.filter(c => c.type === "database").map(c => `class ${c.id} database`).join("\n")}
`;
        } else if (format === "plantuml") {
          diagram = `@startuml
!define COMPONENT(e) rectangle e
!define DATABASE(d) database d

${comps.map(c => {
  if (c.type === "database") return `DATABASE(${c.id}, "${c.name}")`;
              return `COMPONENT(${c.id}, "${c.name}")`;
            }).join("\n")}

${conns.map(c => `${c.from} --> ${c.to}${c.label ? ` : ${c.label}` : ""}`).join("\n")}
@enduml`;
        }
        
        const outputPath = output || path.join(archDir, `component-diagram.${format === "mermaid" ? "md" : "puml"}`);
        const content = format === "mermaid" ? `\`\`\`mermaid\n${diagram}\n\`\`\`` : diagram;
        await writeFile(outputPath, content, "utf8");
        
        return { ok: true, diagram, format, path: outputPath };
      }

      case "sequence_diagram": {
        const participants = options.participants || ["Client", "API", "Service", "Database"];
        const steps = flows.length > 0 ? flows : [
          { from: "Client", to: "API", message: "HTTP Request" },
          { from: "API", to: "Service", message: "Process Request" },
          { from: "Service", to: "Database", message: "Query Data" },
          { from: "Database", to: "Service", message: "Return Results" },
          { from: "Service", to: "API", message: "Response" },
          { from: "API", to: "Client", message: "HTTP Response" }
        ];
        
        let diagram = "";
        if (format === "mermaid") {
          diagram = `sequenceDiagram
${participants.map(p => `    participant ${p}`).join("\n")}
${steps.map(s => {
  const arrow = s.type === "async" ? "-)" : "->>";
  return `    ${s.from}${arrow}${s.to}: ${s.message}`;
}).join("\n")}
`;
        } else if (format === "plantuml") {
          diagram = `@startuml
${participants.map(p => `participant ${p}`).join("\n")}
${steps.map(s => `${s.from} -> ${s.to}: ${s.message}`).join("\n")}
@enduml`;
        }
        
        const outputPath = output || path.join(archDir, `sequence-diagram.${format === "mermaid" ? "md" : "puml"}`);
        const content = format === "mermaid" ? `\`\`\`mermaid\n${diagram}\n\`\`\`` : diagram;
        await writeFile(outputPath, content, "utf8");
        
        return { ok: true, diagram, format, path: outputPath };
      }

      case "flow_diagram": {
        const steps = flows.length > 0 ? flows : [
          { id: "start", type: "start", label: "Start" },
          { id: "input", type: "input", label: "Receive Input" },
          { id: "validate", type: "process", label: "Validate Data" },
          { id: "decision", type: "decision", label: "Valid?" },
          { id: "process", type: "process", label: "Process Request" },
          { id: "success", type: "end", label: "Success" },
          { id: "error", type: "end", label: "Error" }
        ];
        
        let diagram = "";
        if (format === "mermaid") {
          diagram = `flowchart TD
${steps.map(s => {
  if (s.type === "start") return `    ${s.id}([${s.label}])`;
  if (s.type === "end") return `    ${s.id}([${s.label}])`;
  if (s.type === "decision") return `    ${s.id}{${s.label}}`;
  if (s.type === "input" || s.type === "output") return `    ${s.id}[/${s.label}/]`;
  return `    ${s.id}[${s.label}]`;
}).join("\n")}
${(connections.length > 0 ? connections : [
  { from: "start", to: "input" },
  { from: "input", to: "validate" },
  { from: "validate", to: "decision" },
  { from: "decision", to: "process", label: "Yes" },
  { from: "decision", to: "error", label: "No" },
  { from: "process", to: "success" }
]).map(c => `    ${c.from} -->${c.label ? `|${c.label}|` : ""} ${c.to}`).join("\n")}
`;
        }
        
        const outputPath = output || path.join(archDir, `flow-diagram.md`);
        await writeFile(outputPath, `\`\`\`mermaid\n${diagram}\n\`\`\``, "utf8");
        
        return { ok: true, diagram, format: "mermaid", path: outputPath };
      }

      case "adr": {
        const adrNumber = options.number || String(Date.now()).slice(-4);
        const adr = {
          number: adrNumber,
          title: name,
          status: options.status || "proposed",
          date: new Date().toISOString().split("T")[0],
          deciders: options.deciders || [],
          context: options.context || description,
          decision: options.decision || "",
          consequences: {
            positive: options.positiveConsequences || [],
            negative: options.negativeConsequences || [],
            neutral: options.neutralConsequences || []
          },
          alternatives: options.alternatives || [],
          decisionMakers: options.decisionMakers || []
        };
        
        const md = `# ADR-${adrNumber}: ${name}

## Status
${adr.status}

## Context
${adr.context}

## Decision
${adr.decision}

## Consequences

### Positive
${adr.consequences.positive.map(c => `- ${c}`).join("\n") || "- None documented"}

### Negative
${adr.consequences.negative.map(c => `- ${c}`).join("\n") || "- None documented"}

### Neutral
${adr.consequences.neutral.map(c => `- ${c}`).join("\n") || "- None documented"}

## Alternatives Considered
${adr.alternatives.map(a => `- **${a.name}**: ${a.reason}`).join("\n") || "- None documented"}

---
Date: ${adr.date}
`;
        
        const outputPath = output || path.join(archDir, `adr-${adrNumber}-${name.toLowerCase().replace(/\s+/g, "-")}.md`);
        await writeFile(outputPath, md, "utf8");
        
        return { ok: true, adr, path: outputPath };
      }

      case "tech_stack": {
        const stack = {
          frontend: options.frontend || {
            framework: "React",
            language: "TypeScript",
            styling: "Tailwind CSS",
            stateManagement: "React Query + Zustand",
            buildTool: "Vite"
          },
          backend: options.backend || {
            runtime: "Node.js",
            framework: "Express / Fastify",
            language: "TypeScript",
            orm: "Prisma",
            authentication: "JWT + OAuth2"
          },
          database: options.database || {
            primary: "PostgreSQL",
            cache: "Redis",
            search: "Elasticsearch",
            objectStorage: "S3"
          },
          infrastructure: options.infrastructure || {
            hosting: "AWS / GCP / Azure",
            containerization: "Docker",
            orchestration: "Kubernetes",
            ci_cd: "GitHub Actions"
          },
          monitoring: options.monitoring || {
            logging: "ELK Stack / Datadog",
            metrics: "Prometheus + Grafana",
            tracing: "OpenTelemetry",
            errors: "Sentry"
          },
          tools: options.tools || {
            versionControl: "Git + GitHub",
            projectManagement: "Linear / Jira",
            documentation: "Notion / Confluence",
            design: "Figma"
          }
        };
        
        const outputPath = output || path.join(archDir, "tech-stack.json");
        await writeFile(outputPath, JSON.stringify(stack, null, 2), "utf8");
        
        return { ok: true, stack, path: outputPath };
      }

      case "architecture_review": {
        const review = {
          id: `REVIEW-${Date.now()}`,
          date: new Date().toISOString(),
          reviewer: options.reviewer || "System",
          findings: []
        };
        
        const code = `
import os
import json

root = "${workspaceRoot.replace(/\\/g, "/")}"
findings = []

# Check for common files
checks = [
    ("package.json", "Node.js project detected"),
    ("requirements.txt", "Python project detected"),
    ("go.mod", "Go project detected"),
    ("Cargo.toml", "Rust project detected"),
    ("docker-compose.yml", "Docker Compose configuration found"),
    ("Dockerfile", "Docker configuration found"),
    (".github/workflows", "GitHub Actions CI/CD found"),
    ("terraform", "Terraform infrastructure found"),
    ("kubernetes", "Kubernetes configuration found"),
    ("README.md", "Documentation found"),
    ("tests", "Test directory found"),
]

for check_path, message in checks:
    full_path = os.path.join(root, check_path)
    if os.path.exists(full_path):
        findings.append({"type": "info", "category": "structure", "message": message})

# Check for patterns
src_exists = os.path.exists(os.path.join(root, "src"))
lib_exists = os.path.exists(os.path.join(root, "lib"))
app_exists = os.path.exists(os.path.join(root, "app"))

if src_exists:
    findings.append({"type": "info", "category": "structure", "message": "Source code in src/ directory"})
if lib_exists:
    findings.append({"type": "info", "category": "structure", "message": "Library code in lib/ directory"})

# Recommendations
recommendations = [
    "Ensure all services have health check endpoints",
    "Implement circuit breakers for external dependencies",
    "Add rate limiting to all public APIs",
    "Use environment variables for configuration",
    "Implement structured logging",
    "Add API versioning",
    "Implement graceful shutdown handlers"
]

print(json.dumps({
    "ok": True,
    "findings": findings,
    "recommendations": recommendations,
    "score": max(0, 100 - len([f for f in findings if f["type"] == "warning"]) * 10)
}))
`;
        return parseResult(await execPython(code));
      }

      case "microservices": {
        const services = components.length > 0 ? components : [
          { name: "API Gateway", port: 8080, description: "Entry point for all requests" },
          { name: "Auth Service", port: 8081, description: "Authentication and authorization" },
          { name: "User Service", port: 8082, description: "User management" },
          { name: "Order Service", port: 8083, description: "Order processing" },
          { name: "Notification Service", port: 8084, description: "Email/SMS/Push notifications" },
          { name: "Event Bus", port: 9092, description: "Kafka/Event streaming" }
        ];
        
        const arch = {
          style: "microservices",
          services: services.map(s => ({
            ...s,
            healthCheck: `/health`,
            metrics: `/metrics`,
            replicas: options.production ? 3 : 1
          })),
          communication: {
            sync: "REST/gRPC",
            async: "Kafka/RabbitMQ"
          },
          serviceDiscovery: "Kubernetes DNS / Consul",
          loadBalancing: "Kubernetes Ingress / Nginx",
          observability: {
            tracing: "Jaeger",
            metrics: "Prometheus",
            logging: "ELK Stack"
          }
        };
        
        const outputPath = output || path.join(archDir, "microservices-architecture.json");
        await writeFile(outputPath, JSON.stringify(arch, null, 2), "utf8");
        
        return { ok: true, architecture: arch, path: outputPath };
      }

      case "c4": {
        const levels = {
          context: {
            name: "System Context",
            elements: [
              { type: "system", name: name, description: description || "The system" },
              { type: "person", name: "User", description: "End user of the system" },
              { type: "system", name: "External API", description: "Third-party integrations" }
            ]
          },
          containers: {
            name: "Containers",
            elements: [
              { type: "container", name: "Web App", technology: "React", description: "Frontend application" },
              { type: "container", name: "API Server", technology: "Node.js", description: "Backend API" },
              { type: "container", name: "Database", technology: "PostgreSQL", description: "Primary data store" },
              { type: "container", name: "Cache", technology: "Redis", description: "Session and data cache" }
            ]
          },
          components: {
            name: "Components",
            elements: components.length > 0 ? components : [
              { type: "component", name: "Auth Controller", description: "Handles authentication" },
              { type: "component", name: "User Service", description: "User management" },
              { type: "component", name: "Order Service", description: "Order processing" }
            ]
          }
        };
        
        const outputPath = output || path.join(archDir, "c4-model.json");
        await writeFile(outputPath, JSON.stringify(levels, null, 2), "utf8");
        
        return { ok: true, c4: levels, path: outputPath };
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }
};
