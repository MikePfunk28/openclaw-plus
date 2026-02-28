import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile, access } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));

const OPENCLAW_PATH = 'C:\\nvm\\node\\node_modules\\openclaw';
const OPENCLAW_BIN = 'openclaw';

export class OpenClawBridge {
  constructor(options = {}) {
    this.openclawPath = options.openclawPath || OPENCLAW_PATH;
    this.profile = options.profile || 'default';
    this.dev = options.dev || false;
    this.gatewayProcess = null;
    this.agentProcess = null;
    this.connected = false;
    this.config = null;
  }

  async initialize() {
    try {
      await this.loadConfig();
      await this.checkInstallation();
      return { success: true, message: 'OpenClaw bridge initialized' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async checkInstallation() {
    try {
      const { stdout } = await execAsync('openclaw --version');
      return { installed: true, version: stdout.trim() };
    } catch {
      const pkgPath = join(this.openclawPath, 'package.json');
      const pkgData = await readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(pkgData);
      return { installed: true, version: pkg.version, path: this.openclawPath };
    }
  }

  async loadConfig() {
    const configPaths = [
      join(process.env.USERPROFILE || '', '.openclaw', 'config.json'),
      join(process.env.USERPROFILE || '', '.openclawrc'),
    ];

    for (const path of configPaths) {
      try {
        const data = await readFile(path, 'utf-8');
        this.config = JSON.parse(data);
        return this.config;
      } catch {
        continue;
      }
    }
    return null;
  }

  buildArgs(command, args = []) {
    const fullArgs = [command, ...args];
    if (this.dev) fullArgs.push('--dev');
    if (this.profile !== 'default') fullArgs.push('--profile', this.profile);
    return fullArgs;
  }

  async runCommand(command, args = [], options = {}) {
    const fullArgs = this.buildArgs(command, args);
    
    return new Promise((resolve, reject) => {
      const proc = spawn(OPENCLAW_BIN, fullArgs, {
        cwd: options.cwd || process.cwd(),
        env: { ...process.env, ...options.env },
        shell: true,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
        if (options.onStdout) options.onStdout(data.toString());
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
        if (options.onStderr) options.onStderr(data.toString());
      });

      proc.on('close', (code) => {
        if (code === 0 || options.allowNonZero) {
          resolve({ stdout, stderr, code });
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });

      proc.on('error', reject);

      if (options.input) {
        proc.stdin.write(options.input);
        proc.stdin.end();
      }
    });
  }

  async runCommandJson(command, args = []) {
    const result = await this.runCommand(command, [...args, '--json']);
    try {
      return JSON.parse(result.stdout);
    } catch {
      return { raw: result.stdout, error: 'Failed to parse JSON' };
    }
  }

  async startGateway(options = {}) {
    if (this.gatewayProcess) {
      return { success: false, error: 'Gateway already running' };
    }

    const port = options.port || (this.dev ? 19001 : 18789);
    const args = ['--port', String(port)];
    if (options.force) args.push('--force');

    return new Promise((resolve, reject) => {
      this.gatewayProcess = spawn(OPENCLAW_BIN, this.buildArgs('gateway', args), {
        cwd: process.cwd(),
        env: process.env,
        shell: true,
      });

      const rl = createInterface({ input: this.gatewayProcess.stdout });
      let started = false;

      rl.on('line', (line) => {
        if (options.onLog) options.onLog(line);
        if (!started && (line.includes('listening') || line.includes('Gateway'))) {
          started = true;
          this.connected = true;
          resolve({ success: true, port, message: 'Gateway started' });
        }
      });

      this.gatewayProcess.stderr.on('data', (data) => {
        if (options.onLog) options.onLog(data.toString());
      });

      this.gatewayProcess.on('error', (err) => {
        this.gatewayProcess = null;
        this.connected = false;
        if (!started) reject(err);
      });

      this.gatewayProcess.on('close', () => {
        this.gatewayProcess = null;
        this.connected = false;
      });

      setTimeout(() => {
        if (!started) {
          resolve({ success: true, port, message: 'Gateway starting (async)' });
        }
      }, 5000);
    });
  }

  async stopGateway() {
    if (!this.gatewayProcess) {
      return { success: false, error: 'Gateway not running' };
    }

    return new Promise((resolve) => {
      this.gatewayProcess.on('close', () => {
        this.gatewayProcess = null;
        this.connected = false;
        resolve({ success: true, message: 'Gateway stopped' });
      });
      this.gatewayProcess.kill();
    });
  }

  async sendMessage(options) {
    const args = ['send'];
    if (options.target) args.push('--target', options.target);
    if (options.message) args.push('--message', options.message);
    if (options.channel) args.push('--channel', options.channel);
    if (options.deliver) args.push('--deliver');

    return this.runCommandJson('message', args);
  }

  async listChannels() {
    return this.runCommandJson('channels', ['list']);
  }

  async loginChannel(channel) {
    return this.runCommand('channels', ['login', '--channel', channel], {
      onStdout: (data) => console.log('[openclaw]', data),
    });
  }

  async logoutChannel(channel) {
    return this.runCommand('channels', ['logout', '--channel', channel]);
  }

  async getModels() {
    return this.runCommandJson('models', ['list']);
  }

  async setModel(model) {
    return this.runCommand('models', ['set', model]);
  }

  async runDoctor() {
    return this.runCommand('doctor', [], { allowNonZero: true });
  }

  async agentChat(message, options = {}) {
    const args = [];
    if (options.target) args.push('--to', options.target);
    if (options.deliver) args.push('--deliver');
    
    return this.runCommand('agent', [...args, '--message', message], {
      onStdout: options.onResponse,
    });
  }

  async startAgent(options = {}) {
    if (this.agentProcess) {
      return { success: false, error: 'Agent already running' };
    }

    const args = [];
    if (options.target) args.push('--to', options.target);
    if (options.mode) args.push('--mode', options.mode);

    return new Promise((resolve, reject) => {
      this.agentProcess = spawn(OPENCLAW_BIN, this.buildArgs('agent', args), {
        cwd: process.cwd(),
        env: process.env,
        shell: true,
      });

      let started = false;

      this.agentProcess.stdout.on('data', (data) => {
        if (options.onOutput) options.onOutput(data.toString());
        if (!started) {
          started = true;
          resolve({ success: true, message: 'Agent started' });
        }
      });

      this.agentProcess.stderr.on('data', (data) => {
        if (options.onOutput) options.onOutput(data.toString());
      });

      this.agentProcess.on('error', (err) => {
        this.agentProcess = null;
        if (!started) reject(err);
      });

      this.agentProcess.on('close', () => {
        this.agentProcess = null;
      });

      setTimeout(() => {
        if (!started) resolve({ success: true, message: 'Agent starting' });
      }, 2000);
    });
  }

  async stopAgent() {
    if (!this.agentProcess) {
      return { success: false, error: 'Agent not running' };
    }

    return new Promise((resolve) => {
      this.agentProcess.on('close', () => {
        this.agentProcess = null;
        resolve({ success: true, message: 'Agent stopped' });
      });
      this.agentProcess.kill();
    });
  }

  async listSkills() {
    const skillsPath = join(this.openclawPath, 'skills');
    try {
      const { readdir } = await import('fs/promises');
      const dirs = await readdir(skillsPath, { withFileTypes: true });
      const skills = [];
      
      for (const dir of dirs) {
        if (dir.isDirectory()) {
          const skillMdPath = join(skillsPath, dir.name, 'SKILL.md');
          try {
            const content = await readFile(skillMdPath, 'utf-8');
            const frontmatter = this.parseFrontmatter(content);
            skills.push({
              name: dir.name,
              ...frontmatter,
            });
          } catch {
            skills.push({ name: dir.name });
          }
        }
      }
      
      return skills;
    } catch (error) {
      return { error: error.message };
    }
  }

  parseFrontmatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return {};
    
    try {
      const yaml = match[1];
      const data = {};
      
      yaml.split('\n').forEach(line => {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
          const key = line.slice(0, colonIdx).trim();
          let value = line.slice(colonIdx + 1).trim();
          
          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.slice(1, -1);
          }
          
          data[key] = value;
        }
      });
      
      if (data.metadata) {
        try {
          data.metadata = JSON.parse(data.metadata);
        } catch {
          // Keep as string
        }
      }
      
      return data;
    } catch {
      return {};
    }
  }

  getStatus() {
    return {
      gatewayRunning: !!this.gatewayProcess,
      agentRunning: !!this.agentProcess,
      connected: this.connected,
      profile: this.profile,
      dev: this.dev,
      configLoaded: !!this.config,
    };
  }

  async cleanup() {
    await this.stopGateway();
    await this.stopAgent();
  }
}

export const openclawBridge = new OpenClawBridge();

export default OpenClawBridge;
