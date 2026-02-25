export const id = "cloud_provider";
export const name = "Cloud Provider";
export const description = "Multi-cloud operations - AWS, GCP, Azure, DigitalOcean, Hetzner, Vultr, Linode, Alibaba";
export const version = "1.0.0";

export const inputs = {
  type: "object",
  properties: {
    provider: {
      type: "string",
      enum: ["aws", "gcp", "azure", "digitalocean", "hetzner", "vultr", "linode", "alibaba"],
      description: "Cloud provider"
    },
    service: { type: "string", description: "Service (ec2, lambda, compute, vm, etc.)" },
    operation: { type: "string", description: "Operation to perform" },
    params: { type: "object", description: "Operation parameters" }
  },
  required: ["provider", "operation"]
};

import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

async function awsCli(args) {
  try {
    const { stdout } = await execAsync(`aws ${args} --output json`);
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`AWS CLI error: ${error.message}`);
  }
}

async function gcloudCli(args) {
  try {
    const { stdout } = await execAsync(`gcloud ${args} --format=json`);
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`gcloud CLI error: ${error.message}`);
  }
}

async function azureCli(args) {
  try {
    const { stdout } = await execAsync(`az ${args} --output json`);
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`Azure CLI error: ${error.message}`);
  }
}

async function doCli(args) {
  try {
    const { stdout } = await execAsync(`doctl ${args} --output json`);
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`DigitalOcean CLI error: ${error.message}`);
  }
}

async function hcloudCli(args) {
  try {
    const { stdout } = await execAsync(`hcloud ${args} -o json`);
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`Hetzner CLI error: ${error.message}`);
  }
}

async function awsOperation(service, operation, params) {
  const region = process.env.AWS_REGION || "us-east-1";
  
  switch (service) {
    case "ec2":
      switch (operation) {
        case "listInstances":
          return { instances: await awsCli(`ec2 describe-instances --region ${region} --query 'Reservations[*].Instances[*].{Id:InstanceId,Type:InstanceType,State:State.Name,Name:Tags[?Key==\`Name\`].Value|[0],PublicIP:PublicIpAddress}'`) };
        case "startInstance":
          await awsCli(`ec2 start-instances --instance-ids ${params.instanceId} --region ${region}`);
          return { ok: true };
        case "stopInstance":
          await awsCli(`ec2 stop-instances --instance-ids ${params.instanceId} --region ${region}`);
          return { ok: true };
        case "rebootInstance":
          await awsCli(`ec2 reboot-instances --instance-ids ${params.instanceId} --region ${region}`);
          return { ok: true };
        default:
          throw new Error(`Unknown EC2 operation: ${operation}`);
      }
      
    case "lambda":
      switch (operation) {
        case "listFunctions":
          return { functions: await awsCli(`lambda list-functions --region ${region}`) };
        case "invoke":
          const payload = params.payload ? JSON.stringify(params.payload) : "{}";
          return { result: await awsCli(`lambda invoke --function-name ${params.functionName} --payload '${payload}' --region ${region} /dev/stdout`) };
        default:
          throw new Error(`Unknown Lambda operation: ${operation}`);
      }
      
    case "s3":
      switch (operation) {
        case "listBuckets":
          return { buckets: await awsCli("s3 ls") };
        default:
          throw new Error(`Unknown S3 operation: ${operation}`);
      }
      
    case "ecs":
      switch (operation) {
        case "listClusters":
          return { clusters: await awsCli(`ecs list-clusters --region ${region}`) };
        case "listServices":
          return { services: await awsCli(`ecs list-services --cluster ${params.cluster} --region ${region}`) };
        default:
          throw new Error(`Unknown ECS operation: ${operation}`);
      }
      
    case "rds":
      switch (operation) {
        case "listInstances":
          return { instances: await awsCli(`rds describe-db-instances --region ${region}`) };
        default:
          throw new Error(`Unknown RDS operation: ${operation}`);
      }
      
    default:
      throw new Error(`Unknown AWS service: ${service}`);
  }
}

async function gcpOperation(service, operation, params) {
  const project = process.env.GCP_PROJECT_ID;
  
  switch (service) {
    case "compute":
      switch (operation) {
        case "listInstances":
          return { instances: await gcloudCli(`compute instances list --project=${project}`) };
        default:
          throw new Error(`Unknown Compute operation: ${operation}`);
      }
      
    case "cloudfunctions":
      switch (operation) {
        case "listFunctions":
          return { functions: await gcloudCli(`functions list --project=${project}`) };
        default:
          throw new Error(`Unknown Cloud Functions operation: ${operation}`);
      }
      
    case "run":
      switch (operation) {
        case "listServices":
          return { services: await gcloudCli(`run services list --project=${project}`) };
        default:
          throw new Error(`Unknown Cloud Run operation: ${operation}`);
      }
      
    case "gke":
      switch (operation) {
        case "listClusters":
          return { clusters: await gcloudCli(`container clusters list --project=${project}`) };
        default:
          throw new Error(`Unknown GKE operation: ${operation}`);
      }
      
    case "bigquery":
      switch (operation) {
        case "listDatasets":
          return { datasets: await gcloudCli(`bq ls --project_id=${project}`) };
        default:
          throw new Error(`Unknown BigQuery operation: ${operation}`);
      }
      
    default:
      throw new Error(`Unknown GCP service: ${service}`);
  }
}

