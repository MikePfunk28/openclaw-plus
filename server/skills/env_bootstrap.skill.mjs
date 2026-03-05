import { getEnvBootstrapper, ENV_TYPES, VITE_TEMPLATES, PYTHON_FRAMEWORKS } from "../lib/env-bootstrapper.mjs";

export const skill = {
  id: "env_bootstrap",
  name: "Environment Bootstrap",
  description:
    "Spin up development environments: Python venv, Conda, Vite, TanStack, Next.js, Node, Docker, Kubernetes, WASM/AssemblyScript, Rust WASM.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: [
          "create",
          "list_jobs",
          "get_job",
          "check_tools",
          "system_info",
          "list_templates",
          "list_conda_envs",
          "export_conda_env",
        ],
        description: "Action to perform",
      },
      type: {
        type: "string",
        enum: [
          "python_venv",
          "conda",
          "node",
          "vite",
          "tanstack",
          "next",
          "docker",
          "kubernetes",
          "wasm",
          "assemblyscript",
          "rust_wasm",
          "docker_compose",
        ],
        description: "Environment type to create (for action=create)",
      },
      name: {
        type: "string",
        description: "Name of the environment or project",
      },
      path: {
        type: "string",
        description: "Target path for the environment (absolute or relative to workspace)",
      },
      // Python venv options
      python: {
        type: "string",
        description: "Python version or executable (e.g. 'python3.11', 'python')",
      },
      packages: {
        type: "array",
        items: { type: "string" },
        description: "List of packages to install",
      },
      requirements: {
        type: "string",
        description: "Path to requirements.txt file",
      },
      upgrade: {
        type: "boolean",
        description: "Upgrade pip before installing (venv only)",
      },
      // Conda options
      channels: {
        type: "array",
        items: { type: "string" },
        description: "Conda channels to use (e.g. ['conda-forge', 'pytorch'])",
      },
      yml: {
        type: "string",
        description: "Path to conda environment.yml file",
      },
      clone: {
        type: "string",
        description: "Name of conda env to clone",
      },
      // Node / Vite / TanStack options
      template: {
        type: "string",
        description: "Vite template (e.g. 'react-ts', 'vue', 'vanilla-ts')",
      },
      framework: {
        type: "string",
        enum: ["vite", "tanstack", "next", "plain"],
        description: "Node framework scaffold",
      },
      typescript: {
        type: "boolean",
        description: "Use TypeScript (default: true)",
      },
      devPackages: {
        type: "array",
        items: { type: "string" },
        description: "Dev-only packages to install",
      },
      git: {
        type: "boolean",
        description: "Initialize a git repository",
      },
      // Docker options
      baseImage: {
        type: "string",
        description: "Docker base image (e.g. 'node:22-alpine', 'python:3.11-slim')",
      },
      port: {
        type: "number",
        description: "Port to expose",
      },
      compose: {
        type: "boolean",
        description: "Generate docker-compose.yml",
      },
      includeRedis: { type: "boolean" },
      includePostgres: { type: "boolean" },
      includeMongo: { type: "boolean" },
      includeRabbitMQ: { type: "boolean" },
      includeNginx: { type: "boolean" },
      // Kubernetes options
      image: {
        type: "string",
        description: "Container image for Kubernetes deployment",
      },
      replicas: {
        type: "number",
        description: "Number of replicas",
      },
      namespace: {
        type: "string",
        description: "Kubernetes namespace",
      },
      includeIngress: { type: "boolean" },
      includeHPA: { type: "boolean" },
      includeConfigMap: { type: "boolean" },
      includeSecret: { type: "boolean" },
      serviceType: {
        type: "string",
        enum: ["ClusterIP", "NodePort", "LoadBalancer"],
      },
      // WASM options
      wasmType: {
        type: "string",
        enum: ["assemblyscript", "rust"],
        description: "WASM project type",
      },
      // Job reference
      jobId: {
        type: "string",
        description: "Job ID (for get_job action)",
      },
      // Conda export
      envName: {
        type: "string",
        description: "Conda env name to export",
      },
      outputPath: {
        type: "string",
        description: "Output path for exported conda env yml",
      },
    },
    required: ["action"],
  },

  async run({ input, workspaceRoot }) {
    const bootstrapper = getEnvBootstrapper(workspaceRoot);
    const action = input.action;

    // -------------------------------------------------------------------------
    // list_templates
    // -------------------------------------------------------------------------
    if (action === "list_templates") {
      return {
        ok: true,
        envTypes: Object.values(ENV_TYPES),
        viteTemplates: VITE_TEMPLATES,
        pythonFrameworks: PYTHON_FRAMEWORKS,
        condaChannels: ["defaults", "conda-forge", "pytorch", "nvidia"],
        nodeFrameworks: ["vite", "tanstack", "next", "plain"],
        wasmTypes: ["assemblyscript", "rust"],
        dockerServices: ["redis", "postgres", "mongo", "rabbitmq", "nginx"],
        k8sOptions: ["ingress", "hpa", "configmap", "secret"],
      };
    }

    // -------------------------------------------------------------------------
    // check_tools
    // -------------------------------------------------------------------------
    if (action === "check_tools") {
      return bootstrapper.checkAvailability();
    }

    // -------------------------------------------------------------------------
    // system_info
    // -------------------------------------------------------------------------
    if (action === "system_info") {
      return bootstrapper.getSystemInfo();
    }

    // -------------------------------------------------------------------------
    // list_jobs
    // -------------------------------------------------------------------------
    if (action === "list_jobs") {
      const jobs = bootstrapper.listJobs().map((j) => ({
        id: j.id,
        type: j.type,
        name: j.name,
        status: j.status,
        startedAt: j.startedAt,
        completedAt: j.completedAt,
        error: j.error || null,
      }));
      return { ok: true, jobs };
    }

    // -------------------------------------------------------------------------
    // get_job
    // -------------------------------------------------------------------------
    if (action === "get_job") {
      if (!input.jobId) {
        return { ok: false, error: "jobId is required for get_job" };
      }
      const job = bootstrapper.getJob(input.jobId);
      if (!job) {
        return { ok: false, error: `Job not found: ${input.jobId}` };
      }
      return { ok: true, job };
    }

    // -------------------------------------------------------------------------
    // list_conda_envs
    // -------------------------------------------------------------------------
    if (action === "list_conda_envs") {
      return bootstrapper.listCondaEnvs();
    }

    // -------------------------------------------------------------------------
    // export_conda_env
    // -------------------------------------------------------------------------
    if (action === "export_conda_env") {
      if (!input.envName) {
        return { ok: false, error: "envName is required for export_conda_env" };
      }
      return bootstrapper.exportCondaEnv(input.envName, input.outputPath);
    }

    // -------------------------------------------------------------------------
    // create
    // -------------------------------------------------------------------------
    if (action === "create") {
      const type = input.type;
      if (!type) {
        return {
          ok: false,
          error: "type is required for create action",
          validTypes: Object.values(ENV_TYPES),
        };
      }

      try {
        let result;

        switch (type) {
          case ENV_TYPES.PYTHON_VENV:
          case "python_venv": {
            result = await bootstrapper.createPythonVenv({
              name: input.name,
              path: input.path,
              python: input.python,
              packages: input.packages || [],
              requirements: input.requirements,
              upgrade: input.upgrade ?? false,
            });
            break;
          }

          case ENV_TYPES.CONDA:
          case "conda": {
            result = await bootstrapper.createCondaEnv({
              name: input.name,
              path: input.path,
              python: input.python || "3.11",
              packages: input.packages || [],
              channels: input.channels || ["conda-forge"],
              yml: input.yml,
              clone: input.clone,
            });
            break;
          }

          case ENV_TYPES.NODE:
          case "node": {
            result = await bootstrapper.createNodeProject({
              name: input.name,
              path: input.path,
              framework: "plain",
              typescript: input.typescript ?? true,
              packages: input.packages || [],
              devPackages: input.devPackages || [],
              git: input.git ?? false,
            });
            break;
          }

          case ENV_TYPES.VITE:
          case "vite": {
            result = await bootstrapper.createNodeProject({
              name: input.name,
              path: input.path,
              framework: "vite",
              template: input.template || "react",
              typescript: input.typescript ?? true,
              packages: input.packages || [],
              devPackages: input.devPackages || [],
              git: input.git ?? false,
            });
            break;
          }

          case ENV_TYPES.TANSTACK:
          case "tanstack": {
            result = await bootstrapper.createNodeProject({
              name: input.name,
              path: input.path,
              framework: "tanstack",
              typescript: input.typescript ?? true,
              packages: input.packages || [],
              devPackages: input.devPackages || [],
              git: input.git ?? false,
            });
            break;
          }

          case ENV_TYPES.NEXT:
          case "next": {
            result = await bootstrapper.createNodeProject({
              name: input.name,
              path: input.path,
              framework: "next",
              typescript: input.typescript ?? true,
              packages: input.packages || [],
              devPackages: input.devPackages || [],
              git: input.git ?? false,
            });
            break;
          }

          case ENV_TYPES.DOCKER:
          case "docker":
          case ENV_TYPES.DOCKER_COMPOSE:
          case "docker_compose": {
            result = await bootstrapper.createDockerProject({
              name: input.name,
              path: input.path,
              baseImage: input.baseImage,
              port: input.port || 3000,
              framework: input.framework || "node",
              compose: input.compose ?? true,
              includeRedis: input.includeRedis ?? false,
              includePostgres: input.includePostgres ?? false,
              includeMongo: input.includeMongo ?? false,
              includeRabbitMQ: input.includeRabbitMQ ?? false,
              includeNginx: input.includeNginx ?? false,
            });
            break;
          }

          case ENV_TYPES.KUBERNETES:
          case "kubernetes": {
            result = await bootstrapper.createKubernetesProject({
              name: input.name,
              path: input.path,
              image: input.image || "my-app:latest",
              port: input.port || 3000,
              replicas: input.replicas || 2,
              namespace: input.namespace || "default",
              includeIngress: input.includeIngress ?? false,
              includeHPA: input.includeHPA ?? false,
              includeConfigMap: input.includeConfigMap ?? false,
              includeSecret: input.includeSecret ?? false,
              serviceType: input.serviceType || "ClusterIP",
            });
            break;
          }

          case ENV_TYPES.WASM:
          case "wasm": {
            result = await bootstrapper.createWasmProject({
              name: input.name,
              path: input.path,
              type: input.wasmType || "assemblyscript",
              packages: input.packages || [],
            });
            break;
          }

          case ENV_TYPES.ASSEMBLYSCRIPT:
          case "assemblyscript": {
            result = await bootstrapper.createAssemblyScriptProject({
              name: input.name,
              path: input.path,
              packages: input.packages || [],
            });
            break;
          }

          case ENV_TYPES.RUST_WASM:
          case "rust_wasm": {
            result = await bootstrapper.createRustWasmProject({
              name: input.name,
              path: input.path,
            });
            break;
          }

          default: {
            return {
              ok: false,
              error: `Unknown environment type: ${type}`,
              validTypes: Object.values(ENV_TYPES),
            };
          }
        }

        return {
          ok: true,
          type,
          result,
          nextSteps: _getNextSteps(type, result),
        };
      } catch (err) {
        return {
          ok: false,
          error: err.message,
          type,
          suggestion: _getSuggestion(err.message),
        };
      }
    }

    return {
      ok: false,
      error: `Unknown action: ${action}`,
      validActions: [
        "create",
        "list_jobs",
        "get_job",
        "check_tools",
        "system_info",
        "list_templates",
        "list_conda_envs",
        "export_conda_env",
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _getNextSteps(type, result) {
  if (!result) return [];

  switch (type) {
    case "python_venv":
      return [
        `Activate: ${result.activateCmd}`,
        result.packages?.length
          ? `Installed: ${result.packages.join(", ")}`
          : "Add packages: pip install <package>",
      ].filter(Boolean);

    case "conda":
      return [
        `Activate: ${result.activateCmd}`,
        `Add packages: conda install -n ${result.name || "env"} <package>`,
        `Export env: conda env export -n ${result.name || "env"} > environment.yml`,
      ];

    case "vite":
    case "tanstack":
    case "next":
    case "node":
      return [
        `cd ${result.path}`,
        result.commands?.dev || "npm run dev",
        result.commands?.build || "npm run build",
      ];

    case "docker":
    case "docker_compose":
      return [
        `cd ${result.path}`,
        "docker-compose build",
        "docker-compose up -d",
        "docker-compose logs -f",
      ];

    case "kubernetes":
      return [
        `cd ${result.path}`,
        "kubectl apply -k .",
        `kubectl get all -n ${result.namespace}`,
        "make logs",
      ];

    case "assemblyscript":
    case "wasm":
      return [
        `cd ${result.path}`,
        "npm run asbuild",
        "npm test",
      ];

    case "rust_wasm":
      return [
        `cd ${result.path}`,
        "wasm-pack build --target web",
        "wasm-pack test --node",
      ];

    default:
      return [];
  }
}

function _getSuggestion(errorMessage) {
  const msg = errorMessage.toLowerCase();

  if (msg.includes("python not found")) {
    return "Install Python from https://python.org or use conda";
  }
  if (msg.includes("conda not found")) {
    return "Install Miniconda from https://docs.conda.io/en/latest/miniconda.html";
  }
  if (msg.includes("npm not found") || msg.includes("node not found")) {
    return "Install Node.js from https://nodejs.org";
  }
  if (msg.includes("docker not found")) {
    return "Install Docker Desktop from https://docker.com";
  }
  if (msg.includes("cargo not found") || msg.includes("rust")) {
    return "Install Rust from https://rustup.rs";
  }
  if (msg.includes("wasm-pack")) {
    return "Install wasm-pack: cargo install wasm-pack";
  }
  if (msg.includes("permission")) {
    return "Try running with elevated permissions or check directory write access";
  }
  if (msg.includes("already exists")) {
    return "Use a different name or path, or delete the existing directory first";
  }
  return "Check the error message and ensure all required tools are installed";
}
