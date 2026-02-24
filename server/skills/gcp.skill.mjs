import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

export const skill = {
  id: "gcp",
  name: "Google Cloud Platform",
  description: "GCP cloud operations - Compute Engine, Cloud Storage, Cloud Functions, Cloud Run, BigQuery, Vertex AI, and more.",
  inputSchema: {
    type: "object",
    properties: {
      service: {
        type: "string",
        enum: ["compute", "storage", "functions", "run", "bigquery", "vertex-ai", "cloud-sql", "gke", "pubsub", "iam", "configure", "projects"],
        description: "GCP service to interact with"
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
      project: {
        type: "string",
        description: "GCP project ID"
      },
      region: {
        type: "string",
        description: "GCP region (default: us-central1)",
        default: "us-central1"
      },
      format: {
        type: "string",
        enum: ["json", "text", "yaml", "table"],
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
    const project = input?.project || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT;
    const region = input?.region || process.env.GOOGLE_CLOUD_REGION || "us-central1";
    const format = input?.format || "json";

    const gcpDir = path.join(workspaceRoot, "infra", "gcp");
    await mkdir(gcpDir, { recursive: true });

    const execGcloud = (args, timeoutMs = 60000) => {
      return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        
        const env = { ...process.env };
        
        if (project) {
          env.GOOGLE_CLOUD_PROJECT = project;
          env.CLOUDSDK_CORE_PROJECT = project;
        }
        
        env.CLOUDSDK_COMPUTE_REGION = region;
        env.CLOUDSDK_RUN_REGION = region;
        env.CLOUDSDK_FUNCTIONS_REGION = region;

        const child = spawn("gcloud", args, {
          env,
          cwd: gcpDir,
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
      const args = [...baseArgs, `--format=${format}`];
      
      if (project) {
        args.push("--project", project);
      }
      
      for (const [key, value] of Object.entries({ ...params, ...extraParams })) {
        if (value === undefined || value === null) continue;
        
        if (Array.isArray(value)) {
          args.push(`--${key}`, value.join(","));
        } else if (typeof value === "object") {
          args.push(`--${key}`, JSON.stringify(value));
        } else {
          args.push(`--${key}`, String(value));
        }
      }
      
      return args;
    };

    switch (service) {
      case "configure": {
        if (action === "status" || action === "list") {
          const result = await execGcloud(["config", "list"]);
          return {
            ok: result.exitCode === 0,
            action: "status",
            output: result.stdout || result.stderr,
            project,
            region
          };
        }
        
        if (action === "setup") {
          const setupGuide = `# Google Cloud SDK Setup

## Install Google Cloud SDK

### Windows
1. Download from: https://cloud.google.com/sdk/docs/install
2. Or use: winget install Google.CloudSDK

### macOS
brew install google-cloud-sdk

### Linux
curl https://sdk.cloud.google.com | bash
exec -l $SHELL

## Initialize
gcloud init

## Authentication
gcloud auth login
gcloud auth application-default login

## Set Default Project
gcloud config set project YOUR_PROJECT_ID

## Set Default Region
gcloud config set compute/region us-central1
gcloud config set compute/zone us-central1-a

## Environment Variables (alternative)
# export GOOGLE_CLOUD_PROJECT=your-project-id
# export GOOGLE_CLOUD_REGION=us-central1
# export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
`;
          const setupPath = path.join(gcpDir, "setup.md");
          await writeFile(setupPath, setupGuide, "utf8");
          
          return {
            ok: true,
            action: "setup",
            message: "Setup guide created",
            path: setupPath
          };
        }
        
        if (action === "set-project") {
          const projectId = params.projectId || params.id;
          if (!projectId) throw new Error("projectId is required");
          
          const result = await execGcloud(["config", "set", "project", projectId]);
          return {
            ok: result.exitCode === 0,
            action: "set-project",
            project: projectId,
            output: result.stdout || result.stderr
          };
        }
        
        throw new Error(`Unknown configure action: ${action}`);
      }

      case "projects": {
        if (action === "list") {
          const result = await execGcloud(["projects", "list"]);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          try {
            const projects = JSON.parse(result.stdout);
            return { ok: true, service, action, count: projects.length, projects };
          } catch {
            return { ok: true, service, action, output: result.stdout };
          }
        }
        
        if (action === "describe") {
          const projectId = params.projectId || params.id || project;
          if (!projectId) throw new Error("projectId is required");
          
          const result = await execGcloud(["projects", "describe", projectId]);
          return { ok: result.exitCode === 0, service, action, output: result.stdout || result.stderr };
        }
        
        throw new Error(`Unknown projects action: ${action}`);
      }

      case "compute": {
        if (action === "list-instances" || action === "list") {
          const args = buildArgs(["compute", "instances", "list"]);
          const result = await execGcloud(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          try {
            const instances = JSON.parse(result.stdout);
            return { ok: true, service, action, count: instances.length, instances };
          } catch {
            return { ok: true, service, action, output: result.stdout };
          }
        }
        
        if (action === "start-instance") {
          const instanceName = params.name || params.instance;
          const zone = params.zone || region + "-a";
          if (!instanceName) throw new Error("instance name is required");
          
          const args = buildArgs(["compute", "instances", "start", instanceName, "--zone", zone]);
          const result = await execGcloud(args);
          return { ok: result.exitCode === 0, service, action, output: result.stdout || result.stderr };
        }
        
        if (action === "stop-instance") {
          const instanceName = params.name || params.instance;
          const zone = params.zone || region + "-a";
          if (!instanceName) throw new Error("instance name is required");
          
          const args = buildArgs(["compute", "instances", "stop", instanceName, "--zone", zone]);
          const result = await execGcloud(args);
          return { ok: result.exitCode === 0, service, action, output: result.stdout || result.stderr };
        }
        
        if (action === "ssh") {
          const instanceName = params.name || params.instance;
          const zone = params.zone || region + "-a";
          if (!instanceName) throw new Error("instance name is required");
          
          const args = buildArgs(["compute", "ssh", instanceName, "--zone", zone], {
            command: params.command
          });
          const result = await execGcloud(args, 120000);
          return { ok: result.exitCode === 0, service, action, output: result.stdout || result.stderr };
        }
        
        throw new Error(`Unknown compute action: ${action}`);
      }

      case "storage": {
        if (action === "list-buckets") {
          const args = buildArgs(["storage", "buckets", "list"]);
          const result = await execGcloud(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          try {
            const buckets = JSON.parse(result.stdout);
            return { ok: true, service, action, count: buckets.length, buckets };
          } catch {
            return { ok: true, service, action, output: result.stdout };
          }
        }
        
        if (action === "create-bucket") {
          const bucketName = params.bucket || params.name;
          if (!bucketName) throw new Error("bucket name is required");
          
          const args = buildArgs(["storage", "buckets", "create", `gs://${bucketName}`], {
            location: params.location || region
          });
          const result = await execGcloud(args);
          return { ok: result.exitCode === 0, service, action, bucket: bucketName, output: result.stdout || result.stderr };
        }
        
        if (action === "list-objects" || action === "ls") {
          const bucket = params.bucket;
          if (!bucket) throw new Error("bucket is required");
          
          const args = buildArgs(["storage", "objects", "list", `gs://${bucket}${params.prefix || ""}`]);
          const result = await execGcloud(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          try {
            const objects = JSON.parse(result.stdout);
            return { ok: true, service, action, bucket, count: objects.length, objects };
          } catch {
            return { ok: true, service, action, bucket, output: result.stdout };
          }
        }
        
        if (action === "upload" || action === "cp") {
          const { source, destination } = params;
          if (!source || !destination) throw new Error("source and destination are required");
          
          const args = buildArgs(["storage", "cp", source, destination]);
          const result = await execGcloud(args, 120000);
          return { ok: result.exitCode === 0, service, action, output: result.stdout || result.stderr };
        }
        
        if (action === "download") {
          const { source, destination } = params;
          if (!source || !destination) throw new Error("source and destination are required");
          
          const args = buildArgs(["storage", "cp", source, destination]);
          const result = await execGcloud(args, 120000);
          return { ok: result.exitCode === 0, service, action, output: result.stdout || result.stderr };
        }
        
        throw new Error(`Unknown storage action: ${action}`);
      }

      case "functions": {
        if (action === "list") {
          const args = buildArgs(["functions", "list"]);
          const result = await execGcloud(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          try {
            const functions = JSON.parse(result.stdout);
            return { ok: true, service, action, count: functions.length, functions };
          } catch {
            return { ok: true, service, action, output: result.stdout };
          }
        }
        
        if (action === "deploy") {
          const functionName = params.name || params.function;
          const source = params.source;
          const runtime = params.runtime || "nodejs20";
          const entryPoint = params.entryPoint || params.handler;
          
          if (!functionName) throw new Error("function name is required");
          if (!source) throw new Error("source path is required");
          
          const args = buildArgs(["functions", "deploy", functionName, `--source=${source}`, `--runtime=${runtime}`, `--region=${region}`], {
            "entry-point": entryPoint,
            trigger: params.trigger || "http",
            memory: params.memory,
            timeout: params.timeout
          });
          const result = await execGcloud(args, 300000);
          return { ok: result.exitCode === 0, service, action, function: functionName, output: result.stdout || result.stderr };
        }
        
        if (action === "call" || action === "invoke") {
          const functionName = params.name || params.function;
          if (!functionName) throw new Error("function name is required");
          
          const args = buildArgs(["functions", "call", functionName, `--region=${region}`], {
            data: params.data ? JSON.stringify(params.data) : undefined
          });
          const result = await execGcloud(args, 60000);
          return { ok: result.exitCode === 0, service, action, output: result.stdout || result.stderr };
        }
        
        throw new Error(`Unknown functions action: ${action}`);
      }

      case "run": {
        if (action === "list") {
          const args = buildArgs(["run", "services", "list"]);
          const result = await execGcloud(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          try {
            const services = JSON.parse(result.stdout);
            return { ok: true, service, action, count: services.length, services };
          } catch {
            return { ok: true, service, action, output: result.stdout };
          }
        }
        
        if (action === "deploy") {
          const serviceName = params.name || params.service;
          const image = params.image;
          
          if (!serviceName) throw new Error("service name is required");
          if (!image) throw new Error("image is required");
          
          const args = buildArgs(["run", "deploy", serviceName, `--image=${image}`, `--region=${region}`], {
            platform: "managed",
            "allow-unauthenticated": params.allowUnauthenticated ? "" : undefined,
            memory: params.memory,
            cpu: params.cpu,
            "max-instances": params.maxInstances,
            "set-env-vars": params.envVars ? Object.entries(params.envVars).map(([k, v]) => `${k}=${v}`).join(",") : undefined
          });
          const result = await execGcloud(args, 300000);
          return { ok: result.exitCode === 0, service, action, service: serviceName, output: result.stdout || result.stderr };
        }
        
        throw new Error(`Unknown run action: ${action}`);
      }

      case "bigquery": {
        if (action === "list-datasets") {
          const args = buildArgs(["bigquery", "datasets", "list"]);
          const result = await execGcloud(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          try {
            const datasets = JSON.parse(result.stdout);
            return { ok: true, service, action, count: datasets.length, datasets };
          } catch {
            return { ok: true, service, action, output: result.stdout };
          }
        }
        
        if (action === "list-tables") {
          const dataset = params.dataset;
          if (!dataset) throw new Error("dataset is required");
          
          const args = buildArgs(["bigquery", "tables", "list", `--dataset=${dataset}`]);
          const result = await execGcloud(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          try {
            const tables = JSON.parse(result.stdout);
            return { ok: true, service, action, dataset, count: tables.length, tables };
          } catch {
            return { ok: true, service, action, dataset, output: result.stdout };
          }
        }
        
        if (action === "query") {
          const query = params.query || params.sql;
          if (!query) throw new Error("query is required");
          
          const args = buildArgs(["bigquery", "query", query], {
            "use-legacy-sql": params.useLegacySql ? "true" : "false"
          });
          const result = await execGcloud(args, 300000);
          return { ok: result.exitCode === 0, service, action, output: result.stdout || result.stderr };
        }
        
        throw new Error(`Unknown bigquery action: ${action}`);
      }

      case "vertex-ai": {
        if (action === "list-models") {
          const args = buildArgs(["ai", "models", "list", `--region=${region}`]);
          const result = await execGcloud(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          try {
            const models = JSON.parse(result.stdout);
            return { ok: true, service, action, count: models.length, models };
          } catch {
            return { ok: true, service, action, output: result.stdout };
          }
        }
        
        if (action === "list-endpoints") {
          const args = buildArgs(["ai", "endpoints", "list", `--region=${region}`]);
          const result = await execGcloud(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          try {
            const endpoints = JSON.parse(result.stdout);
            return { ok: true, service, action, count: endpoints.length, endpoints };
          } catch {
            return { ok: true, service, action, output: result.stdout };
          }
        }
        
        if (action === "predict") {
          const endpoint = params.endpoint;
          const instance = params.instance || params.instances;
          
          if (!endpoint) throw new Error("endpoint is required");
          if (!instance) throw new Error("instance data is required");
          
          const args = buildArgs(["ai", "endpoints", "predict", endpoint, `--region=${region}`], {
            "json-request": typeof instance === "string" ? instance : JSON.stringify({ instances: [instance] })
          });
          const result = await execGcloud(args, 60000);
          return { ok: result.exitCode === 0, service, action, output: result.stdout || result.stderr };
        }
        
        throw new Error(`Unknown vertex-ai action: ${action}`);
      }

      case "gke": {
        if (action === "list-clusters") {
          const args = buildArgs(["container", "clusters", "list"]);
          const result = await execGcloud(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          try {
            const clusters = JSON.parse(result.stdout);
            return { ok: true, service, action, count: clusters.length, clusters };
          } catch {
            return { ok: true, service, action, output: result.stdout };
          }
        }
        
        if (action === "get-credentials") {
          const clusterName = params.cluster || params.name;
          if (!clusterName) throw new Error("cluster name is required");
          
          const args = buildArgs(["container", "clusters", "get-credentials", clusterName, `--region=${region}`]);
          const result = await execGcloud(args);
          return { ok: result.exitCode === 0, service, action, cluster: clusterName, output: result.stdout || result.stderr };
        }
        
        throw new Error(`Unknown gke action: ${action}`);
      }

      case "pubsub": {
        if (action === "list-topics") {
          const args = buildArgs(["pubsub", "topics", "list"]);
          const result = await execGcloud(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          try {
            const topics = JSON.parse(result.stdout);
            return { ok: true, service, action, count: topics.length, topics };
          } catch {
            return { ok: true, service, action, output: result.stdout };
          }
        }
        
        if (action === "publish") {
          const topic = params.topic;
          const message = params.message || params.data;
          
          if (!topic) throw new Error("topic is required");
          if (!message) throw new Error("message is required");
          
          const args = buildArgs(["pubsub", "topics", "publish", topic, `--message=${message}`]);
          const result = await execGcloud(args);
          return { ok: result.exitCode === 0, service, action, output: result.stdout || result.stderr };
        }
        
        throw new Error(`Unknown pubsub action: ${action}`);
      }

      case "iam": {
        if (action === "list-service-accounts") {
          const args = buildArgs(["iam", "service-accounts", "list"]);
          const result = await execGcloud(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          try {
            const accounts = JSON.parse(result.stdout);
            return { ok: true, service, action, count: accounts.length, accounts };
          } catch {
            return { ok: true, service, action, output: result.stdout };
          }
        }
        
        throw new Error(`Unknown iam action: ${action}`);
      }

      default:
        if (action) {
          const args = buildArgs([service, action]);
          const result = await execGcloud(args, 120000);
          
          try {
            const data = JSON.parse(result.stdout);
            return { ok: result.exitCode === 0, service, action, data };
          } catch {
            return { ok: result.exitCode === 0, service, action, output: result.stdout || result.stderr };
          }
        }
        
        throw new Error(`GCP service '${service}' requires an action`);
    }
  }
};
