export const id = "industry_adapter";
export const name = "Industry Adapter";
export const description = "Call external APIs for specific industries (Salesforce, ServiceNow, Terraform, etc.)";
export const version = "1.0.0";

import { adapterRegistry } from "../lib/industry-adapters.mjs";
import { TerraformExecutor } from "../lib/terraform-executor.mjs";

export const inputs = {
  type: "object",
  properties: {
    industry: {
      type: "string",
      description: "Industry/domain (real_estate, legal, marketing, sales, hr, finance, code, medical, data_science, servicenow, it_ops, devops)"
    },
    adapter: {
      type: "string",
      description: "Adapter to use (e.g., salesforce, mls, mailchimp, greenhouse, alpha_vantage)"
    },
    endpoint: {
      type: "string",
      description: "Endpoint to call (e.g., query, createLead, getDeployments)"
    },
    params: {
      type: "object",
      description: "Parameters for the API call"
    }
  },
  required: ["industry", "adapter", "endpoint"]
};

export async function run({ input }) {
  const { industry, adapter, endpoint, params = {} } = input;

  try {
    const result = await adapterRegistry.callAdapter(industry, adapter, endpoint, params);
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export function listIndustries() {
  return adapterRegistry.listIndustries();
}

export function listAdapters(industry) {
  return adapterRegistry.getIndustryAdapters(industry);
}

export function checkConfig(industry, adapter) {
  return adapterRegistry.checkEnvConfigured(industry, adapter);
}
