import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

export const skill = {
  id: "alibaba",
  name: "Alibaba Cloud (Aliyun)",
  description: "Alibaba Cloud operations - ECS, OSS, Function Compute, Container Service, RDS, Table Store, and more.",
  inputSchema: {
    type: "object",
    properties: {
      service: {
        type: "string",
        enum: ["ecs", "oss", "fc", "cs", "rds", "ots", "slb", "vpc", "ram", "configure"],
        description: "Alibaba Cloud service to interact with"
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
      region: {
        type: "string",
        description: "Alibaba Cloud region (default: cn-hangzhou)",
        default: "cn-hangzhou"
      },
      output: {
        type: "string",
        enum: ["json", "text", "table"],
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
    const region = input?.region || process.env.ALIBABA_REGION || "cn-hangzhou";
    const output = input?.output || "json";

    const alibabaDir = path.join(workspaceRoot, "infra", "alibaba");
    await mkdir(alibabaDir, { recursive: true });

    const execAliyun = (args, timeoutMs = 60000) => {
      return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        
        const env = { ...process.env };
        env.ALIBABACLOUD_REGION = region;

        const child = spawn("aliyun", args, {
          env,
          cwd: alibabaDir,
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

    const buildArgs = (serviceName, actionName, extraParams = {}) => {
      const args = [serviceName, actionName, "--region", region, "--output", output];
      
      for (const [key, value] of Object.entries({ ...params, ...extraParams })) {
        if (value === undefined || value === null) continue;
        
        const keyLower = key.replace(/([A-Z])/g, ".$1").toLowerCase();
        
        if (Array.isArray(value)) {
          for (const v of value) {
            args.push(`--${keyLower}`, String(v));
          }
        } else if (typeof value === "object") {
          args.push(`--${keyLower}`, JSON.stringify(value));
        } else {
          args.push(`--${keyLower}`, String(value));
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
          const result = await execAliyun(["configure", "list"]);
          return {
            ok: result.exitCode === 0,
            action: "status",
            output: parseOutput(result),
            region
          };
        }
        
        if (action === "setup") {
          const setupGuide = `# Alibaba Cloud CLI Setup

## Install Alibaba Cloud CLI

### Windows
Download from: https://github.com/aliyun/aliyun-cli/releases
Or use: winget install Alibaba.AlibabaCloudCLI

### macOS
brew install aliyun-cli

### Linux
wget https://aliyuncli.alicdn.com/aliyun-cli-linux-latest-amd64.tgz
tar -xzf aliyun-cli-linux-latest-amd64.tgz
sudo mv aliyun /usr/local/bin/

## Configure Credentials
aliyun configure

# You will be prompted for:
# - Access Key ID
# - Access Key Secret
# - Default Region (e.g., cn-hangzhou, us-east-1)
# - Default Output Format (json)

## Environment Variables (alternative)
# export ALIBABACLOUD_ACCESS_KEY_ID=your-key-id
# export ALIBABACLOUD_ACCESS_KEY_SECRET=your-key-secret
# export ALIBABACLOUD_REGION=cn-hangzhou

## Create Access Key
# Go to: https://ram.console.aliyun.com/manage/ak
# Create AccessKey for your account or RAM user

## Regions
# China: cn-hangzhou, cn-shanghai, cn-beijing, cn-shenzhen
# International: us-east-1, us-west-1, eu-central-1, ap-southeast-1
`;
          const setupPath = path.join(alibabaDir, "setup.md");
          await writeFile(setupPath, setupGuide, "utf8");
          
          return {
            ok: true,
            action: "setup",
            message: "Setup guide created",
            path: setupPath
          };
        }
        
        if (action === "set") {
          const profile = params.profile || "default";
          const result = await execAliyun(["configure", "set", "--profile", profile, ...Object.entries(params).filter(([k]) => k !== "profile" && k !== "action").flatMap(([k, v]) => [`--${k}`, String(v)])]);
          return {
            ok: result.exitCode === 0,
            action: "set",
            output: result.stdout || result.stderr
          };
        }
        
        throw new Error(`Unknown configure action: ${action}`);
      }

      case "ecs": {
        if (action === "list-instances" || action === "describe-instances") {
          const args = buildArgs("ecs", "DescribeInstances");
          const result = await execAliyun(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          const data = parseOutput(result);
          const instances = data?.Instances?.Instance || [];
          return { ok: true, service, action, count: instances.length, instances };
        }
        
        if (action === "start-instance") {
          const instanceId = params.instanceId || params.id;
          if (!instanceId) throw new Error("instanceId is required");
          
          const args = buildArgs("ecs", "StartInstance", { InstanceId: instanceId });
          const result = await execAliyun(args);
          return { ok: result.exitCode === 0, service, action, instanceId, output: parseOutput(result) };
        }
        
        if (action === "stop-instance") {
          const instanceId = params.instanceId || params.id;
          if (!instanceId) throw new Error("instanceId is required");
          
          const args = buildArgs("ecs", "StopInstance", { InstanceId: instanceId });
          const result = await execAliyun(args);
          return { ok: result.exitCode === 0, service, action, instanceId, output: parseOutput(result) };
        }
        
        if (action === "reboot-instance") {
          const instanceId = params.instanceId || params.id;
          if (!instanceId) throw new Error("instanceId is required");
          
          const args = buildArgs("ecs", "RebootInstance", { InstanceId: instanceId });
          const result = await execAliyun(args);
          return { ok: result.exitCode === 0, service, action, instanceId, output: parseOutput(result) };
        }
        
        if (action === "list-regions") {
          const args = buildArgs("ecs", "DescribeRegions");
          const result = await execAliyun(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          const data = parseOutput(result);
          const regions = data?.Regions?.Region || [];
          return { ok: true, service, action, count: regions.length, regions };
        }
        
        if (action === "list-zones") {
          const args = buildArgs("ecs", "DescribeZones");
          const result = await execAliyun(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          const data = parseOutput(result);
          const zones = data?.Zones?.Zone || [];
          return { ok: true, service, action, region, count: zones.length, zones };
        }
        
        throw new Error(`Unknown ecs action: ${action}`);
      }

      case "oss": {
        if (action === "list-buckets") {
          const args = buildArgs("oss", "ls");
          const result = await execAliyun(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          const buckets = result.stdout.trim().split("\n")
            .filter(Boolean)
            .map(line => {
              const match = line.match(/oss:\/\/([^\s]+)/);
              return match ? { name: match[1], raw: line } : null;
            })
            .filter(Boolean);
          
          return { ok: true, service, action, count: buckets.length, buckets };
        }
        
        if (action === "create-bucket" || action === "mb") {
          const bucketName = params.bucket || params.name;
          if (!bucketName) throw new Error("bucket name is required");
          
          const args = buildArgs("oss", "mb", { bucket: `oss://${bucketName}` });
          const result = await execAliyun(args);
          return { ok: result.exitCode === 0, service, action, bucket: bucketName, output: result.stdout || result.stderr };
        }
        
        if (action === "delete-bucket" || action === "rb") {
          const bucketName = params.bucket || params.name;
          if (!bucketName) throw new Error("bucket name is required");
          
          const args = buildArgs("oss", "rb", { bucket: `oss://${bucketName}` });
          const result = await execAliyun(args);
          return { ok: result.exitCode === 0, service, action, bucket: bucketName, output: result.stdout || result.stderr };
        }
        
        if (action === "list-objects" || action === "ls") {
          const bucket = params.bucket;
          if (!bucket) throw new Error("bucket is required");
          
          const args = buildArgs("oss", "ls", { bucket: `oss://${bucket}${params.prefix || ""}` });
          const result = await execAliyun(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          return { ok: true, service, action, bucket, output: result.stdout };
        }
        
        if (action === "upload" || action === "cp") {
          const { source, destination } = params;
          if (!source || !destination) throw new Error("source and destination are required");
          
          const args = buildArgs("oss", "cp", { source, destination });
          const result = await execAliyun(args, 120000);
          return { ok: result.exitCode === 0, service, action, output: result.stdout || result.stderr };
        }
        
        if (action === "download") {
          const { source, destination } = params;
          if (!source || !destination) throw new Error("source and destination are required");
          
          const args = buildArgs("oss", "cp", { source, destination });
          const result = await execAliyun(args, 120000);
          return { ok: result.exitCode === 0, service, action, output: result.stdout || result.stderr };
        }
        
        throw new Error(`Unknown oss action: ${action}`);
      }

      case "fc": {
        if (action === "list-services") {
          const args = buildArgs("fc", "GET", "/services");
          const result = await execAliyun(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          return { ok: true, service, action, output: parseOutput(result) };
        }
        
        if (action === "list-functions") {
          const serviceName = params.service || params.serviceName;
          if (!serviceName) throw new Error("service name is required");
          
          const args = buildArgs("fc", "GET", `/services/${serviceName}/functions`);
          const result = await execAliyun(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          return { ok: true, service, action, service: serviceName, output: parseOutput(result) };
        }
        
        if (action === "invoke-function") {
          const serviceName = params.service || params.serviceName;
          const functionName = params.function || params.functionName;
          
          if (!serviceName) throw new Error("service name is required");
          if (!functionName) throw new Error("function name is required");
          
          const args = buildArgs("fc", "POST", `/services/${serviceName}/functions/${functionName}/invocations`);
          const result = await execAliyun(args, 60000);
          return { ok: result.exitCode === 0, service, action, output: parseOutput(result) };
        }
        
        throw new Error(`Unknown fc action: ${action}`);
      }

      case "cs": {
        if (action === "list-clusters") {
          const args = buildArgs("cs", "GET", "/clusters");
          const result = await execAliyun(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          const clusters = parseOutput(result);
          return { ok: true, service, action, count: Array.isArray(clusters) ? clusters.length : 0, clusters };
        }
        
        if (action === "describe-cluster") {
          const clusterId = params.clusterId || params.id;
          if (!clusterId) throw new Error("clusterId is required");
          
          const args = buildArgs("cs", "GET", `/clusters/${clusterId}`);
          const result = await execAliyun(args);
          return { ok: result.exitCode === 0, service, action, cluster: clusterId, output: parseOutput(result) };
        }
        
        if (action === "get-kubeconfig") {
          const clusterId = params.clusterId || params.id;
          if (!clusterId) throw new Error("clusterId is required");
          
          const args = buildArgs("cs", "GET", `/k8s/${clusterId}/user_config`);
          const result = await execAliyun(args);
          return { ok: result.exitCode === 0, service, action, cluster: clusterId, output: result.stdout };
        }
        
        throw new Error(`Unknown cs action: ${action}`);
      }

      case "rds": {
        if (action === "list-instances" || action === "describe-instances") {
          const args = buildArgs("rds", "DescribeDBInstances");
          const result = await execAliyun(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          const data = parseOutput(result);
          const instances = data?.Items?.DBInstance || [];
          return { ok: true, service, action, count: instances.length, instances };
        }
        
        if (action === "list-databases") {
          const instanceId = params.instanceId || params.id;
          if (!instanceId) throw new Error("instanceId is required");
          
          const args = buildArgs("rds", "DescribeDatabases", { DBInstanceId: instanceId });
          const result = await execAliyun(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          const data = parseOutput(result);
          const databases = data?.Databases?.Database || [];
          return { ok: true, service, action, instanceId, count: databases.length, databases };
        }
        
        throw new Error(`Unknown rds action: ${action}`);
      }

      case "ots": {
        if (action === "list-instances") {
          const args = buildArgs("ots", "ListInstance");
          const result = await execAliyun(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          return { ok: true, service, action, output: parseOutput(result) };
        }
        
        if (action === "list-tables") {
          const instanceName = params.instance || params.instanceName;
          if (!instanceName) throw new Error("instance name is required");
          
          const args = buildArgs("ots", "ListTable", { instance: instanceName });
          const result = await execAliyun(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          return { ok: true, service, action, instance: instanceName, output: parseOutput(result) };
        }
        
        throw new Error(`Unknown ots action: ${action}`);
      }

      case "slb": {
        if (action === "list-instances" || action === "describe-instances") {
          const args = buildArgs("slb", "DescribeLoadBalancers");
          const result = await execAliyun(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          const data = parseOutput(result);
          const instances = data?.LoadBalancers?.LoadBalancer || [];
          return { ok: true, service, action, count: instances.length, instances };
        }
        
        throw new Error(`Unknown slb action: ${action}`);
      }

      case "vpc": {
        if (action === "list-vpcs" || action === "describe-vpcs") {
          const args = buildArgs("vpc", "DescribeVpcs");
          const result = await execAliyun(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          const data = parseOutput(result);
          const vpcs = data?.Vpcs?.Vpc || [];
          return { ok: true, service, action, count: vpcs.length, vpcs };
        }
        
        if (action === "list-vswitches" || action === "describe-vswitches") {
          const args = buildArgs("vpc", "DescribeVSwitches");
          const result = await execAliyun(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          const data = parseOutput(result);
          const vswitches = data?.VSwitches?.VSwitch || [];
          return { ok: true, service, action, count: vswitches.length, vswitches };
        }
        
        throw new Error(`Unknown vpc action: ${action}`);
      }

      case "ram": {
        if (action === "list-users") {
          const args = buildArgs("ram", "ListUsers");
          const result = await execAliyun(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          const data = parseOutput(result);
          const users = data?.Users?.User || [];
          return { ok: true, service, action, count: users.length, users };
        }
        
        if (action === "list-roles") {
          const args = buildArgs("ram", "ListRoles");
          const result = await execAliyun(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          const data = parseOutput(result);
          const roles = data?.Roles?.Role || [];
          return { ok: true, service, action, count: roles.length, roles };
        }
        
        throw new Error(`Unknown ram action: ${action}`);
      }

      default:
        if (action) {
          const args = buildArgs(service, action);
          const result = await execAliyun(args, 120000);
          
          try {
            const data = JSON.parse(result.stdout);
            return { ok: result.exitCode === 0, service, action, data };
          } catch {
            return { ok: result.exitCode === 0, service, action, output: result.stdout || result.stderr };
          }
        }
        
        throw new Error(`Alibaba Cloud service '${service}' requires an action`);
    }
  }
};
