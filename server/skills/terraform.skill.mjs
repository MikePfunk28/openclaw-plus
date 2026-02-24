import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";

export const skill = {
  id: "terraform",
  name: "Terraform",
  description: "Terraform infrastructure as code operations - init, plan, apply, destroy, and more. Supports AWS, GCP, Azure, and Alibaba Cloud.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["init", "plan", "apply", "destroy", "validate", "fmt", "show", "output", "workspace", "state", "providers", "version", "templates"],
        description: "Terraform action to perform"
      },
      provider: {
        type: "string",
        enum: ["aws", "gcp", "azure", "alibaba", "custom"],
        description: "Cloud provider (for template selection)"
      },
      workingDir: {
        type: "string",
        description: "Working directory for Terraform files (relative to infra/)"
      },
      vars: {
        type: "object",
        description: "Terraform variables",
        additionalProperties: true
      },
      varFile: {
        type: "string",
        description: "Path to .tfvars file"
      },
      autoApprove: {
        type: "boolean",
        description: "Auto-approve changes",
        default: false
      },
      backendConfig: {
        type: "object",
        description: "Backend configuration",
        additionalProperties: true
      },
      workspace: {
        type: "string",
        description: "Terraform workspace name"
      }
    },
    required: ["action"],
    additionalProperties: false
  },
  async run({ input, workspaceRoot }) {
    const action = input?.action;
    const provider = input?.provider || "aws";
    const workingDir = input?.workingDir || provider;
    const vars = input?.vars || {};
    const varFile = input?.varFile;
    const autoApprove = input?.autoApprove || false;
    const backendConfig = input?.backendConfig || {};
    const workspace = input?.workspace;

    const infraDir = path.join(workspaceRoot, "infra");
    const tfDir = path.join(infraDir, workingDir);
    
    await mkdir(tfDir, { recursive: true });

    const execTerraform = (args, timeoutMs = 300000) => {
      return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        
        const env = { ...process.env };
        
        env.TF_IN_AUTOMATION = "true";
        env.TF_INPUT = "false";

        const child = spawn("terraform", args, {
          env,
          cwd: tfDir,
          windowsHide: true
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

    const buildVarArgs = () => {
      const args = [];
      
      for (const [key, value] of Object.entries(vars)) {
        if (value === undefined || value === null) continue;
        args.push("-var", `${key}=${typeof value === "object" ? JSON.stringify(value) : value}`);
      }
      
      if (varFile) {
        args.push("-var-file", varFile);
      }
      
      return args;
    };

    switch (action) {
      case "version": {
        const result = await execTerraform(["version"], 30000);
        return {
          ok: result.exitCode === 0,
          action,
          output: result.stdout || result.stderr
        };
      }

      case "templates": {
        const templates = {
          aws: {
            description: "AWS infrastructure for AI applications",
            path: "infra/aws/main.tf",
            features: ["Bedrock", "SageMaker", "Lambda", "S3", "DynamoDB", "ECS", "API Gateway"]
          },
          gcp: {
            description: "GCP infrastructure for AI applications",
            path: "infra/gcp/main.tf",
            features: ["Vertex AI", "Cloud Functions", "Cloud Run", "GKE", "Cloud Storage", "BigQuery"]
          },
          azure: {
            description: "Azure infrastructure for AI applications",
            path: "infra/azure/main.tf",
            features: ["Azure AI/OpenAI", "Functions", "Container Apps", "AKS", "Cosmos DB", "SQL Database"]
          }
        };
        
        const availableTemplates = {};
        for (const [name, info] of Object.entries(templates)) {
          const fullPath = path.join(workspaceRoot, info.path);
          availableTemplates[name] = {
            ...info,
            exists: existsSync(fullPath)
          };
        }
        
        return {
          ok: true,
          action,
          templates: availableTemplates
        };
      }

      case "init": {
        const args = ["init"];
        
        for (const [key, value] of Object.entries(backendConfig)) {
          args.push(`-backend-config=${key}=${value}`);
        }
        
        const result = await execTerraform(args, 120000);
        return {
          ok: result.exitCode === 0,
          action,
          workingDir: tfDir,
          output: result.stdout || result.stderr
        };
      }

      case "validate": {
        const result = await execTerraform(["validate"], 60000);
        return {
          ok: result.exitCode === 0,
          action,
          output: result.stdout || result.stderr
        };
      }

      case "fmt": {
        const args = ["fmt", "-recursive", "-diff"];
        const result = await execTerraform(args, 60000);
        return {
          ok: result.exitCode === 0,
          action,
          output: result.stdout || result.stderr
        };
      }

      case "plan": {
        const args = ["plan", ...buildVarArgs()];
        
        if (workspace) {
          args.push(`-out=${workspace}.tfplan`);
        }
        
        const result = await execTerraform(args, 300000);
        return {
          ok: result.exitCode === 0,
          action,
          output: result.stdout || result.stderr
        };
      }

      case "apply": {
        const args = ["apply"];
        
        if (autoApprove) {
          args.push("-auto-approve");
        }
        
        args.push(...buildVarArgs());
        
        const result = await execTerraform(args, 600000);
        return {
          ok: result.exitCode === 0,
          action,
          output: result.stdout || result.stderr
        };
      }

      case "destroy": {
        if (!autoApprove) {
          return {
            ok: false,
            action,
            error: "destroy requires autoApprove=true for safety"
          };
        }
        
        const args = ["destroy", "-auto-approve", ...buildVarArgs()];
        const result = await execTerraform(args, 600000);
        return {
          ok: result.exitCode === 0,
          action,
          output: result.stdout || result.stderr
        };
      }

      case "show": {
        const subAction = vars.file || vars.path || "terraform.tfstate";
        const args = ["show", subAction];
        const result = await execTerraform(args, 60000);
        return {
          ok: result.exitCode === 0,
          action,
          output: result.stdout || result.stderr
        };
      }

      case "output": {
        const args = ["output", "-json"];
        const result = await execTerraform(args, 30000);
        
        if (result.exitCode !== 0) {
          return { ok: false, action, error: result.stderr };
        }
        
        try {
          const outputs = JSON.parse(result.stdout);
          const parsed = {};
          for (const [key, value] of Object.entries(outputs)) {
            parsed[key] = value.value;
          }
          return { ok: true, action, outputs: parsed };
        } catch {
          return { ok: true, action, output: result.stdout };
        }
      }

      case "workspace": {
        const subAction = vars.subAction || "list";
        
        if (subAction === "list") {
          const result = await execTerraform(["workspace", "list"], 30000);
          return {
            ok: result.exitCode === 0,
            action: "workspace-list",
            output: result.stdout || result.stderr
          };
        }
        
        if (subAction === "new" || subAction === "select") {
          const wsName = vars.name || workspace;
          if (!wsName) throw new Error("workspace name is required");
          
          const result = await execTerraform(["workspace", subAction, wsName], 30000);
          return {
            ok: result.exitCode === 0,
            action: `workspace-${subAction}`,
            workspace: wsName,
            output: result.stdout || result.stderr
          };
        }
        
        if (subAction === "delete") {
          const wsName = vars.name || workspace;
          if (!wsName) throw new Error("workspace name is required");
          
          const result = await execTerraform(["workspace", "delete", wsName], 30000);
          return {
            ok: result.exitCode === 0,
            action: "workspace-delete",
            workspace: wsName,
            output: result.stdout || result.stderr
          };
        }
        
        if (subAction === "show") {
          const result = await execTerraform(["workspace", "show"], 30000);
          return {
            ok: result.exitCode === 0,
            action: "workspace-show",
            current: result.stdout.trim()
          };
        }
        
        throw new Error(`Unknown workspace subAction: ${subAction}`);
      }

      case "state": {
        const subAction = vars.subAction || "list";
        
        if (subAction === "list") {
          const result = await execTerraform(["state", "list"], 60000);
          const resources = result.stdout.trim().split("\n").filter(Boolean);
          return {
            ok: result.exitCode === 0,
            action: "state-list",
            count: resources.length,
            resources
          };
        }
        
        if (subAction === "show") {
          const address = vars.address || vars.resource;
          if (!address) throw new Error("resource address is required");
          
          const result = await execTerraform(["state", "show", address], 60000);
          return {
            ok: result.exitCode === 0,
            action: "state-show",
            address,
            output: result.stdout || result.stderr
          };
        }
        
        if (subAction === "rm" || subAction === "remove") {
          const address = vars.address || vars.resource;
          if (!address) throw new Error("resource address is required");
          
          const result = await execTerraform(["state", "rm", address], 60000);
          return {
            ok: result.exitCode === 0,
            action: "state-remove",
            address,
            output: result.stdout || result.stderr
          };
        }
        
        if (subAction === "mv" || subAction === "move") {
          const source = vars.source;
          const destination = vars.destination;
          if (!source || !destination) throw new Error("source and destination are required");
          
          const result = await execTerraform(["state", "mv", source, destination], 60000);
          return {
            ok: result.exitCode === 0,
            action: "state-move",
            source,
            destination,
            output: result.stdout || result.stderr
          };
        }
        
        throw new Error(`Unknown state subAction: ${subAction}`);
      }

      case "providers": {
        const result = await execTerraform(["providers"], 30000);
        return {
          ok: result.exitCode === 0,
          action,
          output: result.stdout || result.stderr
        };
      }

      default:
        throw new Error(`Unknown terraform action: ${action}`);
    }
  }
};
