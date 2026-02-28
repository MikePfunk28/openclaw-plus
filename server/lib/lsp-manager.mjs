import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { readFile, writeFile, access } from 'fs/promises';
import { join } from 'path';

const LANGUAGE_SERVERS = {
  typescript: {
    command: 'typescript-language-server',
    args: ['--stdio'],
    modules: ['typescript', 'typescript-language-server'],
    languages: ['typescript', 'javascript', 'javascriptreact', 'typescriptreact'],
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']
  },
  python: {
    command: 'pylsp',
    args: [],
    modules: ['python-lsp-server'],
    languages: ['python'],
    extensions: ['.py', '.pyi']
  },
  gopls: {
    command: 'gopls',
    args: ['serve'],
    modules: [],
    languages: ['go'],
    extensions: ['.go']
  },
  rust: {
    command: 'rust-analyzer',
    args: [],
    modules: [],
    languages: ['rust'],
    extensions: ['.rs']
  },
  java: {
    command: 'jdtls',
    args: [],
    modules: [],
    languages: ['java'],
    extensions: ['.java']
  },
  csharp: {
    command: 'omnisharp',
    args: ['-lsp'],
    modules: [],
    languages: ['csharp'],
    extensions: ['.cs']
  },
  cpp: {
    command: 'clangd',
    args: [],
    modules: [],
    languages: ['c', 'cpp'],
    extensions: ['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp']
  },
  ruby: {
    command: 'solargraph',
    args: ['stdio'],
    modules: ['solargraph'],
    languages: ['ruby'],
    extensions: ['.rb', '.rake']
  },
  php: {
    command: 'intelephense',
    args: ['--stdio'],
    modules: ['intelephense'],
    languages: ['php'],
    extensions: ['.php']
  },
  html: {
    command: 'vscode-html-language-server',
    args: ['--stdio'],
    modules: ['vscode-langservers-extracted'],
    languages: ['html'],
    extensions: ['.html', '.htm']
  },
  css: {
    command: 'vscode-css-language-server',
    args: ['--stdio'],
    modules: ['vscode-langservers-extracted'],
    languages: ['css', 'scss', 'less'],
    extensions: ['.css', '.scss', '.less']
  },
  json: {
    command: 'vscode-json-language-server',
    args: ['--stdio'],
    modules: ['vscode-langservers-extracted'],
    languages: ['json'],
    extensions: ['.json']
  },
  yaml: {
    command: 'yaml-language-server',
    args: ['--stdio'],
    modules: ['yaml-language-server'],
    languages: ['yaml'],
    extensions: ['.yaml', '.yml']
  },
  dockerfile: {
    command: 'docker-langserver',
    args: ['--stdio'],
    modules: ['dockerfile-language-server-nodejs'],
    languages: ['dockerfile'],
    extensions: ['Dockerfile']
  },
  bash: {
    command: 'bash-language-server',
    args: ['start'],
    modules: ['bash-language-server'],
    languages: ['bash'],
    extensions: ['.sh', '.bash']
  }
};

export class LSPManager extends EventEmitter {
  constructor() {
    super();
    this.clients = new Map();
    this.documents = new Map();
    this.diagnostics = new Map();
    this.completions = new Map();
    this.definitions = new Map();
    this.references = new Map();
    this.symbols = new Map();
    this.hovers = new Map();
    this.nextId = 1;
  }

  getLanguageFromExtension(ext) {
    for (const [serverId, config] of Object.entries(LANGUAGE_SERVERS)) {
      if (config.extensions.includes(ext)) {
        return { serverId, language: config.languages[0] };
      }
    }
    return null;
  }

