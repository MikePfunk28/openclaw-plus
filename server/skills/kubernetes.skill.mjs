export const id = "kubernetes";
export const name = "Kubernetes";
export const description = "Kubernetes cluster management - pods, deployments, services, namespaces, scaling";
export const version = "1.0.0";

export const inputs = {
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: ["get_pods", "get_deployments", "get_services", "get_nodes", "get_namespaces",
             "scale_deployment", "restart_deployment", "delete_pod", "get_logs",
             "describe_resource", "apply_manifest", "get_events"]
    },
    namespace: { type: "string", description: "Kubernetes namespace", default: "default" },
    name: { type: "string", description: "Resource name" },
    replicas: { type: "number", description: "Number of replicas for scaling" },
    manifest: { type: "object", description: "Kubernetes manifest to apply" },
    tailLines: { type: "number", description: "Number of log lines to fetch", default: 100 }
  },
  required: ["action"]
};

import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

function getKubeConfig() {
  const apiUrl = process.env.KUBERNETES_API_URL;
  const token = process.env.KUBERNETES_TOKEN;
  
  return { apiUrl, token, useKubectl: !apiUrl || !token };
}

async function kubectl(args) {
  const kubeconfig = process.env.KUBECONFIG || "";
  const env = kubeconfig ? { ...process.env, KUBECONFIG: kubeconfig } : process.env;
  
  try {
    const { stdout, stderr } = await execAsync(`kubectl ${args}`, { 
      env,
      maxBuffer: 10 * 1024 * 1024
    });
    return { ok: true, output: stdout, error: stderr };
  } catch (error) {
    return { ok: false, error: error.message, output: error.stdout || "" };
  }
}

