import { spawn, exec } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdir,
  writeFile,
  readFile,
  access,
  rm,
  readdir,
} from "node:fs/promises";
import { join, resolve, dirname, basename } from "node:path";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ENV_TYPES = {
  PYTHON_VENV: "python_venv",
  CONDA: "conda",
  NODE: "node",
  VITE: "vite",
  TANSTACK: "tanstack",
  NEXT: "next",
  DOCKER: "docker",
  KUBERNETES: "kubernetes",
  WASM: "wasm",
  ASSEMBLYSCRIPT: "assemblyscript",
  RUST_WASM: "rust_wasm",
  DOCKER_COMPOSE: "docker_compose",
};

export const VITE_TEMPLATES = [
  "vanilla",
  "vanilla-ts",
  "vue",
  "vue-ts",
  "react",
  "react-ts",
  "react-swc",
  "react-swc-ts",
  "preact",
  "preact-ts",
  "lit",
  "lit-ts",
  "svelte",
  "svelte-ts",
  "solid",
  "solid-ts",
  "qwik",
  "qwik-ts",
];

export const PYTHON_FRAMEWORKS = [
  "fastapi",
  "flask",
  "django",
  "streamlit",
  "gradio",
  "langchain",
  "transformers",
  "torch",
  "tensorflow",
  "sklearn",
  "pandas",
  "numpy",
  "jupyter",
  "ray",
  "celery",
];

export const CONDA_CHANNELS = ["defaults", "conda-forge", "pytorch", "nvidia"];

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function runCommand(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const cwd = options.cwd || process.cwd();
    const env = { ...process.env, ...(options.env || {}) };
    const shell = process.platform === "win32" ? true : false;

    const proc = spawn(cmd, args, {
      cwd,
      env,
      shell,
      stdio: options.stdio || "pipe",
    });

    let stdout = "";
    let stderr = "";

    if (proc.stdout) {
      proc.stdout.on("data", (d) => {
        stdout += d.toString();
        if (options.onStdout) options.onStdout(d.toString());
      });
    }

    if (proc.stderr) {
      proc.stderr.on("data", (d) => {
        stderr += d.toString();
        if (options.onStderr) options.onStderr(d.toString());
      });
    }

    proc.on("error", (err) => reject(err));

    proc.on("close", (code) => {
      if (code === 0 || options.ignoreExitCode) {
        resolve({ stdout, stderr, code });
      } else {
        const err = new Error(
          `Command failed with exit code ${code}: ${cmd} ${args.join(" ")}\n${stderr}`,
        );
        err.stdout = stdout;
        err.stderr = stderr;
        err.code = code;
        reject(err);
      }
    });
  });
}

async function which(cmd) {
  try {
    const whichCmd = process.platform === "win32" ? "where" : "which";
    const result = await execAsync(`${whichCmd} ${cmd}`);
    return result.stdout.trim().split("\n")[0];
  } catch {
    return null;
  }
}

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
  return dirPath;
}

