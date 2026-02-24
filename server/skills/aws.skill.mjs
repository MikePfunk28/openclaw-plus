import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";

export const skill = {
  id: "aws",
  name: "AWS",
  description: "AWS cloud operations - EC2, S3, Lambda, IAM, ECS, EKS, RDS, and more. Supports LocalStack for local development.",
  inputSchema: {
    type: "object",
    properties: {
      service: {
        type: "string",
        enum: ["ec2", "s3", "lambda", "iam", "ecs", "eks", "rds", "dynamodb", "sns", "sqs", "cloudformation", "sts", "configure", "localstack"],
        description: "AWS service to interact with"
      },
      action: {
        type: "string",
        description: "Action to perform (e.g., 'list-instances', 'create-bucket')"
      },
      params: {
        type: "object",
        description: "Parameters for the action",
        additionalProperties: true
      },
      region: {
        type: "string",
        description: "AWS region (default: us-east-1)",
        default: "us-east-1"
      },
      profile: {
        type: "string",
        description: "AWS profile to use"
      },
      useLocalstack: {
        type: "boolean",
        description: "Use LocalStack endpoint",
        default: false
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
    const region = input?.region || process.env.AWS_DEFAULT_REGION || "us-east-1";
    const profile = input?.profile || process.env.AWS_PROFILE;
    const useLocalstack = input?.useLocalstack || process.env.AWS_LOCALSTACK === "true";
    const output = input?.output || "json";

    const awsDir = path.join(workspaceRoot, "infra", "aws");
    await mkdir(awsDir, { recursive: true });

    const execAws = (args, timeoutMs = 60000) => {
      return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        
        const env = { ...process.env };
        
        if (useLocalstack) {
          env.AWS_ENDPOINT_URL = process.env.LOCALSTACK_ENDPOINT || "http://localhost:4566";
          env.AWS_ACCESS_KEY_ID = process.env.LOCALSTACK_ACCESS_KEY || "test";
          env.AWS_SECRET_ACCESS_KEY = process.env.LOCALSTACK_SECRET_KEY || "test";
        }
        
        if (profile) {
          env.AWS_PROFILE = profile;
        }
        
        env.AWS_REGION = region;
        env.AWS_DEFAULT_REGION = region;
        env.AWS_OUTPUT = output;

        const child = spawn("aws", args, {
          env,
          cwd: awsDir,
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
        
        if (Array.isArray(value)) {
          for (const v of value) {
            args.push(`--${key}`, String(v));
          }
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
        if (action === "status") {
          const result = await execAws(["configure", "list"]);
          return {
            ok: result.exitCode === 0,
            action: "status",
            output: result.stdout || result.stderr,
            localstack: useLocalstack,
            region
          };
        }
        
        if (action === "setup") {
          const setupScript = `# AWS CLI Setup

# Install AWS CLI
# Windows: winget install Amazon.AWSCLI
# macOS: brew install awscli
# Linux: 
#   curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
#   unzip awscliv2.zip && sudo ./aws/install

# Configure credentials
aws configure

# Or set environment variables:
# export AWS_ACCESS_KEY_ID=your-key
# export AWS_SECRET_ACCESS_KEY=your-secret
# export AWS_DEFAULT_REGION=us-east-1

# For LocalStack (local development):
# docker run -d -p 4566:4566 localstack/localstack
# export AWS_LOCALSTACK=true
# export AWS_ENDPOINT_URL=http://localhost:4566
`;
          const setupPath = path.join(awsDir, "setup.md");
          await writeFile(setupPath, setupScript, "utf8");
          
          return {
            ok: true,
            action: "setup",
            message: "Setup guide created",
            path: setupPath
          };
        }
        
        throw new Error(`Unknown configure action: ${action}`);
      }

      case "localstack": {
        if (action === "start") {
          const result = await execAws(["localstack", "start", "-d"], 30000);
          return {
            ok: result.exitCode === 0,
            action: "start",
            message: result.exitCode === 0 ? "LocalStack started" : result.stderr
          };
        }
        
        if (action === "status") {
          const result = await execAws(["localstack", "status"], 10000);
          return {
            ok: result.exitCode === 0,
            action: "status",
            output: result.stdout || result.stderr
          };
        }
        
        throw new Error(`Unknown localstack action: ${action}`);
      }

      case "sts": {
        if (action === "get-caller-identity") {
          const args = buildArgs("sts", "get-caller-identity");
          const result = await execAws(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          try {
            const identity = JSON.parse(result.stdout);
            return { ok: true, service, action, identity };
          } catch {
            return { ok: true, service, action, output: result.stdout };
          }
        }
        
        throw new Error(`Unknown sts action: ${action}`);
      }

      case "ec2": {
        if (action === "list-instances" || action === "describe-instances") {
          const args = buildArgs("ec2", "describe-instances");
          const result = await execAws(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          try {
            const data = JSON.parse(result.stdout);
            const instances = [];
            for (const reservation of (data.Reservations || [])) {
              for (const instance of (reservation.Instances || [])) {
                instances.push({
                  instanceId: instance.InstanceId,
                  type: instance.InstanceType,
                  state: instance.State?.Name,
                  name: (instance.Tags || []).find(t => t.Key === "Name")?.Value || "",
                  publicIp: instance.PublicIpAddress,
                  privateIp: instance.PrivateIpAddress,
                  launchTime: instance.LaunchTime
                });
              }
            }
            return { ok: true, service, action, count: instances.length, instances };
          } catch {
            return { ok: true, service, action, output: result.stdout };
          }
        }
        
        if (action === "start-instance") {
          const args = buildArgs("ec2", "start-instances", { "instance-ids": params.instanceIds || [params.instanceId] });
          const result = await execAws(args);
          return { ok: result.exitCode === 0, service, action, output: result.stdout || result.stderr };
        }
        
        if (action === "stop-instance") {
          const args = buildArgs("ec2", "stop-instances", { "instance-ids": params.instanceIds || [params.instanceId] });
          const result = await execAws(args);
          return { ok: result.exitCode === 0, service, action, output: result.stdout || result.stderr };
        }
        
        throw new Error(`Unknown ec2 action: ${action}`);
      }

      case "s3": {
        if (action === "list-buckets") {
          const args = buildArgs("s3", "ls");
          const result = await execAws(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          const buckets = result.stdout.trim().split("\n")
            .filter(Boolean)
            .map(line => {
              const parts = line.trim().split(/\s+/);
              return { creationDate: parts[0], time: parts[1], name: parts[2] };
            });
          
          return { ok: true, service, action, count: buckets.length, buckets };
        }
        
        if (action === "create-bucket") {
          const bucketName = params.bucket || params.name;
          if (!bucketName) throw new Error("bucket name is required");
          
          const args = buildArgs("s3", "mb", { bucket: `s3://${bucketName}` });
          const result = await execAws(args);
          return { ok: result.exitCode === 0, service, action, bucket: bucketName, output: result.stdout || result.stderr };
        }
        
        if (action === "list-objects" || action === "ls") {
          const bucket = params.bucket;
          if (!bucket) throw new Error("bucket is required");
          
          const args = buildArgs("s3", "ls", { bucket: `s3://${bucket}${params.prefix || ""}` });
          const result = await execAws(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          const objects = result.stdout.trim().split("\n")
            .filter(Boolean)
            .map(line => {
              const parts = line.trim().split(/\s+/);
              if (line.endsWith("/")) {
                return { type: "prefix", name: parts[parts.length - 1] };
              }
              return {
                type: "object",
                date: parts[0],
                time: parts[1],
                size: parts[2],
                key: parts.slice(3).join(" ")
              };
            });
          
          return { ok: true, service, action, bucket, count: objects.length, objects };
        }
        
        if (action === "upload" || action === "cp") {
          const { source, destination } = params;
          if (!source || !destination) throw new Error("source and destination are required");
          
          const args = buildArgs("s3", "cp", { bucket: source, key: destination });
          const result = await execAws(args, 120000);
          return { ok: result.exitCode === 0, service, action, output: result.stdout || result.stderr };
        }
        
        if (action === "download") {
          const { source, destination } = params;
          if (!source || !destination) throw new Error("source and destination are required");
          
          const args = ["s3", "cp", source, destination];
          const result = await execAws(args, 120000);
          return { ok: result.exitCode === 0, service, action, output: result.stdout || result.stderr };
        }
        
        throw new Error(`Unknown s3 action: ${action}`);
      }

      case "lambda": {
        if (action === "list-functions") {
          const args = buildArgs("lambda", "list-functions");
          const result = await execAws(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          try {
            const data = JSON.parse(result.stdout);
            const functions = (data.Functions || []).map(f => ({
              name: f.FunctionName,
              runtime: f.Runtime,
              handler: f.Handler,
              lastModified: f.LastModified,
              description: f.Description
            }));
            return { ok: true, service, action, count: functions.length, functions };
          } catch {
            return { ok: true, service, action, output: result.stdout };
          }
        }
        
        if (action === "invoke") {
          const functionName = params.function || params.name;
          if (!functionName) throw new Error("function name is required");
          
          const payload = params.payload ? JSON.stringify(params.payload) : "{}";
          const args = buildArgs("lambda", "invoke", {
            "function-name": functionName,
            payload
          });
          const result = await execAws(args, 60000);
          return { ok: result.exitCode === 0, service, action, output: result.stdout || result.stderr };
        }
        
        throw new Error(`Unknown lambda action: ${action}`);
      }

      case "iam": {
        if (action === "list-users") {
          const args = buildArgs("iam", "list-users");
          const result = await execAws(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          try {
            const data = JSON.parse(result.stdout);
            const users = (data.Users || []).map(u => ({
              userName: u.UserName,
              userId: u.UserId,
              arn: u.Arn,
              createDate: u.CreateDate
            }));
            return { ok: true, service, action, count: users.length, users };
          } catch {
            return { ok: true, service, action, output: result.stdout };
          }
        }
        
        if (action === "list-roles") {
          const args = buildArgs("iam", "list-roles");
          const result = await execAws(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          try {
            const data = JSON.parse(result.stdout);
            const roles = (data.Roles || []).map(r => ({
              roleName: r.RoleName,
              arn: r.Arn,
              createDate: r.CreateDate
            }));
            return { ok: true, service, action, count: roles.length, roles };
          } catch {
            return { ok: true, service, action, output: result.stdout };
          }
        }
        
        throw new Error(`Unknown iam action: ${action}`);
      }

      case "dynamodb": {
        if (action === "list-tables") {
          const args = buildArgs("dynamodb", "list-tables");
          const result = await execAws(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          try {
            const data = JSON.parse(result.stdout);
            return { ok: true, service, action, tables: data.TableNames || [] };
          } catch {
            return { ok: true, service, action, output: result.stdout };
          }
        }
        
        if (action === "scan" || action === "query") {
          const tableName = params.table || params.TableName;
          if (!tableName) throw new Error("table name is required");
          
          const args = buildArgs("dynamodb", action, { "table-name": tableName });
          const result = await execAws(args, 60000);
          return { ok: result.exitCode === 0, service, action, output: result.stdout };
        }
        
        throw new Error(`Unknown dynamodb action: ${action}`);
      }

      case "cloudformation": {
        if (action === "list-stacks") {
          const args = buildArgs("cloudformation", "list-stacks");
          const result = await execAws(args);
          
          if (result.exitCode !== 0) {
            return { ok: false, service, action, error: result.stderr };
          }
          
          try {
            const data = JSON.parse(result.stdout);
            const stacks = (data.StackSummaries || []).map(s => ({
              stackName: s.StackName,
              stackStatus: s.StackStatus,
              creationTime: s.CreationTime
            }));
            return { ok: true, service, action, count: stacks.length, stacks };
          } catch {
            return { ok: true, service, action, output: result.stdout };
          }
        }
        
        if (action === "deploy") {
          const { stackName, templateFile, capabilities } = params;
          if (!stackName || !templateFile) {
            throw new Error("stackName and templateFile are required");
          }
          
          const args = ["cloudformation", "deploy", 
            "--stack-name", stackName,
            "--template-file", templateFile,
            "--capabilities", capabilities || "CAPABILITY_IAM"
          ];
          
          const result = await execAws(args, 300000);
          return { ok: result.exitCode === 0, service, action, output: result.stdout || result.stderr };
        }
        
        throw new Error(`Unknown cloudformation action: ${action}`);
      }

      default:
        // Generic passthrough for any AWS service
        if (action) {
          const args = buildArgs(service, action);
          const result = await execAws(args, 120000);
          
          try {
            const data = JSON.parse(result.stdout);
            return { ok: result.exitCode === 0, service, action, data };
          } catch {
            return { ok: result.exitCode === 0, service, action, output: result.stdout || result.stderr };
          }
        }
        
        throw new Error(`AWS service '${service}' requires an action`);
    }
  }
};
