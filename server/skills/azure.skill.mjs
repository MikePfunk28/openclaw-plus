import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

export const skill = {
  id: "azure",
  name: "Microsoft Azure",
  description: "Azure cloud operations - VMs, Storage, Functions, Container Apps, AKS, Azure AI, SQL Database, and more.",
  inputSchema: {
    type: "object",
    properties: {
      service: {
        type: "string",
        enum: ["vm", "storage", "functionapp", "containerapp", "aks", "sql", "cosmosdb", "ai", "keyvault", "resource-group", "configure", "account"],
        description: "Azure service to interact with"
      },
      action: {
        type: "string",
        description: "Action to perform"
      },
      params: {
        type: "object",
        description: "Parameters for the action",
        additionalProperties: true
      },
      resourceGroup: {
        type: "string",
        description: "Azure resource group"
      },
      location: {
        type: "string",
        description: "Azure location (default: eastus)",
        default: "eastus"
      },
      output: {
        type: "string",
        enum: ["json", "tsv", "table", "yaml"],
        description: "Output format",
        default: "json"
      }
    },
    required: ["service"],
    additionalProperties: false
  },
  async run({ input, workspaceRoot }) {
    const service = input?.service;
    const action = input?.action;
    const params = input?.params || {};
    const resourceGroup = input?.resourceGroup || process.env.AZURE_RESOURCE_GROUP;
    const location = input?.location || process.env.AZURE_LOCATION || "eastus";
    const output = input?.output || "json";

    const azureDir = path.join(workspaceRoot, "infra", "azure");
    await mkdir(azureDir, { recursive: true });

    const execAz = (args, timeoutMs = 60000) => {
      return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        
        const env = { ...process.env };

        const child = spawn("az", args, {
          env,
          cwd: azureDir,
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

    const buildArgs = (baseArgs, extraParams = {}) => {
      const args = [...baseArgs, "--output", output];
      
      for (const [key, value] of Object.entries({ ...params, ...extraParams })) {
        if (value === undefined || value === null) continue;
        
        if (value === "" || value === true) {
          args.push(`--${key}`);
        } else if (Array.isArray(value)) {
          args.push(`--${key}`, value.join(" "));
        } else if (typeof value === "object") {
          args.push(`--${key}`, JSON.stringify(value));
        } else {
          args.push(`--${key}`, String(value));
        }
      }
      
      return args;
    };

    const parseOutput = (result) => {
      if (output !== "json") return result.stdout;
      try {
        return JSON.parse(result.stdout);
      } catch {
        return result.stdout;
      }
    };

    switch (service) {
      case "configure": {
        if (action === "status" || action === "list") {
          const result = await execAz(["account", "show"]);
          return {
            ok: result.exitCode === 0,
            action: "status",
            output: parseOutput(result),
            location
          };
        }
        
        if (action === "setup") {
          const setupGuide = `# Azure CLI Setup

## Install Azure CLI

### Windows
winget install Microsoft.AzureCLI

Or download from: https://aka.ms/installazurecliwindows

### macOS
brew install azure-cli

### Linux
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash

## Login
az login

## Set Default Subscription
az account set --subscription "SUBSCRIPTION_ID"

## Set Default Location
az configure --defaults location=eastus

## Set Default Resource Group
az configure --defaults group=MyResourceGroup

## Environment Variables
# export AZURE_SUBSCRIPTION_ID=your-subscription-id
# export AZURE_RESOURCE_GROUP=your-resource-group
# export AZURE_LOCATION=eastus

## Service Principal (for automation)
az ad sp create-for-rbac --name "my-app" --role contributor --scopes /subscriptions/SUBSCRIPTION_ID
`;
          const setupPath = path.join(azureDir, "setup.md");
          await writeFile(setupPath, setupGuide, "utf8");
          
          return {
            ok: true,
            action: "setup",
            message: "Setup guide created",
            path: setupPath
          };
        }
        
        if (action === "login") {
          const result = await execAz(["login"]);
          return {
            ok: result.exitCode === 0,
            action: "login",
            output: parseOutput(result)
          };
        }
        
        throw new Error(`Unknown configure action: ${action}`);
      }

      case "account": {
        if (action === "list") {
          const result = await execAz(["account", "list"]);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          return { ok: true, service, action, accounts: parseOutput(result) };
        }
        
        if (action === "set") {
          const subscriptionId = params.subscription || params.id;
          if (!subscriptionId) throw new Error("subscription is required");
          
          const result = await execAz(["account", "set", "--subscription", subscriptionId]);
          return {
            ok: result.exitCode === 0,
            action: "set",
            subscription: subscriptionId,
            output: result.stdout || result.stderr
          };
        }
        
        if (action === "show") {
          const result = await execAz(["account", "show"]);
          return { ok: result.exitCode === 0, service, action, account: parseOutput(result) };
        }
        
        throw new Error(`Unknown account action: ${action}`);
      }

      case "resource-group": {
        if (action === "list") {
          const result = await execAz(["group", "list"]);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          const groups = parseOutput(result);
          return { ok: true, service, action, count: Array.isArray(groups) ? groups.length : 0, groups };
        }
        
        if (action === "create") {
          const name = params.name || params.resourceGroup;
          if (!name) throw new Error("name is required");
          
          const args = buildArgs(["group", "create", "--name", name, "--location", location]);
          const result = await execAz(args);
          return { ok: result.exitCode === 0, service, action, name, output: parseOutput(result) };
        }
        
        if (action === "delete") {
          const name = params.name || params.resourceGroup;
          if (!name) throw new Error("name is required");
          
          const args = buildArgs(["group", "delete", "--name", name, "--yes", "--no-wait"]);
          const result = await execAz(args);
          return { ok: result.exitCode === 0, service, action, name, output: result.stdout || result.stderr };
        }
        
        throw new Error(`Unknown resource-group action: ${action}`);
      }

      case "vm": {
        if (action === "list") {
          const args = buildArgs(["vm", "list"]);
          const result = await execAz(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          const vms = parseOutput(result);
          return { ok: true, service, action, count: Array.isArray(vms) ? vms.length : 0, vms };
        }
        
        if (action === "start") {
          const name = params.name || params.vm;
          const rg = params.resourceGroup || resourceGroup;
          if (!name) throw new Error("vm name is required");
          if (!rg) throw new Error("resourceGroup is required");
          
          const args = buildArgs(["vm", "start", "--name", name, "--resource-group", rg]);
          const result = await execAz(args);
          return { ok: result.exitCode === 0, service, action, name, output: result.stdout || result.stderr };
        }
        
        if (action === "stop" || action === "deallocate") {
          const name = params.name || params.vm;
          const rg = params.resourceGroup || resourceGroup;
          if (!name) throw new Error("vm name is required");
          if (!rg) throw new Error("resourceGroup is required");
          
          const args = buildArgs(["vm", "deallocate", "--name", name, "--resource-group", rg]);
          const result = await execAz(args);
          return { ok: result.exitCode === 0, service, action, name, output: result.stdout || result.stderr };
        }
        
        if (action === "restart") {
          const name = params.name || params.vm;
          const rg = params.resourceGroup || resourceGroup;
          if (!name) throw new Error("vm name is required");
          if (!rg) throw new Error("resourceGroup is required");
          
          const args = buildArgs(["vm", "restart", "--name", name, "--resource-group", rg]);
          const result = await execAz(args);
          return { ok: result.exitCode === 0, service, action, name, output: result.stdout || result.stderr };
        }
        
        if (action === "create") {
          const name = params.name || params.vm;
          const rg = params.resourceGroup || resourceGroup;
          if (!name) throw new Error("vm name is required");
          if (!rg) throw new Error("resourceGroup is required");
          
          const args = buildArgs(["vm", "create", "--name", name, "--resource-group", rg, "--location", location], {
            image: params.image || "Ubuntu2204",
            size: params.size || "Standard_B1s",
            "admin-username": params.adminUsername || "azureuser",
            "generate-ssh-keys": params.generateSshKeys ? "" : undefined
          });
          const result = await execAz(args, 300000);
          return { ok: result.exitCode === 0, service, action, name, output: parseOutput(result) };
        }
        
        throw new Error(`Unknown vm action: ${action}`);
      }

      case "storage": {
        if (action === "list-accounts") {
          const args = buildArgs(["storage", "account", "list"]);
          const result = await execAz(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          const accounts = parseOutput(result);
          return { ok: true, service, action, count: Array.isArray(accounts) ? accounts.length : 0, accounts };
        }
        
        if (action === "create-account") {
          const name = params.name || params.account;
          const rg = params.resourceGroup || resourceGroup;
          if (!name) throw new Error("account name is required");
          if (!rg) throw new Error("resourceGroup is required");
          
          const args = buildArgs(["storage", "account", "create", "--name", name, "--resource-group", rg, "--location", location], {
            sku: params.sku || "Standard_LRS",
            kind: params.kind || "StorageV2"
          });
          const result = await execAz(args, 120000);
          return { ok: result.exitCode === 0, service, action, name, output: parseOutput(result) };
        }
        
        if (action === "list-containers") {
          const account = params.account;
          if (!account) throw new Error("account is required");
          
          const args = buildArgs(["storage", "container", "list", "--account-name", account]);
          const result = await execAz(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          const containers = parseOutput(result);
          return { ok: true, service, action, account, count: Array.isArray(containers) ? containers.length : 0, containers };
        }
        
        if (action === "create-container") {
          const containerName = params.container || params.name;
          const account = params.account;
          if (!containerName) throw new Error("container name is required");
          if (!account) throw new Error("account is required");
          
          const args = buildArgs(["storage", "container", "create", "--name", containerName, "--account-name", account]);
          const result = await execAz(args);
          return { ok: result.exitCode === 0, service, action, container: containerName, output: parseOutput(result) };
        }
        
        throw new Error(`Unknown storage action: ${action}`);
      }

      case "functionapp": {
        if (action === "list") {
          const args = buildArgs(["functionapp", "list"]);
          const result = await execAz(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          const apps = parseOutput(result);
          return { ok: true, service, action, count: Array.isArray(apps) ? apps.length : 0, apps };
        }
        
        if (action === "create") {
          const name = params.name || params.app;
          const rg = params.resourceGroup || resourceGroup;
          const storage = params.storage || params.storageAccount;
          
          if (!name) throw new Error("app name is required");
          if (!rg) throw new Error("resourceGroup is required");
          if (!storage) throw new Error("storage account is required");
          
          const args = buildArgs(["functionapp", "create", "--name", name, "--resource-group", rg, "--location", location, "--storage-account", storage], {
            runtime: params.runtime || "node",
            "functions-version": params.functionsVersion || "4",
            "os-type": params.os || "Linux"
          });
          const result = await execAz(args, 180000);
          return { ok: result.exitCode === 0, service, action, name, output: parseOutput(result) };
        }
        
        if (action === "deploy") {
          const name = params.name || params.app;
          const rg = params.resourceGroup || resourceGroup;
          const srcPath = params.src || params.path;
          
          if (!name) throw new Error("app name is required");
          if (!rg) throw new Error("resourceGroup is required");
          if (!srcPath) throw new Error("src path is required");
          
          const args = buildArgs(["functionapp", "deployment", "source", "config-zip", "--name", name, "--resource-group", rg, "--src", srcPath]);
          const result = await execAz(args, 180000);
          return { ok: result.exitCode === 0, service, action, name, output: result.stdout || result.stderr };
        }
        
        throw new Error(`Unknown functionapp action: ${action}`);
      }

      case "containerapp": {
        if (action === "list") {
          const args = buildArgs(["containerapp", "list"]);
          const result = await execAz(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          const apps = parseOutput(result);
          return { ok: true, service, action, count: Array.isArray(apps) ? apps.length : 0, apps };
        }
        
        if (action === "create") {
          const name = params.name || params.app;
          const rg = params.resourceGroup || resourceGroup;
          const image = params.image;
          const env = params.environment || params.env;
          
          if (!name) throw new Error("app name is required");
          if (!rg) throw new Error("resourceGroup is required");
          if (!image) throw new Error("image is required");
          if (!env) throw new Error("environment is required (create with containerapp env create)");
          
          const args = buildArgs(["containerapp", "create", "--name", name, "--resource-group", rg, "--environment", env, "--image", image], {
            ingress: params.ingress || "external",
            "target-port": params.targetPort || "80"
          });
          const result = await execAz(args, 180000);
          return { ok: result.exitCode === 0, service, action, name, output: parseOutput(result) };
        }
        
        if (action === "up") {
          const name = params.name || params.app;
          const rg = params.resourceGroup || resourceGroup;
          const image = params.image;
          
          if (!name) throw new Error("app name is required");
          if (!rg) throw new Error("resourceGroup is required");
          if (!image) throw new Error("image is required");
          
          const args = buildArgs(["containerapp", "up", "--name", name, "--resource-group", rg, "--image", image, "--location", location]);
          const result = await execAz(args, 300000);
          return { ok: result.exitCode === 0, service, action, name, output: parseOutput(result) };
        }
        
        throw new Error(`Unknown containerapp action: ${action}`);
      }

      case "aks": {
        if (action === "list") {
          const args = buildArgs(["aks", "list"]);
          const result = await execAz(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          const clusters = parseOutput(result);
          return { ok: true, service, action, count: Array.isArray(clusters) ? clusters.length : 0, clusters };
        }
        
        if (action === "create") {
          const name = params.name || params.cluster;
          const rg = params.resourceGroup || resourceGroup;
          
          if (!name) throw new Error("cluster name is required");
          if (!rg) throw new Error("resourceGroup is required");
          
          const args = buildArgs(["aks", "create", "--name", name, "--resource-group", rg, "--location", location], {
            "node-count": params.nodeCount || 1,
            "enable-managed-identity": "",
            "generate-ssh-keys": ""
          });
          const result = await execAz(args, 600000);
          return { ok: result.exitCode === 0, service, action, name, output: parseOutput(result) };
        }
        
        if (action === "get-credentials") {
          const name = params.name || params.cluster;
          const rg = params.resourceGroup || resourceGroup;
          
          if (!name) throw new Error("cluster name is required");
          if (!rg) throw new Error("resourceGroup is required");
          
          const args = buildArgs(["aks", "get-credentials", "--name", name, "--resource-group", rg], {
            file: params.file
          });
          const result = await execAz(args);
          return { ok: result.exitCode === 0, service, action, name, output: result.stdout || result.stderr };
        }
        
        throw new Error(`Unknown aks action: ${action}`);
      }

      case "sql": {
        if (action === "list-servers") {
          const args = buildArgs(["sql", "server", "list"]);
          const result = await execAz(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          const servers = parseOutput(result);
          return { ok: true, service, action, count: Array.isArray(servers) ? servers.length : 0, servers };
        }
        
        if (action === "create-server") {
          const name = params.name || params.server;
          const rg = params.resourceGroup || resourceGroup;
          
          if (!name) throw new Error("server name is required");
          if (!rg) throw new Error("resourceGroup is required");
          
          const args = buildArgs(["sql", "server", "create", "--name", name, "--resource-group", rg, "--location", location], {
            "admin-user": params.adminUser || "sqladmin",
            "admin-password": params.adminPassword
          });
          const result = await execAz(args, 180000);
          return { ok: result.exitCode === 0, service, action, name, output: parseOutput(result) };
        }
        
        throw new Error(`Unknown sql action: ${action}`);
      }

      case "cosmosdb": {
        if (action === "list-accounts") {
          const args = buildArgs(["cosmosdb", "list"]);
          const result = await execAz(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          const accounts = parseOutput(result);
          return { ok: true, service, action, count: Array.isArray(accounts) ? accounts.length : 0, accounts };
        }
        
        if (action === "create-account") {
          const name = params.name || params.account;
          const rg = params.resourceGroup || resourceGroup;
          
          if (!name) throw new Error("account name is required");
          if (!rg) throw new Error("resourceGroup is required");
          
          const args = buildArgs(["cosmosdb", "create", "--name", name, "--resource-group", rg, "--locations", `region=${location}`], {
            kind: params.kind || "GlobalDocumentDB"
          });
          const result = await execAz(args, 300000);
          return { ok: result.exitCode === 0, service, action, name, output: parseOutput(result) };
        }
        
        throw new Error(`Unknown cosmosdb action: ${action}`);
      }

      case "ai": {
        if (action === "list-workspaces") {
          const args = buildArgs(["ml", "workspace", "list"]);
          const result = await execAz(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          const workspaces = parseOutput(result);
          return { ok: true, service, action, count: Array.isArray(workspaces) ? workspaces.length : 0, workspaces };
        }
        
        if (action === "list-openai") {
          const args = buildArgs(["cognitiveservices", "account", "list"], {
            kind: "OpenAI"
          });
          const result = await execAz(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          const accounts = parseOutput(result);
          return { ok: true, service, action, count: Array.isArray(accounts) ? accounts.length : 0, accounts };
        }
        
        if (action === "create-openai") {
          const name = params.name || params.account;
          const rg = params.resourceGroup || resourceGroup;
          
          if (!name) throw new Error("account name is required");
          if (!rg) throw new Error("resourceGroup is required");
          
          const args = buildArgs(["cognitiveservices", "account", "create", "--name", name, "--resource-group", rg, "--location", location, "--kind", "OpenAI", "--sku", params.sku || "S0"]);
          const result = await execAz(args, 180000);
          return { ok: result.exitCode === 0, service, action, name, output: parseOutput(result) };
        }
        
        throw new Error(`Unknown ai action: ${action}`);
      }

      case "keyvault": {
        if (action === "list") {
          const args = buildArgs(["keyvault", "list"]);
          const result = await execAz(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          const vaults = parseOutput(result);
          return { ok: true, service, action, count: Array.isArray(vaults) ? vaults.length : 0, vaults };
        }
        
        if (action === "create") {
          const name = params.name || params.vault;
          const rg = params.resourceGroup || resourceGroup;
          
          if (!name) throw new Error("vault name is required");
          if (!rg) throw new Error("resourceGroup is required");
          
          const args = buildArgs(["keyvault", "create", "--name", name, "--resource-group", rg, "--location", location]);
          const result = await execAz(args, 120000);
          return { ok: result.exitCode === 0, service, action, name, output: parseOutput(result) };
        }
        
        if (action === "secret-set") {
          const vault = params.vault || params.name;
          const secretName = params.secretName || params.secret;
          const secretValue = params.value;
          
          if (!vault) throw new Error("vault name is required");
          if (!secretName) throw new Error("secret name is required");
          if (!secretValue) throw new Error("value is required");
          
          const args = buildArgs(["keyvault", "secret", "set", "--vault-name", vault, "--name", secretName, "--value", secretValue]);
          const result = await execAz(args);
          return { ok: result.exitCode === 0, service, action, secret: secretName, output: parseOutput(result) };
        }
        
        if (action === "secret-get") {
          const vault = params.vault || params.name;
          const secretName = params.secretName || params.secret;
          
          if (!vault) throw new Error("vault name is required");
          if (!secretName) throw new Error("secret name is required");
          
          const args = buildArgs(["keyvault", "secret", "show", "--vault-name", vault, "--name", secretName]);
          const result = await execAz(args);
          return { ok: result.exitCode === 0, service, action, secret: secretName, output: parseOutput(result) };
        }
        
        throw new Error(`Unknown keyvault action: ${action}`);
      }

      default:
        if (action) {
          const args = buildArgs([service, action]);
          const result = await execAz(args, 120000);
          
          try {
            const data = JSON.parse(result.stdout);
            return { ok: result.exitCode === 0, service, action, data };
          } catch {
            return { ok: result.exitCode === 0, service, action, output: result.stdout || result.stderr };
          }
        }
        
        throw new Error(`Azure service '${service}' requires an action`);
    }
  }
};