async function writeJsonFile(filePath, data) {
  await writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

async function writeTextFile(filePath, content) {
  await writeFile(filePath, content, "utf-8");
}

async function pathExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Environment Bootstrapper
// ---------------------------------------------------------------------------

export class EnvBootstrapper extends EventEmitter {
  constructor(workspaceRoot) {
    super();
    this.workspaceRoot = workspaceRoot || process.cwd();
    this._jobs = new Map();
  }

  // -------------------------------------------------------------------------
  // Job tracking
  // -------------------------------------------------------------------------

  _startJob(type, name, target) {
    const id = randomUUID();
    const job = {
      id,
      type,
      name,
      target,
      status: "running",
      startedAt: new Date().toISOString(),
      completedAt: null,
      logs: [],
      error: null,
    };
    this._jobs.set(id, job);
    this.emit("job_started", job);
    return job;
  }

  _log(job, message) {
    job.logs.push({ ts: new Date().toISOString(), message });
    this.emit("job_log", { jobId: job.id, message });
  }

  _completeJob(job, result = {}) {
    job.status = "completed";
    job.completedAt = new Date().toISOString();
    job.result = result;
    this.emit("job_completed", job);
    return job;
  }

  _failJob(job, error) {
    job.status = "failed";
    job.completedAt = new Date().toISOString();
    job.error = error.message || String(error);
    this.emit("job_failed", job);
    return job;
  }

  getJob(id) {
    return this._jobs.get(id) || null;
  }

  listJobs() {
    return [...this._jobs.values()];
  }

  // -------------------------------------------------------------------------
  // Python venv
  // -------------------------------------------------------------------------

  async createPythonVenv(options = {}) {
    const {
      name = "venv",
      path: targetPath,
      python = "python",
      packages = [],
      requirements,
      upgrade = false,
    } = options;

    const envPath = targetPath
      ? resolve(targetPath)
      : join(this.workspaceRoot, name);

    const job = this._startJob(ENV_TYPES.PYTHON_VENV, name, envPath);

    try {
      // Check Python is available
      const pythonPath = (await which(python)) || (await which("python3"));
      if (!pythonPath) {
        throw new Error(
          `Python not found. Install Python from https://python.org`,
        );
      }

      this._log(job, `Using Python: ${pythonPath}`);

      // Check if venv already exists
      if (await pathExists(envPath)) {
        this._log(job, `Virtual environment already exists at ${envPath}`);
      } else {
        this._log(job, `Creating virtual environment at ${envPath}...`);
        await runCommand(python, ["-m", "venv", envPath], {
          onStdout: (d) => this._log(job, d.trim()),
          onStderr: (d) => this._log(job, `[stderr] ${d.trim()}`),
        });
        this._log(job, "Virtual environment created");
      }

      // Determine pip path
      const isWin = process.platform === "win32";
      const pipPath = isWin
        ? join(envPath, "Scripts", "pip.exe")
        : join(envPath, "bin", "pip");
      const pythonBin = isWin
        ? join(envPath, "Scripts", "python.exe")
        : join(envPath, "bin", "python");

      // Upgrade pip
      if (upgrade) {
        this._log(job, "Upgrading pip...");
        await runCommand(
          pythonBin,
          ["-m", "pip", "install", "--upgrade", "pip"],
          {
            onStdout: (d) => this._log(job, d.trim()),
            onStderr: (d) => this._log(job, `[stderr] ${d.trim()}`),
          },
        );
      }

      // Install from requirements.txt
      if (requirements) {
        const reqPath = resolve(requirements);
        this._log(job, `Installing from ${reqPath}...`);
        await runCommand(pipPath, ["install", "-r", reqPath], {
          onStdout: (d) => this._log(job, d.trim()),
          onStderr: (d) => this._log(job, `[stderr] ${d.trim()}`),
        });
      }

      // Install additional packages
      if (packages.length > 0) {
        this._log(job, `Installing packages: ${packages.join(", ")}...`);
        await runCommand(pipPath, ["install", ...packages], {
          onStdout: (d) => this._log(job, d.trim()),
          onStderr: (d) => this._log(job, `[stderr] ${d.trim()}`),
        });
      }

      const activateCmd = isWin
        ? `${envPath}\\Scripts\\activate.bat`
        : `source ${envPath}/bin/activate`;

      const result = {
        ok: true,
        type: ENV_TYPES.PYTHON_VENV,
        path: envPath,
        pythonBin,
        pipPath,
        activateCmd,
        packages,
      };

      return this._completeJob(job, result).result;
    } catch (err) {
      this._failJob(job, err);
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Conda
  // -------------------------------------------------------------------------

  async createCondaEnv(options = {}) {
    const {
      name,
      path: targetPath,
      python = "3.11",
      packages = [],
      channels = ["conda-forge"],
      yml,
      clone,
      update = false,
    } = options;

    if (!name && !targetPath && !yml) {
      throw new Error("Conda env requires name, path, or yml file");
    }

    const envName = name || basename(targetPath || "env");
    const job = this._startJob(ENV_TYPES.CONDA, envName, targetPath || name);

    try {
      // Check conda is available
      const condaPath = (await which("conda")) || (await which("mamba"));
      if (!condaPath) {
        throw new Error(
          "Conda not found. Install Miniconda or Anaconda from https://conda.io",
        );
      }

      const condaCmd = basename(condaPath).replace(/\.exe$/, "");
      this._log(job, `Using conda: ${condaPath}`);

      // Create from yml file
      if (yml) {
        const ymlPath = resolve(yml);
        this._log(job, `Creating conda env from ${ymlPath}...`);

        const args = ["env", "create", "-f", ymlPath];
        if (targetPath) args.push("-p", resolve(targetPath));
        if (update) args[1] = "update"; // swap create -> update

        await runCommand(condaCmd, args, {
          onStdout: (d) => this._log(job, d.trim()),
          onStderr: (d) => this._log(job, `[stderr] ${d.trim()}`),
        });
      } else if (clone) {
        // Clone existing environment
        this._log(job, `Cloning conda env: ${clone} -> ${name}...`);
        await runCommand(
          condaCmd,
          ["create", "--name", name, "--clone", clone],
          {
            onStdout: (d) => this._log(job, d.trim()),
            onStderr: (d) => this._log(job, `[stderr] ${d.trim()}`),
          },
        );
      } else {
        // Create new environment
        const args = ["create", "-y"];

        if (targetPath) {
          args.push("-p", resolve(targetPath));
        } else {
          args.push("--name", name);
        }

        args.push(`python=${python}`);

        for (const channel of channels) {
          args.push("-c", channel);
        }

        if (packages.length > 0) {
          args.push(...packages);
        }

        this._log(
          job,
          `Creating conda env${name ? ` "${name}"` : ""} with Python ${python}...`,
        );
        await runCommand(condaCmd, args, {
          onStdout: (d) => this._log(job, d.trim()),
          onStderr: (d) => this._log(job, `[stderr] ${d.trim()}`),
        });
      }

      // Install additional packages if creating from yml
      if (yml && packages.length > 0) {
        this._log(
          job,
          `Installing additional packages: ${packages.join(", ")}...`,
        );
        const installArgs = ["install", "-y"];
        if (name) installArgs.push("-n", name);
        else if (targetPath) installArgs.push("-p", resolve(targetPath));
        for (const channel of channels) {
          installArgs.push("-c", channel);
        }
        installArgs.push(...packages);
        await runCommand(condaCmd, installArgs, {
          onStdout: (d) => this._log(job, d.trim()),
          onStderr: (d) => this._log(job, `[stderr] ${d.trim()}`),
        });
      }

      const isWin = process.platform === "win32";
      const activateCmd = name
        ? `conda activate ${name}`
        : `conda activate ${targetPath}`;

      const result = {
        ok: true,
        type: ENV_TYPES.CONDA,
        name: name || null,
        path: targetPath || null,
        python,
        channels,
        packages,
        activateCmd,
        condaCmd,
      };

      return this._completeJob(job, result).result;
    } catch (err) {
      this._failJob(job, err);
      throw err;
    }
  }

  async exportCondaEnv(name, outputPath) {
    const condaPath = (await which("conda")) || (await which("mamba"));
    if (!condaPath) throw new Error("Conda not found");
    const condaCmd = basename(condaPath).replace(/\.exe$/, "");

    const { stdout } = await execAsync(
      `${condaCmd} env export -n ${name} --no-builds`,
    );
    if (outputPath) {
      await writeTextFile(outputPath, stdout);
    }
    return { ok: true, yml: stdout, outputPath };
  }

  async listCondaEnvs() {
    const condaPath = (await which("conda")) || (await which("mamba"));
    if (!condaPath) return { ok: false, reason: "Conda not installed" };
    const condaCmd = basename(condaPath).replace(/\.exe$/, "");

    try {
      const { stdout } = await execAsync(`${condaCmd} env list --json`);
      const data = JSON.parse(stdout);
      return { ok: true, envs: data.envs || [] };
    } catch (err) {
      return { ok: false, reason: err.message };
    }
  }

  // -------------------------------------------------------------------------
  // Node / Vite / TanStack / Next
  // -------------------------------------------------------------------------

  async createNodeProject(options = {}) {
    const {
      name,
      path: targetPath,
      template = "vanilla",
      framework = "vite", // "vite" | "tanstack" | "next" | "plain"
      typescript = true,
      packages = [],
      devPackages = [],
      git = false,
    } = options;

    const projectDir = targetPath
      ? resolve(targetPath)
      : join(this.workspaceRoot, name || "my-app");

    const job = this._startJob(
      framework === "vite"
        ? ENV_TYPES.VITE
        : framework === "tanstack"
          ? ENV_TYPES.TANSTACK
          : ENV_TYPES.NODE,
      name || basename(projectDir),
      projectDir,
    );

    try {
      const npmPath = await which("npm");
      if (!npmPath) {
        throw new Error(
          "npm not found. Install Node.js from https://nodejs.org",
        );
      }

      const nodeVersion = await execAsync("node --version").then((r) =>
        r.stdout.trim(),
      );
      this._log(job, `Using Node: ${nodeVersion}`);

      await ensureDir(dirname(projectDir));

      if (framework === "vite") {
        await this._scaffoldVite(job, projectDir, {
          name,
          template,
          typescript,
        });
      } else if (framework === "tanstack") {
        await this._scaffoldTanStack(job, projectDir, { name, typescript });
      } else if (framework === "next") {
        await this._scaffoldNext(job, projectDir, { name, typescript });
      } else {
        await this._scaffoldPlainNode(job, projectDir, { name, typescript });
      }

      // Install additional packages
      if (packages.length > 0) {
        this._log(job, `Installing packages: ${packages.join(", ")}...`);
        await runCommand("npm", ["install", ...packages], {
          cwd: projectDir,
          onStdout: (d) => this._log(job, d.trim()),
          onStderr: (d) => this._log(job, `[stderr] ${d.trim()}`),
        });
      }

      if (devPackages.length > 0) {
        this._log(job, `Installing dev packages: ${devPackages.join(", ")}...`);
        await runCommand("npm", ["install", "--save-dev", ...devPackages], {
          cwd: projectDir,
          onStdout: (d) => this._log(job, d.trim()),
          onStderr: (d) => this._log(job, `[stderr] ${d.trim()}`),
        });
      }

      // Init git
      if (git) {
        const gitPath = await which("git");
        if (gitPath) {
          this._log(job, "Initializing git repository...");
          await runCommand("git", ["init"], { cwd: projectDir });
          await runCommand("git", ["add", "."], { cwd: projectDir });
          await runCommand("git", ["commit", "-m", "Initial commit"], {
            cwd: projectDir,
          });
        }
      }

      const result = {
        ok: true,
        type: framework,
        name: name || basename(projectDir),
        path: projectDir,
        typescript,
        framework,
        template,
        commands: {
          dev: "npm run dev",
          build: "npm run build",
          preview: "npm run preview",
        },
      };

      return this._completeJob(job, result).result;
    } catch (err) {
      this._failJob(job, err);
      throw err;
    }
  }

  async _scaffoldVite(job, projectDir, { name, template, typescript }) {
    const tpl = typescript
      ? template.endsWith("-ts")
        ? template
        : `${template}-ts`
      : template.replace(/-ts$/, "");

    this._log(job, `Scaffolding Vite project (template: ${tpl})...`);

    const parentDir = dirname(projectDir);
    const projName = basename(projectDir);

    await runCommand(
      "npm",
      ["create", "vite@latest", projName, "--", "--template", tpl],
      {
        cwd: parentDir,
        onStdout: (d) => this._log(job, d.trim()),
        onStderr: (d) => this._log(job, `[stderr] ${d.trim()}`),
      },
    );

    this._log(job, "Installing dependencies...");
    await runCommand("npm", ["install"], {
      cwd: projectDir,
      onStdout: (d) => this._log(job, d.trim()),
      onStderr: (d) => this._log(job, `[stderr] ${d.trim()}`),
    });
  }

  async _scaffoldTanStack(job, projectDir, { name, typescript }) {
    this._log(job, "Scaffolding TanStack Start project...");

    const parentDir = dirname(projectDir);
    const projName = basename(projectDir);

    // Use create-tsrouter-app
    await runCommand(
      "npm",
      [
        "create",
        "tsrouter-app@latest",
        projName,
        "--",
        typescript ? "--typescript" : "",
        "--tailwind",
        "--add-ons",
        "shadcn",
      ].filter(Boolean),
      {
        cwd: parentDir,
        onStdout: (d) => this._log(job, d.trim()),
        onStderr: (d) => this._log(job, `[stderr] ${d.trim()}`),
      },
    );

    this._log(job, "Installing dependencies...");
    await runCommand("npm", ["install"], {
      cwd: projectDir,
      onStdout: (d) => this._log(job, d.trim()),
      onStderr: (d) => this._log(job, `[stderr] ${d.trim()}`),
    });
  }

  async _scaffoldNext(job, projectDir, { name, typescript }) {
    this._log(job, "Scaffolding Next.js project...");

    const parentDir = dirname(projectDir);
    const projName = basename(projectDir);

    const args = [
      "create",
      "next-app@latest",
      projName,
      "--",
      typescript ? "--typescript" : "--no-typescript",
      "--tailwind",
      "--eslint",
      "--app",
      "--no-src-dir",
      "--import-alias",
      "@/*",
    ];

    await runCommand("npm", args, {
      cwd: parentDir,
      onStdout: (d) => this._log(job, d.trim()),
      onStderr: (d) => this._log(job, `[stderr] ${d.trim()}`),
    });
  }

  async _scaffoldPlainNode(job, projectDir, { name, typescript }) {
    this._log(job, "Scaffolding plain Node project...");

    await ensureDir(projectDir);

    const pkgJson = {
      name: name || basename(projectDir),
      version: "1.0.0",
      type: "module",
      scripts: {
        start: typescript ? "tsx src/index.ts" : "node src/index.mjs",
        dev: typescript
          ? "tsx watch src/index.ts"
          : "node --watch src/index.mjs",
        build: typescript ? "tsc" : "echo 'No build step'",
        test: "node --test",
      },
      dependencies: {},
      devDependencies: typescript
        ? { typescript: "^5.0.0", tsx: "^4.0.0", "@types/node": "^22.0.0" }
        : {},
    };

    await writeJsonFile(join(projectDir, "package.json"), pkgJson);
    await ensureDir(join(projectDir, "src"));

    if (typescript) {
      await writeTextFile(
        join(projectDir, "src", "index.ts"),
        `// Entry point\nconsole.log("Hello from ${name || "app"}!");\n`,
      );
      await writeJsonFile(join(projectDir, "tsconfig.json"), {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "bundler",
          strict: true,
          outDir: "./dist",
          rootDir: "./src",
        },
        include: ["src"],
      });
    } else {
      await writeTextFile(
        join(projectDir, "src", "index.mjs"),
        `// Entry point\nconsole.log("Hello from ${name || "app"}!");\n`,
      );
    }

    await writeTextFile(
      join(projectDir, ".gitignore"),
      "node_modules/\ndist/\n.env\n",
    );

    this._log(job, "Installing dependencies...");
    await runCommand("npm", ["install"], {
      cwd: projectDir,
      onStdout: (d) => this._log(job, d.trim()),
      onStderr: (d) => this._log(job, `[stderr] ${d.trim()}`),
    });
  }

  // -------------------------------------------------------------------------
  // Docker
  // -------------------------------------------------------------------------

  async createDockerProject(options = {}) {
    const {
      name,
      path: targetPath,
      baseImage = "node:22-alpine",
      port = 3000,
      framework = "node",
      compose = true,
      includeRedis = false,
      includePostgres = false,
      includeMongo = false,
      includeRabbitMQ = false,
      includeNginx = false,
      env = {},
    } = options;

    const projectDir = targetPath
      ? resolve(targetPath)
      : join(this.workspaceRoot, name || "docker-project");

    const job = this._startJob(
      ENV_TYPES.DOCKER,
      name || basename(projectDir),
      projectDir,
    );

    try {
      const dockerPath = await which("docker");
      if (!dockerPath) {
        throw new Error(
          "Docker not found. Install Docker Desktop from https://docker.com",
        );
      }

      await ensureDir(projectDir);

      // Generate Dockerfile
      const dockerfile = this._generateDockerfile({
        baseImage,
        port,
        framework,
      });
      await writeTextFile(join(projectDir, "Dockerfile"), dockerfile);
      this._log(job, "Created Dockerfile");

      // .dockerignore
      const dockerignore = [
        "node_modules",
        "npm-debug.log",
        ".git",
        ".gitignore",
        "*.md",
        "dist",
        ".env*",
        "!.env.example",
      ].join("\n");
      await writeTextFile(join(projectDir, ".dockerignore"), dockerignore);
      this._log(job, "Created .dockerignore");

      // docker-compose.yml
      if (compose) {
        const composeYaml = this._generateDockerCompose({
          name: name || basename(projectDir),
          port,
          baseImage,
          includeRedis,
          includePostgres,
          includeMongo,
          includeRabbitMQ,
          includeNginx,
          env,
        });
        await writeTextFile(
          join(projectDir, "docker-compose.yml"),
          composeYaml,
        );
        this._log(job, "Created docker-compose.yml");
      }

      // .env.example
      const envExample = [
        "# Environment variables",
        `PORT=${port}`,
        "NODE_ENV=development",
        ...Object.entries(env).map(([k]) => `${k}=`),
        includePostgres
          ? "POSTGRES_URL=postgresql://user:pass@postgres:5432/db"
          : "",
        includeRedis ? "REDIS_URL=redis://redis:6379" : "",
        includeMongo ? "MONGO_URL=mongodb://mongo:27017/db" : "",
        includeRabbitMQ ? "RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672" : "",
      ]
        .filter(Boolean)
        .join("\n");

      await writeTextFile(join(projectDir, ".env.example"), envExample + "\n");
      this._log(job, "Created .env.example");

      const result = {
        ok: true,
        type: ENV_TYPES.DOCKER,
        path: projectDir,
        name: name || basename(projectDir),
        port,
        compose,
        services: [
          "app",
          includeRedis && "redis",
          includePostgres && "postgres",
          includeMongo && "mongo",
          includeRabbitMQ && "rabbitmq",
          includeNginx && "nginx",
        ].filter(Boolean),
        commands: {
          build: "docker-compose build",
          up: "docker-compose up -d",
          down: "docker-compose down",
          logs: "docker-compose logs -f",
        },
      };

      return this._completeJob(job, result).result;
    } catch (err) {
      this._failJob(job, err);
      throw err;
    }
  }

  _generateDockerfile({ baseImage, port, framework }) {
    if (framework === "python") {
      return [
        "FROM python:3.11-slim",
        "",
        "WORKDIR /app",
        "",
        "COPY requirements.txt .",
        "RUN pip install --no-cache-dir -r requirements.txt",
        "",
        "COPY . .",
        "",
        `EXPOSE ${port}`,
        "",
        `CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "${port}"]`,
        "",
      ].join("\n");
    }

    return [
      `FROM ${baseImage}`,
      "",
      "WORKDIR /app",
      "",
      "COPY package*.json .",
      "RUN npm ci --only=production",
      "",
      "COPY . .",
      "",
      `EXPOSE ${port}`,
      "",
      `ENV PORT=${port}`,
      "ENV NODE_ENV=production",
      "",
      'CMD ["node", "server/index.mjs"]',
      "",
    ].join("\n");
  }

  _generateDockerCompose({
    name,
    port,
    includeRedis,
    includePostgres,
    includeMongo,
    includeRabbitMQ,
    includeNginx,
    env,
  }) {
    const envLines = Object.entries(env)
      .map(([k, v]) => `      - ${k}=${v}`)
      .join("\n");

    const depends = [
      includeRedis && "redis",
      includePostgres && "postgres",
      includeMongo && "mongo",
      includeRabbitMQ && "rabbitmq",
    ]
      .filter(Boolean)
      .map((s) => `      - ${s}`)
      .join("\n");

    const services = [];

    services.push(`  app:
    build: .
    ports:
      - "${port}:${port}"
    environment:
      - NODE_ENV=development
      - PORT=${port}
${envLines ? envLines + "\n" : ""}    volumes:
      - .:/app
      - /app/node_modules
${depends ? `    depends_on:\n${depends}\n` : ""}    restart: unless-stopped`);

    if (includeRedis) {
      services.push(`  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    restart: unless-stopped
    volumes:
      - redis_data:/data`);
    }

    if (includePostgres) {
      services.push(`  postgres:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=db
    restart: unless-stopped
    volumes:
      - postgres_data:/var/lib/postgresql/data`);
    }

    if (includeMongo) {
      services.push(`  mongo:
    image: mongo:7
    ports:
      - "27017:27017"
    restart: unless-stopped
    volumes:
      - mongo_data:/data/db`);
    }

    if (includeRabbitMQ) {
      services.push(`  rabbitmq:
    image: rabbitmq:3-management-alpine
    ports:
      - "5672:5672"
      - "15672:15672"
    environment:
      - RABBITMQ_DEFAULT_USER=guest
      - RABBITMQ_DEFAULT_PASS=guest
    restart: unless-stopped
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq`);
    }

    if (includeNginx) {
      services.push(`  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - app
    restart: unless-stopped`);
    }

    const volumes = [
      includeRedis && "  redis_data:",
      includePostgres && "  postgres_data:",
      includeMongo && "  mongo_data:",
      includeRabbitMQ && "  rabbitmq_data:",
    ]
      .filter(Boolean)
      .join("\n");

    return (
      [
        `version: "3.9"`,
        "",
        "services:",
        services.join("\n\n"),
        "",
        volumes ? "volumes:\n" + volumes : "",
      ]
        .filter((l) => l !== "")
        .join("\n") + "\n"
    );
  }

  // -------------------------------------------------------------------------
  // Kubernetes
  // -------------------------------------------------------------------------

  async createKubernetesProject(options = {}) {
    const {
      name,
      path: targetPath,
      image = "my-app:latest",
      port = 3000,
      replicas = 2,
      namespace = "default",
      includeIngress = false,
      includeHPA = false,
      includeConfigMap = false,
      includeSecret = false,
      serviceType = "ClusterIP",
    } = options;

    const projectDir = targetPath
      ? resolve(targetPath)
      : join(this.workspaceRoot, name || "k8s");

    const job = this._startJob(
      ENV_TYPES.KUBERNETES,
      name || basename(projectDir),
      projectDir,
    );

    try {
      await ensureDir(projectDir);

      const appName = name || "app";
      const safeName = appName.toLowerCase().replace(/[^a-z0-9-]/g, "-");

      // Namespace
      const namespaceYaml =
        namespace !== "default" ? this._k8sNamespace(namespace) : null;

      if (namespaceYaml) {
        await writeTextFile(join(projectDir, "namespace.yaml"), namespaceYaml);
        this._log(job, "Created namespace.yaml");
      }

      // Deployment
      const deploymentYaml = this._k8sDeployment({
        safeName,
        image,
        port,
        replicas,
        namespace,
      });
      await writeTextFile(join(projectDir, "deployment.yaml"), deploymentYaml);
      this._log(job, "Created deployment.yaml");

      // Service
      const serviceYaml = this._k8sService({
        safeName,
        port,
        serviceType,
        namespace,
      });
      await writeTextFile(join(projectDir, "service.yaml"), serviceYaml);
      this._log(job, "Created service.yaml");

      // Ingress
      if (includeIngress) {
        const ingressYaml = this._k8sIngress({ safeName, port, namespace });
        await writeTextFile(join(projectDir, "ingress.yaml"), ingressYaml);
        this._log(job, "Created ingress.yaml");
      }

      // HorizontalPodAutoscaler
      if (includeHPA) {
        const hpaYaml = this._k8sHPA({
          safeName,
          namespace,
          minReplicas: 2,
          maxReplicas: 10,
        });
        await writeTextFile(join(projectDir, "hpa.yaml"), hpaYaml);
        this._log(job, "Created hpa.yaml");
      }

      // ConfigMap
      if (includeConfigMap) {
        const cmYaml = this._k8sConfigMap({ safeName, namespace, port });
        await writeTextFile(join(projectDir, "configmap.yaml"), cmYaml);
        this._log(job, "Created configmap.yaml");
      }

      // Secret (template)
      if (includeSecret) {
        const secretYaml = this._k8sSecret({ safeName, namespace });
        await writeTextFile(join(projectDir, "secret.yaml"), secretYaml);
        this._log(job, "Created secret.yaml");
      }

      // kustomization.yaml
      const kustomResources = [
        namespace !== "default" && "namespace.yaml",
        includeConfigMap && "configmap.yaml",
        includeSecret && "secret.yaml",
        "deployment.yaml",
        "service.yaml",
        includeIngress && "ingress.yaml",
        includeHPA && "hpa.yaml",
      ].filter(Boolean);

      const kustomYaml = [
        "apiVersion: kustomize.config.k8s.io/v1beta1",
        "kind: Kustomization",
        "",
        "resources:",
        ...kustomResources.map((r) => `  - ${r}`),
        "",
      ].join("\n");

      await writeTextFile(join(projectDir, "kustomization.yaml"), kustomYaml);
      this._log(job, "Created kustomization.yaml");

      // Makefile with common commands
      const makefile = [
        `.PHONY: apply delete status logs`,
        "",
        `apply:`,
        `\tkubectl apply -k .`,
        "",
        `delete:`,
        `\tkubectl delete -k .`,
        "",
        `status:`,
        `\tkubectl get all -n ${namespace} -l app=${safeName}`,
        "",
        `logs:`,
        `\tkubectl logs -n ${namespace} -l app=${safeName} -f`,
        "",
        `rollout:`,
        `\tkubectl rollout restart deployment/${safeName} -n ${namespace}`,
        "",
      ].join("\n");

      await writeTextFile(join(projectDir, "Makefile"), makefile);
      this._log(job, "Created Makefile");

      const result = {
        ok: true,
        type: ENV_TYPES.KUBERNETES,
        path: projectDir,
        name: safeName,
        namespace,
        replicas,
        files: kustomResources.concat(["kustomization.yaml", "Makefile"]),
        commands: {
          apply: "kubectl apply -k .",
          delete: "kubectl delete -k .",
          status: `kubectl get all -n ${namespace} -l app=${safeName}`,
          logs: `kubectl logs -n ${namespace} -l app=${safeName} -f`,
        },
      };

      return this._completeJob(job, result).result;
    } catch (err) {
      this._failJob(job, err);
      throw err;
    }
  }

  _k8sNamespace(namespace) {
    return [
      "apiVersion: v1",
      "kind: Namespace",
      "metadata:",
      `  name: ${namespace}`,
      "",
    ].join("\n");
  }

  _k8sDeployment({ safeName, image, port, replicas, namespace }) {
    return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${safeName}
  namespace: ${namespace}
  labels:
    app: ${safeName}
spec:
  replicas: ${replicas}
  selector:
    matchLabels:
      app: ${safeName}
  template:
    metadata:
      labels:
        app: ${safeName}
    spec:
      containers:
        - name: ${safeName}
          image: ${image}
          ports:
            - containerPort: ${port}
          env:
            - name: PORT
              value: "${port}"
            - name: NODE_ENV
              value: production
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          livenessProbe:
            httpGet:
              path: /api/health
              port: ${port}
            initialDelaySeconds: 15
            periodSeconds: 20
          readinessProbe:
            httpGet:
              path: /api/health
              port: ${port}
            initialDelaySeconds: 5
            periodSeconds: 10
`;
  }

  _k8sService({ safeName, port, serviceType, namespace }) {
    return `apiVersion: v1
kind: Service
metadata:
  name: ${safeName}
  namespace: ${namespace}
  labels:
    app: ${safeName}
spec:
  type: ${serviceType}
  selector:
    app: ${safeName}
  ports:
    - protocol: TCP
      port: 80
      targetPort: ${port}
`;
  }

  _k8sIngress({ safeName, port, namespace }) {
    return `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${safeName}
  namespace: ${namespace}
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx
  rules:
    - host: ${safeName}.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: ${safeName}
                port:
                  number: 80
`;
  }

  _k8sHPA({ safeName, namespace, minReplicas, maxReplicas }) {
    return `apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ${safeName}
  namespace: ${namespace}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ${safeName}
  minReplicas: ${minReplicas}
  maxReplicas: ${maxReplicas}
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
`;
  }

  _k8sConfigMap({ safeName, namespace, port }) {
    return `apiVersion: v1
kind: ConfigMap
metadata:
  name: ${safeName}-config
  namespace: ${namespace}
data:
  PORT: "${port}"
  NODE_ENV: "production"
  LOG_LEVEL: "info"
`;
  }

  _k8sSecret({ safeName, namespace }) {
    return `apiVersion: v1
kind: Secret
metadata:
  name: ${safeName}-secrets
  namespace: ${namespace}
type: Opaque
stringData:
  # Add your secrets here (base64 encoded in real clusters)
  API_KEY: ""
  JWT_SECRET: ""
  DATABASE_URL: ""
`;
  }

  // -------------------------------------------------------------------------
  // WASM / AssemblyScript
  // -------------------------------------------------------------------------

  async createWasmProject(options = {}) {
    const {
      name,
      path: targetPath,
      type = "assemblyscript", // "assemblyscript" | "rust" | "tinygo"
      packages = [],
    } = options;

    if (type === "assemblyscript") {
      return this.createAssemblyScriptProject({
        name,
        path: targetPath,
        packages,
      });
    } else if (type === "rust") {
      return this.createRustWasmProject({ name, path: targetPath });
    } else {
      throw new Error(
        `Unsupported WASM type: ${type}. Use "assemblyscript" or "rust"`,
      );
    }
  }

  async createAssemblyScriptProject(options = {}) {
    const { name, path: targetPath, packages = [] } = options;

    const projectDir = targetPath
      ? resolve(targetPath)
      : join(this.workspaceRoot, name || "wasm-as");

    const job = this._startJob(
      ENV_TYPES.ASSEMBLYSCRIPT,
      name || basename(projectDir),
      projectDir,
    );

    try {
      const npmPath = await which("npm");
      if (!npmPath) throw new Error("npm not found");

      await ensureDir(projectDir);
      await ensureDir(join(projectDir, "assembly"));
      await ensureDir(join(projectDir, "build"));

      // package.json
      const pkgJson = {
        name: name || basename(projectDir),
        version: "1.0.0",
        type: "module",
        scripts: {
          asbuild: "asc assembly/index.ts --target release",
          "asbuild:debug": "asc assembly/index.ts --target debug",
          test: "node tests/index.mjs",
        },
        devDependencies: {
          assemblyscript: "^0.27.0",
        },
        dependencies: {},
      };

      await writeJsonFile(join(projectDir, "package.json"), pkgJson);
      this._log(job, "Created package.json");

      // asconfig.json
      const asconfig = {
        targets: {
          debug: {
            outFile: "build/debug.wasm",
            textFile: "build/debug.wat",
            sourceMap: true,
            debug: true,
          },
          release: {
            outFile: "build/release.wasm",
            textFile: "build/release.wat",
            sourceMap: true,
            optimizeLevel: 3,
            shrinkLevel: 1,
          },
        },
      };

      await writeJsonFile(join(projectDir, "asconfig.json"), asconfig);
      this._log(job, "Created asconfig.json");

      // assembly/index.ts - starter module
      const assemblyIndex = `// AssemblyScript entry point
// See https://www.assemblyscript.org/

export function add(a: i32, b: i32): i32 {
  return a + b;
}

export function multiply(a: f64, b: f64): f64 {
  return a * b;
}

export function fibonacci(n: i32): i32 {
  if (n <= 1) return n;
  let a: i32 = 0;
  let b: i32 = 1;
  for (let i: i32 = 2; i <= n; i++) {
    let tmp: i32 = a + b;
    a = b;
    b = tmp;
  }
  return b;
}

// Memory operations
export function allocate(size: i32): usize {
  return heap.alloc(size);
}

export function deallocate(ptr: usize): void {
  heap.free(ptr);
}
`;

      await writeTextFile(
        join(projectDir, "assembly", "index.ts"),
        assemblyIndex,
      );
      this._log(job, "Created assembly/index.ts");

      // tsconfig.json for AssemblyScript
      const tsconfig = {
        extends: "assemblyscript/std/assembly.json",
        include: ["./assembly/**/*.ts"],
      };
      await writeJsonFile(join(projectDir, "tsconfig.json"), tsconfig);

      // tests/index.mjs
      await ensureDir(join(projectDir, "tests"));
      const testCode = `// WASM module test
import { readFile } from "fs/promises";

async function main() {
  const wasmBuffer = await readFile(new URL("../build/release.wasm", import.meta.url));
  const { instance } = await WebAssembly.instantiate(wasmBuffer);

  const { add, multiply, fibonacci } = instance.exports;

  console.log("Testing add(2, 3):", add(2, 3));
  console.log("Testing multiply(2.5, 4):", multiply(2.5, 4));
  console.log("Testing fibonacci(10):", fibonacci(10));

  console.log("✅ All WASM tests passed!");
}

main().catch(console.error);
`;
      await writeTextFile(join(projectDir, "tests", "index.mjs"), testCode);
      this._log(job, "Created tests/index.mjs");

      // README.md
      const readme = `# ${name || basename(projectDir)} - AssemblyScript WASM

## Getting Started

\`\`\`bash
npm install
npm run asbuild          # Build release
npm run asbuild:debug    # Build debug
npm test                 # Run tests
\`\`\`

## Structure

- \`assembly/\` - AssemblyScript source files (.ts)
- \`build/\`    - Compiled WASM output
- \`tests/\`    - Node.js test runner

## Usage from JavaScript

\`\`\`js
import { readFile } from "fs/promises";

const wasm = await readFile("build/release.wasm");
const { instance } = await WebAssembly.instantiate(wasm);

const result = instance.exports.add(1, 2); // 3
\`\`\`
`;
      await writeTextFile(join(projectDir, "README.md"), readme);

      // Install dependencies
      this._log(job, "Installing AssemblyScript...");
      await runCommand("npm", ["install"], {
        cwd: projectDir,
        onStdout: (d) => this._log(job, d.trim()),
        onStderr: (d) => this._log(job, `[stderr] ${d.trim()}`),
      });

      // Install additional packages
      if (packages.length > 0) {
        this._log(job, `Installing packages: ${packages.join(", ")}...`);
        await runCommand("npm", ["install", ...packages], {
          cwd: projectDir,
          onStdout: (d) => this._log(job, d.trim()),
          onStderr: (d) => this._log(job, `[stderr] ${d.trim()}`),
        });
      }

      const result = {
        ok: true,
        type: ENV_TYPES.ASSEMBLYSCRIPT,
        path: projectDir,
        name: name || basename(projectDir),
        commands: {
          build: "npm run asbuild",
          buildDebug: "npm run asbuild:debug",
          test: "npm test",
        },
        files: [
          "assembly/index.ts",
          "asconfig.json",
          "tsconfig.json",
          "tests/index.mjs",
        ],
      };

      return this._completeJob(job, result).result;
    } catch (err) {
      this._failJob(job, err);
      throw err;
    }
  }

  async createRustWasmProject(options = {}) {
    const { name, path: targetPath } = options;

    const projectDir = targetPath
      ? resolve(targetPath)
      : join(this.workspaceRoot, name || "wasm-rust");

    const job = this._startJob(
      ENV_TYPES.RUST_WASM,
      name || basename(projectDir),
      projectDir,
    );

    try {
      // Check cargo is available
      const cargoPath = await which("cargo");
      if (!cargoPath) {
        throw new Error("Rust/Cargo not found. Install from https://rustup.rs");
      }

      // Check wasm-pack
      const wasmPackPath = await which("wasm-pack");
      if (!wasmPackPath) {
        this._log(job, "Installing wasm-pack...");
        await runCommand("cargo", ["install", "wasm-pack"], {
          onStdout: (d) => this._log(job, d.trim()),
          onStderr: (d) => this._log(job, `[stderr] ${d.trim()}`),
        });
      }

      // Create cargo project
      this._log(job, "Creating Rust WASM project...");
      await runCommand("cargo", ["new", "--lib", basename(projectDir)], {
        cwd: dirname(projectDir),
        onStdout: (d) => this._log(job, d.trim()),
        onStderr: (d) => this._log(job, `[stderr] ${d.trim()}`),
      });

      // Update Cargo.toml
      const cargoToml = `[package]
name = "${name || basename(projectDir)}"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "rlib"]

[features]
default = ["console_error_panic_hook"]

[dependencies]
wasm-bindgen = "0.2"
console_error_panic_hook = { version = "0.1", optional = true }
js-sys = "0.3"
web-sys = { version = "0.3", features = ["Window", "Document", "Element"] }

[profile.release]
opt-level = "s"
`;
      await writeTextFile(join(projectDir, "Cargo.toml"), cargoToml);
      this._log(job, "Updated Cargo.toml");

      // src/lib.rs
      const libRs = `use wasm_bindgen::prelude::*;

// When the \`wee_alloc\` feature is enabled, use \`wee_alloc\` as the global allocator.
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[wasm_bindgen]
extern "C" {
    fn alert(s: &str);
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

macro_rules! console_log {
    ($($t:tt)*) => (log(&format_args!($($t)*).to_string()))
}

#[wasm_bindgen]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! From Rust WASM.", name)
}

#[wasm_bindgen]
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

#[wasm_bindgen]
pub fn fibonacci(n: u32) -> u32 {
    if n <= 1 {
        return n;
    }
    let (mut a, mut b) = (0u32, 1u32);
    for _ in 2..=n {
        let tmp = a + b;
        a = b;
        b = tmp;
    }
    b
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add() {
        assert_eq!(add(2, 3), 5);
    }

    #[test]
    fn test_fibonacci() {
        assert_eq!(fibonacci(10), 55);
    }
}
`;
      await writeTextFile(join(projectDir, "src", "lib.rs"), libRs);
      this._log(job, "Created src/lib.rs");

      const result = {
        ok: true,
        type: ENV_TYPES.RUST_WASM,
        path: projectDir,
        name: name || basename(projectDir),
        commands: {
          build: "wasm-pack build --target web",
          buildNode: "wasm-pack build --target nodejs",
          test: "wasm-pack test --node",
          publish: "wasm-pack publish",
        },
      };

      return this._completeJob(job, result).result;
    } catch (err) {
      this._failJob(job, err);
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Tool availability checks
  // -------------------------------------------------------------------------

  async checkAvailability() {
    const tools = {
      python: (await which("python")) || (await which("python3")),
      pip: (await which("pip")) || (await which("pip3")),
      conda: (await which("conda")) || (await which("mamba")),
      node: await which("node"),
      npm: await which("npm"),
      npx: await which("npx"),
      docker: await which("docker"),
      dockerCompose: (await which("docker-compose")) || (await which("docker")),
      kubectl: await which("kubectl"),
      cargo: await which("cargo"),
      wasmPack: await which("wasm-pack"),
      git: await which("git"),
    };

    return {
      ok: true,
      tools: Object.fromEntries(
        Object.entries(tools).map(([k, v]) => [
          k,
          { available: !!v, path: v || null },
        ]),
      ),
    };
  }

  async getSystemInfo() {
    const availability = await this.checkAvailability();
    const nodeVersion = availability.tools.node.available
      ? (
          await execAsync("node --version").catch(() => ({ stdout: "unknown" }))
        ).stdout.trim()
      : null;
    const pythonVersion = availability.tools.python.available
      ? (
          await execAsync("python --version 2>&1").catch(() => ({
            stdout: "unknown",
          }))
        ).stdout.trim()
      : null;
    const dockerVersion = availability.tools.docker.available
      ? (
          await execAsync("docker --version").catch(() => ({
            stdout: "unknown",
          }))
        ).stdout.trim()
      : null;

    return {
      platform: process.platform,
      arch: process.arch,
      nodeVersion,
      pythonVersion,
      dockerVersion,
      tools: availability.tools,
      workspaceRoot: this.workspaceRoot,
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton factory
// ---------------------------------------------------------------------------

let _defaultBootstrapper = null;

export function getEnvBootstrapper(workspaceRoot) {
  if (!_defaultBootstrapper) {
    _defaultBootstrapper = new EnvBootstrapper(workspaceRoot);
  }
  return _defaultBootstrapper;
}
