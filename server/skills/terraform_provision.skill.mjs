export const id = "terraform_provision";
export const name = "Terraform Provisioner";
export const description = "Generate and manage infrastructure as code with Terraform (AWS, GCP, Azure, Kubernetes)";
export const version = "1.0.0";

import { TerraformExecutor } from "../lib/terraform-executor.mjs";

const executor = new TerraformExecutor(".");

export const inputs = {
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: ["init", "plan", "apply", "destroy"],
      description: "Terraform action to perform"
    },
    provider: {
      type: "string",
      enum: ["aws", "gcp", "azure", "kubernetes"],
      description: "Cloud provider"
    },
    resources: {
      type: "array",
      description: "Resources to create",
      items: {
        type: "object",
        properties: {
          type: { type: "string", description: "Resource type (ec2, s3_bucket, lambda, etc.)" },
          name: { type: "string", description: "Resource name" },
          config: { type: "object", description: "Resource configuration" }
        }
      }
    },
    credentials: {
      type: "object",
      description: "Provider credentials and configuration (values, not secrets)"
    }
  },
  required: ["action", "provider"]
};

export async function run({ input }) {
  const { action, provider, resources = [], credentials = {} } = input;

  const config = { provider, credentials, resources };

  try {
    switch (action) {
      case "init":
        return await executor.init(config);
      case "plan":
        return await executor.plan(config);
      case "apply":
        return await executor.apply(config);
      case "destroy":
        return await executor.destroy(resources.map(r => r.name));
      default:
        return { ok: false, error: `Unknown action: ${action}` };
    }
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export const resourceTypes = {
  aws: ["ec2", "s3_bucket", "lambda", "rds", "vpc", "ecs_cluster", "ecr_repo"],
  gcp: ["compute_instance", "cloud_function", "gke_cluster", "bigquery_dataset", "pubsub_topic"],
  azure: ["resource_group", "vm", "function_app", "aks_cluster", "sql_server"],
  kubernetes: ["deployment", "service", "namespace", "configmap", "secret", "ingress"]
};