async function azureOperation(service, operation, params) {
  switch (service) {
    case "vm":
      switch (operation) {
        case "listVMs":
          return { vms: await azureCli("vm list") };
        case "startVM":
          await azureCli(`vm start --name ${params.name} --resource-group ${params.resourceGroup}`);
          return { ok: true };
        case "stopVM":
          await azureCli(`vm deallocate --name ${params.name} --resource-group ${params.resourceGroup}`);
          return { ok: true };
        default:
          throw new Error(`Unknown VM operation: ${operation}`);
      }
      
    case "aks":
      switch (operation) {
        case "listClusters":
          return { clusters: await azureCli("aks list") };
        default:
          throw new Error(`Unknown AKS operation: ${operation}`);
      }
      
    case "functionapp":
      switch (operation) {
        case "listApps":
          return { apps: await azureCli("functionapp list") };
        default:
          throw new Error(`Unknown Function App operation: ${operation}`);
      }
      
    default:
      throw new Error(`Unknown Azure service: ${service}`);
  }
}

async function digitaloceanOperation(service, operation, params) {
  switch (service) {
    case "droplet":
      switch (operation) {
        case "list":
          return { droplets: await doCli("compute droplet list") };
        case "create":
          return await doCli(`compute droplet create ${params.name} --region ${params.region} --size ${params.size} --image ${params.image}`);
        case "delete":
          await doCli(`compute droplet delete ${params.id} --force`);
          return { ok: true };
        case "powerOn":
          await doCli(`compute droplet-action power-on ${params.id}`);
          return { ok: true };
        case "powerOff":
          await doCli(`compute droplet-action power-off ${params.id}`);
          return { ok: true };
        default:
          throw new Error(`Unknown Droplet operation: ${operation}`);
      }
      
    case "kubernetes":
      switch (operation) {
        case "listClusters":
          return { clusters: await doCli("kubernetes cluster list") };
        default:
          throw new Error(`Unknown Kubernetes operation: ${operation}`);
      }
      
    default:
      throw new Error(`Unknown DigitalOcean service: ${service}`);
  }
}

async function hetznerOperation(service, operation, params) {
  switch (service) {
    case "server":
      switch (operation) {
        case "list":
          return { servers: await hcloudCli("server list") };
        case "create":
          return await hcloudCli(`server create --name ${params.name} --type ${params.type} --image ${params.image}`);
        case "delete":
          await hcloudCli(`server delete ${params.id}`);
          return { ok: true };
        case "powerOn":
          await hcloudCli(`server poweron ${params.id}`);
          return { ok: true };
        case "powerOff":
          await hcloudCli(`server poweroff ${params.id}`);
          return { ok: true };
        default:
          throw new Error(`Unknown Server operation: ${operation}`);
      }
      
    default:
      throw new Error(`Unknown Hetzner service: ${service}`);
  }
}

export async function run({ input }) {
  const { provider, service = "default", operation, params = {} } = input;

  try {
    let result;
    
    switch (provider) {
      case "aws":
        result = await awsOperation(service, operation, params);
        break;
      case "gcp":
        result = await gcpOperation(service, operation, params);
        break;
      case "azure":
        result = await azureOperation(service, operation, params);
        break;
      case "digitalocean":
        result = await digitaloceanOperation(service, operation, params);
        break;
      case "hetzner":
        result = await hetznerOperation(service, operation, params);
        break;
      case "vultr":
        throw new Error("Vultr requires vultr-cli or API key");
      case "linode":
        throw new Error("Linode requires linode-cli or API key");
      case "alibaba":
        throw new Error("Alibaba requires aliyun CLI or API key");
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }

    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export const supportedProviders = [
  { id: "aws", name: "AWS", icon: "☁️", cli: "aws" },
  { id: "gcp", name: "Google Cloud", icon: "🌐", cli: "gcloud" },
  { id: "azure", name: "Microsoft Azure", icon: "🔵", cli: "az" },
  { id: "digitalocean", name: "DigitalOcean", icon: "🌊", cli: "doctl" },
  { id: "hetzner", name: "Hetzner", icon: "🇩🇪", cli: "hcloud" },
  { id: "vultr", name: "Vultr", icon: "🔷", cli: "vultr-cli" },
  { id: "linode", name: "Linode", icon: "🟢", cli: "linode-cli" },
  { id: "alibaba", name: "Alibaba Cloud", icon: "🟠", cli: "aliyun" }
];
