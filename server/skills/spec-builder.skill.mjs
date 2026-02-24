import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export const skill = {
  id: "spec-builder",
  name: "Specification Builder",
  description: "Build detailed specifications from requirements - user stories, acceptance criteria, API specs, data models, implementation plans.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["create", "from_requirements", "user_stories", "api_spec", "data_model", "implementation_plan", "acceptance_criteria", "validate", "merge", "export"],
        description: "Spec builder action"
      },
      title: { type: "string", description: "Specification title" },
      description: { type: "string", description: "Project/feature description" },
      requirements: { type: "array", items: { type: "string" }, description: "List of requirements" },
      specId: { type: "string", description: "Specification ID to load/modify" },
      format: { type: "string", enum: ["json", "markdown", "yaml"], description: "Output format" },
      output: { type: "string", description: "Output file path" },
      template: { type: "string", description: "Template to use" },
      options: { type: "object", additionalProperties: true }
    },
    required: ["action"],
    additionalProperties: false
  },
  async run({ input, workspaceRoot }) {
    const action = input?.action;
    const title = input?.title || "Untitled Specification";
    const description = input?.description || "";
    const requirements = input?.requirements || [];
    const specId = input?.specId || `spec-${Date.now()}`;
    const format = input?.format || "json";
    const output = input?.output;
    const template = input?.template;
    const options = input?.options || {};

    const specsDir = path.join(workspaceRoot, ".knowledge", "specs");
    await mkdir(specsDir, { recursive: true });

    const generateId = () => `REQ-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    const generateStoryId = () => `US-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    const specTemplate = {
      id: specId,
      version: "1.0.0",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      title,
      description,
      status: "draft",
      requirements: [],
      userStories: [],
      apiSpecs: [],
      dataModels: [],
      acceptanceCriteria: [],
      implementationPlan: null,
      dependencies: [],
      risks: [],
      estimates: null
    };

    const loadSpec = (id) => {
      const specPath = path.join(specsDir, `${id}.json`);
      if (existsSync(specPath)) {
        return JSON.parse(readFileSync(specPath, "utf8"));
      }
      return null;
    };

    const saveSpec = (spec) => {
      spec.updated = new Date().toISOString();
      const specPath = path.join(specsDir, `${spec.id}.json`);
      writeFileSync(specPath, JSON.stringify(spec, null, 2));
      return specPath;
    };

    switch (action) {
      case "create": {
        const spec = { ...specTemplate };
        
        for (const req of requirements) {
          spec.requirements.push({
            id: generateId(),
            text: req,
            priority: "medium",
            status: "pending",
            createdAt: new Date().toISOString()
          });
        }
        
        const specPath = saveSpec(spec);
        return { ok: true, spec, path: specPath };
      }

      case "from_requirements": {
        const spec = { ...specTemplate };
        
        const parsedReqs = requirements.map((req, index) => {
          const parsed = {
            id: `REQ-${String(index + 1).padStart(3, "0")}`,
            text: req,
            type: "functional",
            priority: "medium",
            status: "pending",
            acceptanceCriteria: [],
            dependencies: []
          };
          
          const lower = req.toLowerCase();
          if (lower.includes("must") || lower.includes("shall")) {
            parsed.priority = "high";
          }
          if (lower.includes("should")) {
            parsed.priority = "medium";
          }
          if (lower.includes("could") || lower.includes("may")) {
            parsed.priority = "low";
          }
          if (lower.includes("performance") || lower.includes("fast") || lower.includes("scale")) {
            parsed.type = "non-functional";
          }
          if (lower.includes("security") || lower.includes("auth") || lower.includes("encrypt")) {
            parsed.type = "security";
          }
          
          return parsed;
        });
        
        spec.requirements = parsedReqs;
        
        const userStories = parsedReqs.map(req => ({
          id: generateStoryId(),
          requirementId: req.id,
          asA: "user",
          iWant: req.text.replace(/^(must|shall|should|could|may)\s+/i, ""),
          soThat: "I can achieve my goal",
          acceptanceCriteria: [
            `Given I am a user`,
            `When I ${req.text.toLowerCase()}`,
            `Then the system should respond appropriately`
          ],
          points: req.priority === "high" ? 5 : req.priority === "medium" ? 3 : 1
        }));
        
        spec.userStories = userStories;
        
        const specPath = saveSpec(spec);
        return { ok: true, spec, path: specPath, stats: { requirements: parsedReqs.length, userStories: userStories.length } };
      }

      case "user_stories": {
        const spec = specId ? loadSpec(specId) : { ...specTemplate };
        if (!spec) return { ok: false, error: `Spec not found: ${specId}` };
        
        const stories = requirements.map((req, index) => {
          const parts = req.match(/as\s+(?:a|an)\s+(.+?),?\s*i\s+(?:want|need)\s+(?:to\s+)?(.+?),?\s*so\s+(?:that\s+)?(.+)/i);
          
          if (parts) {
            return {
              id: generateStoryId(),
              asA: parts[1].trim(),
              iWant: parts[2].trim(),
              soThat: parts[3].trim(),
              acceptanceCriteria: [],
              tasks: [],
              points: options.points?.[index] || 3
            };
          }
          
          return {
            id: generateStoryId(),
            asA: "user",
            iWant: req,
            soThat: "I can achieve my goal",
            acceptanceCriteria: [],
            tasks: [],
            points: options.points?.[index] || 3
          };
        });
        
        spec.userStories = [...(spec.userStories || []), ...stories];
        
        const specPath = saveSpec(spec);
        return { ok: true, spec, added: stories.length, path: specPath };
      }

      case "api_spec": {
        const spec = specId ? loadSpec(specId) : { ...specTemplate };
        if (!spec) return { ok: false, error: `Spec not found: ${specId}` };
        
        const apiSpec = {
          id: `API-${Date.now()}`,
          version: "1.0.0",
          basePath: options.basePath || "/api/v1",
          endpoints: options.endpoints || [],
          schemas: options.schemas || {},
          security: options.security || { type: "bearer" },
          producedAt: new Date().toISOString()
        };
        
        if (options.endpoints) {
          for (const ep of options.endpoints) {
            apiSpec.endpoints.push({
              path: ep.path,
              method: ep.method || "GET",
              description: ep.description || "",
              parameters: ep.parameters || [],
              requestBody: ep.requestBody || null,
              responses: ep.responses || { 200: { description: "Success" } },
              authentication: ep.auth !== false
            });
          }
        }
        
        spec.apiSpecs = [...(spec.apiSpecs || []), apiSpec];
        
        const specPath = saveSpec(spec);
        return { ok: true, spec, apiSpec, path: specPath };
      }

      case "data_model": {
        const spec = specId ? loadSpec(specId) : { ...specTemplate };
        if (!spec) return { ok: false, error: `Spec not found: ${specId}` };
        
        const dataModel = {
          id: `DM-${Date.now()}`,
          name: options.name || "DataModel",
          entities: options.entities || [],
          relationships: options.relationships || [],
          indexes: options.indexes || [],
          migrations: []
        };
        
        if (options.entities) {
          for (const entity of options.entities) {
            dataModel.entities.push({
              name: entity.name,
              fields: (entity.fields || []).map(f => ({
                name: f.name,
                type: f.type || "string",
                required: f.required !== false,
                unique: f.unique || false,
                default: f.default,
                validation: f.validation || null
              })),
              timestamps: entity.timestamps !== false
            });
          }
        }
        
        spec.dataModels = [...(spec.dataModels || []), dataModel];
        
        const specPath = saveSpec(spec);
        return { ok: true, spec, dataModel, path: specPath };
      }

      case "implementation_plan": {
        const spec = specId ? loadSpec(specId) : { ...specTemplate };
        if (!spec) return { ok: false, error: `Spec not found: ${specId}` };
        
        const phases = [
          { name: "Setup & Infrastructure", tasks: ["Initialize project", "Configure build tools", "Set up CI/CD"] },
          { name: "Core Implementation", tasks: ["Implement data models", "Create API endpoints", "Add business logic"] },
          { name: "Testing", tasks: ["Unit tests", "Integration tests", "E2E tests"] },
          { name: "Documentation", tasks: ["API docs", "User guide", "Deployment guide"] },
          { name: "Deployment", tasks: ["Staging deploy", "Production deploy", "Monitoring setup"] }
        ];
        
        const implementationPlan = {
          id: `PLAN-${Date.now()}`,
          phases: phases.map((phase, index) => ({
            id: `PHASE-${index + 1}`,
            name: phase.name,
            order: index + 1,
            tasks: phase.tasks.map((task, taskIndex) => ({
              id: `TASK-${index + 1}-${taskIndex + 1}`,
              description: task,
              status: "pending",
              estimatedHours: 4,
              dependencies: taskIndex > 0 ? [`TASK-${index + 1}-${taskIndex}`] : []
            })),
            estimatedDays: phase.tasks.length
          })),
          totalEstimatedDays: phases.reduce((sum, p) => sum + p.tasks.length, 0),
          milestones: [
            { name: "MVP Complete", phase: 2 },
            { name: "Testing Complete", phase: 3 },
            { name: "Production Ready", phase: 5 }
          ],
          risks: [
            { description: "Scope creep", mitigation: "Strict requirement validation" },
            { description: "Technical debt", mitigation: "Regular code reviews" }
          ]
        };
        
        spec.implementationPlan = implementationPlan;
        
        const specPath = saveSpec(spec);
        return { ok: true, spec, implementationPlan, path: specPath };
      }

      case "acceptance_criteria": {
        const spec = specId ? loadSpec(specId) : { ...specTemplate };
        if (!spec) return { ok: false, error: `Spec not found: ${specId}` };
        
        const criteria = (requirements.length > 0 ? requirements : spec.requirements.map(r => r.text)).map((req, index) => ({
          id: `AC-${index + 1}`,
          requirement: req,
          given: `Given the system is ready`,
          when: `When the user performs the action`,
          then: `Then the expected outcome should occur`,
          strict: true,
          testable: true,
          priority: "high"
        }));
        
        spec.acceptanceCriteria = [...(spec.acceptanceCriteria || []), ...criteria];
        
        const specPath = saveSpec(spec);
        return { ok: true, spec, added: criteria.length, path: specPath };
      }

      case "validate": {
        const spec = specId ? loadSpec(specId) : null;
        if (!spec) return { ok: false, error: `Spec not found: ${specId}` };
        
        const issues = [];
        const warnings = [];
        
        if (!spec.title || spec.title.length < 3) {
          issues.push({ type: "error", message: "Title is missing or too short" });
        }
        
        if (spec.requirements.length === 0) {
          warnings.push({ type: "warning", message: "No requirements defined" });
        }
        
        for (const req of spec.requirements) {
          if (!req.text || req.text.length < 10) {
            issues.push({ type: "error", message: `Requirement ${req.id} is too short` });
          }
          if (req.acceptanceCriteria?.length === 0) {
            warnings.push({ type: "warning", message: `Requirement ${req.id} has no acceptance criteria` });
          }
        }
        
        for (const story of spec.userStories || []) {
          if (!story.asA || !story.iWant || !story.soThat) {
            issues.push({ type: "error", message: `User story ${story.id} is incomplete` });
          }
        }
        
        const validated = {
          valid: issues.length === 0,
          issues,
          warnings,
          summary: {
            requirements: spec.requirements.length,
            userStories: spec.userStories?.length || 0,
            apiSpecs: spec.apiSpecs?.length || 0,
            dataModels: spec.dataModels?.length || 0,
            acceptanceCriteria: spec.acceptanceCriteria?.length || 0
          }
        };
        
        spec.validation = validated;
        saveSpec(spec);
        
        return { ok: true, ...validated };
      }

      case "merge": {
        const specIds = options.specIds || [];
        if (specIds.length < 2) {
          return { ok: false, error: "Need at least 2 specIds to merge" };
        }
        
        const specs = specIds.map(id => loadSpec(id)).filter(Boolean);
        if (specs.length !== specIds.length) {
          return { ok: false, error: "Some specs not found" };
        }
        
        const merged = {
          ...specTemplate,
          id: `MERGED-${Date.now()}`,
          title: options.title || `Merged: ${specs.map(s => s.title).join(" + ")}`,
          description: specs.map(s => s.description).filter(Boolean).join("\n\n"),
          requirements: specs.flatMap(s => s.requirements),
          userStories: specs.flatMap(s => s.userStories),
          apiSpecs: specs.flatMap(s => s.apiSpecs),
          dataModels: specs.flatMap(s => s.dataModels),
          acceptanceCriteria: specs.flatMap(s => s.acceptanceCriteria),
          mergedFrom: specIds
        };
        
        const specPath = saveSpec(merged);
        return { ok: true, merged, path: specPath };
      }

      case "export": {
        const spec = specId ? loadSpec(specId) : null;
        if (!spec) return { ok: false, error: `Spec not found: ${specId}` };
        
        const exportPath = output || path.join(specsDir, `${specId}.${format}`);
        
        if (format === "json") {
          await writeFile(exportPath, JSON.stringify(spec, null, 2), "utf8");
        } else if (format === "yaml") {
          const yaml = require("yaml");
          await writeFile(exportPath, yaml.stringify(spec), "utf8");
        } else if (format === "markdown") {
          let md = `# ${spec.title}\n\n`;
          md += `**Version:** ${spec.version}\n`;
          md += `**Status:** ${spec.status}\n`;
          md += `**Created:** ${spec.created}\n\n`;
          md += `## Description\n\n${spec.description}\n\n`;
          
          if (spec.requirements.length > 0) {
            md += `## Requirements\n\n`;
            for (const req of spec.requirements) {
              md += `### ${req.id}\n\n`;
              md += `${req.text}\n\n`;
              md += `- **Priority:** ${req.priority}\n`;
              md += `- **Type:** ${req.type || "functional"}\n`;
              md += `- **Status:** ${req.status}\n\n`;
            }
          }
          
          if (spec.userStories?.length > 0) {
            md += `## User Stories\n\n`;
            for (const story of spec.userStories) {
              md += `### ${story.id}\n\n`;
              md += `**As a** ${story.asA}\n\n`;
              md += `**I want** ${story.iWant}\n\n`;
              md += `**So that** ${story.soThat}\n\n`;
              md += `**Points:** ${story.points}\n\n`;
            }
          }
          
          if (spec.acceptanceCriteria?.length > 0) {
            md += `## Acceptance Criteria\n\n`;
            for (const ac of spec.acceptanceCriteria) {
              md += `- [ ] **${ac.id}:** ${ac.then}\n`;
            }
            md += "\n";
          }
          
          if (spec.implementationPlan) {
            md += `## Implementation Plan\n\n`;
            for (const phase of spec.implementationPlan.phases) {
              md += `### ${phase.name}\n\n`;
              for (const task of phase.tasks) {
                md += `- [ ] ${task.description}\n`;
              }
              md += "\n";
            }
          }
          
          await writeFile(exportPath, md, "utf8");
        }
        
        return { ok: true, exported: true, path: exportPath, format };
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }
};