  async startServer(serverId, projectRoot) {
    if (this.clients.has(serverId)) {
      return this.clients.get(serverId);
    }

    const config = LANGUAGE_SERVERS[serverId];
    if (!config) {
      throw new Error(`Unknown language server: ${serverId}`);
    }

    return new Promise((resolve, reject) => {
      const proc = spawn(config.command, config.args, {
        cwd: projectRoot,
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      const client = {
        id: serverId,
        process: proc,
        projectRoot,
        initialized: false,
        capabilities: {},
        buffer: ''
      };

      proc.on('error', (err) => {
        this.emit('error', { serverId, error: err });
        reject(err);
      });

      proc.on('exit', (code) => {
        this.clients.delete(serverId);
        this.emit('exit', { serverId, code });
      });

      proc.stdout.on('data', (data) => {
        this.handleMessage(client, data);
      });

      proc.stderr.on('data', (data) => {
        this.emit('stderr', { serverId, data: data.toString() });
      });

      this.clients.set(serverId, client);
      
      this.sendRequest(client, 'initialize', {
        processId: process.pid,
        rootUri: `file://${projectRoot}`,
        capabilities: {
          textDocument: {
            completion: { completionItem: { snippetSupport: true } },
            hover: { contentFormat: ['markdown', 'plaintext'] },
            definition: { linkSupport: true },
            references: {},
            documentSymbol: {},
            diagnostic: { dynamicRegistration: true }
          },
          workspace: {
            symbol: {},
            configuration: true
          }
        }
      }).then((result) => {
        client.capabilities = result.capabilities || {};
        client.initialized = true;
        this.sendNotification(client, 'initialized', {});
        this.emit('ready', { serverId, capabilities: client.capabilities });
        resolve(client);
      }).catch(reject);
    });
  }

  async stopServer(serverId) {
    const client = this.clients.get(serverId);
    if (!client) return;

    await this.sendRequest(client, 'shutdown', {});
    this.sendNotification(client, 'exit', {});
    client.process.kill();
    this.clients.delete(serverId);
  }

  async stopAll() {
    for (const serverId of this.clients.keys()) {
      await this.stopServer(serverId);
    }
  }

  handleMessage(client, data) {
    client.buffer += data.toString();
    
    while (true) {
      const headerEnd = client.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;

      const headers = client.buffer.slice(0, headerEnd);
      const contentLengthMatch = headers.match(/Content-Length: (\d+)/i);
      if (!contentLengthMatch) break;

      const contentLength = parseInt(contentLengthMatch[1], 10);
      const messageStart = headerEnd + 4;
      
      if (client.buffer.length < messageStart + contentLength) break;

      const message = client.buffer.slice(messageStart, messageStart + contentLength);
      client.buffer = client.buffer.slice(messageStart + contentLength);

      try {
        const parsed = JSON.parse(message);
        this.processResponse(client, parsed);
      } catch (err) {
        this.emit('error', { serverId: client.id, error: err });
      }
    }
  }

  processResponse(client, message) {
    if (message.method) {
      if (message.method === 'textDocument/publishDiagnostics') {
        const { uri, diagnostics } = message.params;
        this.diagnostics.set(uri, diagnostics);
        this.emit('diagnostics', { uri, diagnostics });
      } else if (message.method.startsWith('$')) {
        // Server notification
      } else {
        this.emit('notification', { serverId: client.id, message });
      }
    } else if (message.id !== undefined) {
      const pending = this.pendingRequests?.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result);
        }
      }
    }
  }

  sendRequest(client, method, params) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const message = JSON.stringify({ jsonrpc: '2.0', id, method, params });
      const content = `Content-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`;
      
      this.pendingRequests = this.pendingRequests || new Map();
      this.pendingRequests.set(id, { resolve, reject });
      
      client.process.stdin.write(content);
      
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  sendNotification(client, method, params) {
    const message = JSON.stringify({ jsonrpc: '2.0', method, params });
    const content = `Content-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`;
    client.process.stdin.write(content);
  }

  async openDocument(serverId, uri, languageId, content) {
    const client = this.clients.get(serverId);
    if (!client) throw new Error(`Server not started: ${serverId}`);

    const doc = { uri, languageId, content, version: 1 };
    this.documents.set(uri, doc);

    this.sendNotification(client, 'textDocument/didOpen', {
      textDocument: { uri, languageId, version: 1, text: content }
    });

    return doc;
  }

  async updateDocument(uri, content) {
    const doc = this.documents.get(uri);
    if (!doc) throw new Error(`Document not open: ${uri}`);

    const client = Array.from(this.clients.values()).find(c => 
      LANGUAGE_SERVERS[c.id]?.languages.includes(doc.languageId)
    );
    if (!client) throw new Error('No server for document');

    doc.content = content;
    doc.version++;

    this.sendNotification(client, 'textDocument/didChange', {
      textDocument: { uri, version: doc.version },
      contentChanges: [{ text: content }]
    });
  }

  async closeDocument(uri) {
    const doc = this.documents.get(uri);
    if (!doc) return;

    const client = Array.from(this.clients.values()).find(c =>
      LANGUAGE_SERVERS[c.id]?.languages.includes(doc.languageId)
    );
    if (client) {
      this.sendNotification(client, 'textDocument/didClose', {
        textDocument: { uri }
      });
    }

    this.documents.delete(uri);
    this.diagnostics.delete(uri);
  }

  async getCompletion(uri, position) {
    const client = await this.getClientForUri(uri);
    if (!client) return [];

    const result = await this.sendRequest(client, 'textDocument/completion', {
      textDocument: { uri },
      position
    });

    const items = result.items || result || [];
    this.completions.set(`${uri}:${position.line}:${position.character}`, items);
    return items;
  }

  async getHover(uri, position) {
    const client = await this.getClientForUri(uri);
    if (!client) return null;

    const result = await this.sendRequest(client, 'textDocument/hover', {
      textDocument: { uri },
      position
    });

    this.hovers.set(`${uri}:${position.line}:${position.character}`, result);
    return result;
  }

  async getDefinition(uri, position) {
    const client = await this.getClientForUri(uri);
    if (!client) return [];

    const result = await this.sendRequest(client, 'textDocument/definition', {
      textDocument: { uri },
      position
    });

    const locations = Array.isArray(result) ? result : result ? [result] : [];
    this.definitions.set(`${uri}:${position.line}:${position.character}`, locations);
    return locations;
  }

  async getReferences(uri, position) {
    const client = await this.getClientForUri(uri);
    if (!client) return [];

    const result = await this.sendRequest(client, 'textDocument/references', {
      textDocument: { uri },
      position,
      context: { includeDeclaration: true }
    });

    this.references.set(`${uri}:${position.line}:${position.character}`, result || []);
    return result || [];
  }

  async getDocumentSymbols(uri) {
    const client = await this.getClientForUri(uri);
    if (!client) return [];

    const result = await this.sendRequest(client, 'textDocument/documentSymbol', {
      textDocument: { uri }
    });

    this.symbols.set(uri, result || []);
    return result || [];
  }

  async getWorkspaceSymbols(query) {
    const results = [];
    for (const client of this.clients.values()) {
      if (!client.initialized) continue;
      
      try {
        const result = await this.sendRequest(client, 'workspace/symbol', { query });
        if (result) results.push(...result);
      } catch {}
    }
    return results;
  }

  async getClientForUri(uri) {
    const doc = this.documents.get(uri);
    if (!doc) return null;

    for (const [serverId, client] of this.clients) {
      const config = LANGUAGE_SERVERS[serverId];
      if (config?.languages.includes(doc.languageId)) {
        return client;
      }
    }
    return null;
  }

  getDiagnostics(uri) {
    return this.diagnostics.get(uri) || [];
  }

  getAllDiagnostics() {
    return Object.fromEntries(this.diagnostics);
  }

  listServers() {
    return Object.entries(LANGUAGE_SERVERS).map(([id, config]) => ({
      id,
      command: config.command,
      languages: config.languages,
      extensions: config.extensions,
      running: this.clients.has(id)
    }));
  }

  getRunningServers() {
    return Array.from(this.clients.entries()).map(([id, client]) => ({
      id,
      projectRoot: client.projectRoot,
      initialized: client.initialized,
      capabilities: client.capabilities
    }));
  }
}

export const lspManager = new LSPManager();
export { LANGUAGE_SERVERS };