async function k8sApiRequest(method, path, body = null) {
  const { apiUrl, token } = getKubeConfig();
  
  if (!apiUrl || !token) {
    throw new Error("Kubernetes not configured. Set KUBERNETES_API_URL and KUBERNETES_TOKEN, or use kubectl");
  }

  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Kubernetes API error: ${response.status} - ${error}`);
  }

  return response.json();
}

export async function run({ input }) {
  const { action, namespace = "default", name, replicas, manifest, tailLines = 100 } = input;
  const { useKubectl } = getKubeConfig();

  try {
    if (useKubectl) {
      return await runWithKubectl(action, { namespace, name, replicas, manifest, tailLines });
    }
    return await runWithApi(action, { namespace, name, replicas, manifest, tailLines });
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function runWithKubectl(action, params) {
  const { namespace, name, replicas, manifest, tailLines } = params;
  const ns = `-n ${namespace}`;

  switch (action) {
    case "get_pods": {
      const result = await kubectl(`get pods ${ns} -o json`);
      if (!result.ok) return result;
      const data = JSON.parse(result.output);
      return { ok: true, pods: data.items.map(p => ({
        name: p.metadata.name,
        status: p.status.phase,
        ready: `${p.status.containerStatuses?.filter(c => c.ready).length || 0}/${p.spec.containers.length}`,
        age: p.metadata.creationTimestamp,
        node: p.spec.nodeName
      }))};
    }

    case "get_deployments": {
      const result = await kubectl(`get deployments ${ns} -o json`);
      if (!result.ok) return result;
      const data = JSON.parse(result.output);
      return { ok: true, deployments: data.items.map(d => ({
        name: d.metadata.name,
        replicas: d.spec.replicas,
        available: d.status.availableReplicas || 0,
        image: d.spec.template.spec.containers[0]?.image
      }))};
    }

    case "get_services": {
      const result = await kubectl(`get services ${ns} -o json`);
      if (!result.ok) return result;
      const data = JSON.parse(result.output);
      return { ok: true, services: data.items.map(s => ({
        name: s.metadata.name,
        type: s.spec.type,
        clusterIP: s.spec.clusterIP,
        ports: s.spec.ports?.map(p => `${p.port}:${p.targetPort}/${p.protocol}`)
      }))};
    }

    case "get_nodes": {
      const result = await kubectl(`get nodes -o json`);
      if (!result.ok) return result;
      const data = JSON.parse(result.output);
      return { ok: true, nodes: data.items.map(n => ({
        name: n.metadata.name,
        status: n.status.conditions.find(c => c.type === "Ready")?.status,
        version: n.status.nodeInfo.kubeletVersion,
        os: n.status.nodeInfo.operatingSystem
      }))};
    }

    case "get_namespaces": {
      const result = await kubectl(`get namespaces -o json`);
      if (!result.ok) return result;
      const data = JSON.parse(result.output);
      return { ok: true, namespaces: data.items.map(n => ({
        name: n.metadata.name,
        status: n.status.phase
      }))};
    }

    case "scale_deployment": {
      if (!name || replicas === undefined) {
        return { ok: false, error: "name and replicas required" };
      }
      const result = await kubectl(`scale deployment ${name} ${ns} --replicas=${replicas}`);
      return result;
    }

    case "restart_deployment": {
      if (!name) return { ok: false, error: "name required" };
      const result = await kubectl(`rollout restart deployment/${name} ${ns}`);
      return result;
    }

    case "delete_pod": {
      if (!name) return { ok: false, error: "name required" };
      const result = await kubectl(`delete pod ${name} ${ns}`);
      return result;
    }

    case "get_logs": {
      if (!name) return { ok: false, error: "name (pod) required" };
      const result = await kubectl(`logs ${name} ${ns} --tail=${tailLines}`);
      return { ok: result.ok, logs: result.output, error: result.error };
    }

    case "describe_resource": {
      if (!name) return { ok: false, error: "name required" };
      const result = await kubectl(`describe ${name} ${ns}`);
      return { ok: result.ok, describe: result.output };
    }

    case "apply_manifest": {
      if (!manifest) return { ok: false, error: "manifest required" };
      const manifestYaml = JSON.stringify(manifest);
      const result = await kubectl(`apply -f - ${ns}`, manifestYaml);
      return result;
    }

    case "get_events": {
      const result = await kubectl(`get events ${ns} --sort-by='.lastTimestamp' -o json`);
      if (!result.ok) return result;
      const data = JSON.parse(result.output);
      return { ok: true, events: data.items.slice(-20).map(e => ({
        type: e.type,
        reason: e.reason,
        message: e.message,
        object: `${e.involvedObject.kind}/${e.involvedObject.name}`,
        time: e.lastTimestamp
      }))};
    }

    default:
      return { ok: false, error: `Unknown action: ${action}` };
  }
}

async function runWithApi(action, params) {
  const { namespace, name, replicas, tailLines } = params;

  switch (action) {
    case "get_pods": {
      const data = await k8sApiRequest("GET", `/api/v1/namespaces/${namespace}/pods`);
      return { ok: true, pods: data.items.map(p => ({
        name: p.metadata.name,
        status: p.status.phase,
        ready: p.status.containerStatuses?.filter(c => c.ready).length || 0
      }))};
    }

    case "scale_deployment": {
      if (!name || replicas === undefined) {
        return { ok: false, error: "name and replicas required" };
      }
      await k8sApiRequest("PATCH", `/apis/apps/v1/namespaces/${namespace}/deployments/${name}/scale`, {
        spec: { replicas }
      });
      return { ok: true };
    }

    default:
      return runWithKubectl(action, params);
  }
}

export function checkConfig() {
  const apiUrl = process.env.KUBERNETES_API_URL;
  const token = process.env.KUBERNETES_TOKEN;
  
  return {
    configured: !!(apiUrl && token),
    mode: (apiUrl && token) ? "api" : "kubectl",
    missing: [
      !apiUrl && "KUBERNETES_API_URL",
      !token && "KUBERNETES_TOKEN"
    ].filter(Boolean)
  };
}
