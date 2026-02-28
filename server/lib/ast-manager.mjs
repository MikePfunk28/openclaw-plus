import { spawn } from 'child_process';
import { readFile, writeFile } from 'fs/promises';
import { join, extname } from 'path';

const PARSERS = {
  javascript: {
    extensions: ['.js', '.jsx', '.mjs', '.cjs'],
    language: 'javascript',
    package: '@babel/parser',
    parse: (code, parser) => parser.parse(code, { 
      sourceType: 'module', 
      plugins: ['jsx', 'typescript', 'classProperties', 'decorators-legal', 'dynamicImport', 'exportDefaultFrom', 'nullishCoalescingOperator', 'optionalChaining']
    })
  },
  typescript: {
    extensions: ['.ts', '.tsx'],
    language: 'typescript',
    package: '@typescript-eslint/typescript-estree',
    parse: (code, parser) => parser.parse(code, { 
      jsx: true, 
      useJSXTextNode: true,
      project: './tsconfig.json'
    })
  },
  python: {
    extensions: ['.py', '.pyi'],
    language: 'python',
    command: 'python3',
    args: ['-c', 'import ast, json, sys; print(json.dumps(ast.dump(ast.parse(sys.stdin.read()))))']
  },
  json: {
    extensions: ['.json'],
    language: 'json',
    parse: (code) => ({ type: 'JSON', value: JSON.parse(code) })
  },
  yaml: {
    extensions: ['.yaml', '.yml'],
    language: 'yaml',
    package: 'yaml',
    parse: (code, parser) => parser.parse(code)
  },
  html: {
    extensions: ['.html', '.htm'],
    language: 'html',
    package: 'node-html-parser',
    parse: (code, parser) => parser.parse(code)
  },
  css: {
    extensions: ['.css', '.scss', '.less'],
    language: 'css',
    package: 'css-tree',
    parse: (code, parser) => parser.parse(code, { context: 'stylesheet' })
  },
  markdown: {
    extensions: ['.md', '.markdown'],
    language: 'markdown',
    package: 'marked',
    parse: (code, parser) => parser.lexer(code)
  },
  sql: {
    extensions: ['.sql'],
    language: 'sql',
    package: 'node-sql-parser',
    parse: (code, parser) => {
      const p = new parser.Parser();
      return p.astify(code);
    }
  },
  toml: {
    extensions: ['.toml'],
    language: 'toml',
    package: '@iarna/toml',
    parse: (code, parser) => parser.parse(code)
  },
  xml: {
    extensions: ['.xml'],
    language: 'xml',
    package: 'fast-xml-parser',
    parse: (code, parser) => new parser.XMLParser().parse(code)
  }
};

export class ASTManager {
  constructor() {
    this.parsers = new Map();
    this.cache = new Map();
    this.treeCache = new Map();
  }

  getParserFromExtension(ext) {
    for (const [name, config] of Object.entries(PARSERS)) {
      if (config.extensions.includes(ext)) {
        return { name, ...config };
      }
    }
    return null;
  }

  async loadParser(parserName) {
    if (this.parsers.has(parserName)) {
      return this.parsers.get(parserName);
    }

    const config = PARSERS[parserName];
    if (!config) {
      throw new Error(`Unknown parser: ${parserName}`);
    }

    if (config.parse && config.package) {
      try {
        const mod = await import(config.package);
        const parser = config.parse.bind(null, mod.default || mod);
        this.parsers.set(parserName, { type: 'function', parse: parser });
        return this.parsers.get(parserName);
      } catch (err) {
        console.warn(`Failed to load ${config.package}, falling back to simple parsing`);
        this.parsers.set(parserName, { type: 'fallback', language: config.language });
        return this.parsers.get(parserName);
      }
    }

    if (config.command) {
      this.parsers.set(parserName, { type: 'external', ...config });
      return this.parsers.get(parserName);
    }

    if (config.parse) {
      this.parsers.set(parserName, { type: 'builtin', parse: config.parse });
      return this.parsers.get(parserName);
    }

    throw new Error(`Cannot load parser: ${parserName}`);
  }

  async parseFile(filePath, content = null) {
    const ext = extname(filePath);
    const parserConfig = this.getParserFromExtension(ext);
    
    if (!parserConfig) {
      return { 
        error: `No parser for extension: ${ext}`,
        type: 'raw',
        content: content || await readFile(filePath, 'utf-8')
      };
    }

    const code = content || await readFile(filePath, 'utf-8');
    const cacheKey = `${filePath}:${Buffer.from(code).length}`;
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const parser = await this.loadParser(parserConfig.name);
      let ast;

      if (parser.type === 'function') {
        ast = parser.parse(code);
      } else if (parser.type === 'external') {
        ast = await this.parseExternal(parser, code);
      } else if (parser.type === 'builtin') {
        ast = parser.parse(code);
      } else {
        ast = await this.simpleParse(code, parserConfig.language);
      }

      const result = {
        type: 'ast',
        language: parserConfig.language,
        ast,
        source: code,
        filePath,
        timestamp: Date.now()
      };

      this.cache.set(cacheKey, result);
      return result;
    } catch (err) {
      return {
        error: err.message,
        type: 'error',
        language: parserConfig.language,
        source: code,
        filePath
      };
    }
  }

  async parseExternal(config, code) {
    return new Promise((resolve, reject) => {
      const proc = spawn(config.command, config.args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => stdout += data);
      proc.stderr.on('data', (data) => stderr += data);

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(stderr || `Parser exited with code ${code}`));
        } else {
          try {
            resolve(JSON.parse(stdout));
          } catch {
            resolve({ raw: stdout });
          }
        }
      });

      proc.stdin.write(code);
      proc.stdin.end();
    });
  }

  async simpleParse(code, language) {
    const lines = code.split('\n');
    const result = {
      type: 'Program',
      language,
      body: [],
      loc: { start: { line: 1, column: 0 }, end: { line: lines.length, column: lines[lines.length - 1]?.length || 0 } }
    };

    const patterns = this.getPatternsForLanguage(language);
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      for (const [type, pattern] of Object.entries(patterns)) {
        const matches = line.matchAll(pattern.regex);
        for (const match of matches) {
          result.body.push({
            type,
            name: match.groups?.name || match[1] || null,
            loc: { start: { line: lineNum, column: match.index }, end: { line: lineNum, column: match.index + match[0].length } },
            raw: match[0]
          });
        }
      }
    }

    return result;
  }

  getPatternsForLanguage(language) {
    const patterns = {
      javascript: {
        FunctionDeclaration: { regex: /function\s+(?<name>\w+)\s*\(/g },
        ArrowFunctionExpression: { regex: /(?<name>\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g },
        ClassDeclaration: { regex: /class\s+(?<name>\w+)/g },
        VariableDeclaration: { regex: /(?:const|let|var)\s+(?<name>\w+)/g },
        ImportDeclaration: { regex: /import\s+.*from\s+['"](?<name>[^'"]+)['"]/g },
        ExportDeclaration: { regex: /export\s+(?:default\s+)?(?<name>\w+)/g },
        CallExpression: { regex: /(?<name>\w+)\s*\(/g }
      },
      typescript: {
        FunctionDeclaration: { regex: /function\s+(?<name>\w+)\s*[<(]/g },
        InterfaceDeclaration: { regex: /interface\s+(?<name>\w+)/g },
        TypeAliasDeclaration: { regex: /type\s+(?<name>\w+)/g },
        ClassDeclaration: { regex: /class\s+(?<name>\w+)/g },
        EnumDeclaration: { regex: /enum\s+(?<name>\w+)/g }
      },
      python: {
        FunctionDef: { regex: /def\s+(?<name>\w+)\s*\(/g },
        ClassDef: { regex: /class\s+(?<name>\w+)/g },
        Import: { regex: /import\s+(?<name>\w+)/g },
        ImportFrom: { regex: /from\s+(?<name>[\w.]+)\s+import/g },
        Assignment: { regex: /(?<name>\w+)\s*=/g }
      }
    };

    return patterns[language] || patterns.javascript;
  }

  async extractSymbols(filePath, content = null) {
    const result = await this.parseFile(filePath, content);
    if (result.error) return [];

    const symbols = [];
    const ast = result.ast;

    const traverse = (node, path = []) => {
      if (!node || typeof node !== 'object') return;

      const nodeType = node.type;
      const nodeName = node.name || node.id?.name || node.key?.name;
      
      if (nodeName && this.isSymbolNode(nodeType)) {
        symbols.push({
          name: nodeName,
          type: this.mapNodeType(nodeType),
          kind: this.getSymbolKind(nodeType),
          location: node.loc ? {
            start: node.loc.start,
            end: node.loc.end
          } : null,
          path: [...path, nodeName],
          children: []
        });
      }

      for (const key of Object.keys(node)) {
        const value = node[key];
        if (Array.isArray(value)) {
          value.forEach(child => traverse(child, nodeName ? [...path, nodeName] : path));
        } else if (value && typeof value === 'object') {
          traverse(value, nodeName ? [...path, nodeName] : path);
        }
      }
    };

    traverse(ast, []);
    return this.buildSymbolTree(symbols);
  }

  isSymbolNode(type) {
    const symbolTypes = [
      'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression',
      'ClassDeclaration', 'ClassExpression', 'MethodDefinition',
      'VariableDeclaration', 'VariableDeclarator',
      'InterfaceDeclaration', 'TypeAliasDeclaration', 'EnumDeclaration',
      'FunctionDef', 'ClassDef', 'InterfaceDef',
      'Property', 'PropertyDefinition', 'FieldDefinition'
    ];
    return symbolTypes.includes(type);
  }

  mapNodeType(type) {
    const typeMap = {
      FunctionDeclaration: 'function',
      FunctionExpression: 'function',
      ArrowFunctionExpression: 'function',
      ClassDeclaration: 'class',
      ClassExpression: 'class',
      MethodDefinition: 'method',
      VariableDeclaration: 'variable',
      VariableDeclarator: 'variable',
      InterfaceDeclaration: 'interface',
      TypeAliasDeclaration: 'type',
      EnumDeclaration: 'enum',
      FunctionDef: 'function',
      ClassDef: 'class',
      Property: 'property',
      PropertyDefinition: 'property',
      FieldDefinition: 'field'
    };
    return typeMap[type] || 'unknown';
  }

  getSymbolKind(type) {
    const kindMap = {
      FunctionDeclaration: 12,
      FunctionExpression: 12,
      ArrowFunctionExpression: 12,
      ClassDeclaration: 5,
      MethodDefinition: 6,
      VariableDeclaration: 13,
      VariableDeclarator: 13,
      InterfaceDeclaration: 11,
      TypeAliasDeclaration: 11,
      EnumDeclaration: 10,
      Property: 7,
      PropertyDefinition: 7
    };
    return kindMap[type] || 14;
  }

  buildSymbolTree(symbols) {
    const root = { name: 'root', children: [] };
    const stack = [root];

    for (const symbol of symbols) {
      let current = stack[stack.length - 1];
      current.children.push(symbol);
    }

    return root.children;
  }

  async findReferences(filePath, symbolName, content = null) {
    const result = await this.parseFile(filePath, content);
    if (result.error) return [];

    const references = [];
    const code = result.source;
    const regex = new RegExp(`\\b${symbolName}\\b`, 'g');
    
    let match;
    const lines = code.split('\n');
    
    while ((match = regex.exec(code)) !== null) {
      const before = code.slice(0, match.index);
      const lineNum = (before.match(/\n/g) || []).length + 1;
      const lastNewline = before.lastIndexOf('\n');
      const colNum = match.index - lastNewline;

      references.push({
        filePath,
        line: lineNum,
        column: colNum,
        length: match[0].length,
        context: lines[lineNum - 1]?.trim() || ''
      });
    }

    return references;
  }

  async analyzeDependencies(filePath, content = null) {
    const result = await this.parseFile(filePath, content);
    if (result.error) return { imports: [], exports: [] };

    const ast = result.ast;
    const imports = [];
    const exports = [];

    const traverse = (node) => {
      if (!node || typeof node !== 'object') return;

      if (node.type === 'ImportDeclaration' && node.source?.value) {
        imports.push({
          source: node.source.value,
          specifiers: (node.specifiers || []).map(s => ({
            type: s.type,
            imported: s.imported?.name || s.imported?.value,
            local: s.local?.name
          }))
        });
      }

      if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration') {
        const declaration = node.declaration;
        if (declaration) {
          exports.push({
            type: node.type,
            name: declaration.name || declaration.id?.name || 'default',
            exportType: declaration.type
          });
        }
        if (node.specifiers) {
          node.specifiers.forEach(s => {
            exports.push({
              type: 'ExportSpecifier',
              name: s.exported?.name || s.local?.name,
              local: s.local?.name
            });
          });
        }
      }

      if (node.type === 'CallExpression' && 
          node.callee?.type === 'Identifier' && 
          node.callee?.name === 'require' &&
          node.arguments?.[0]?.type === 'StringLiteral') {
        imports.push({
          source: node.arguments[0].value,
          specifiers: [],
          type: 'require'
        });
      }

      for (const key of Object.keys(node)) {
        const value = node[key];
        if (Array.isArray(value)) {
          value.forEach(traverse);
        } else if (value && typeof value === 'object') {
          traverse(value);
        }
      }
    };

    traverse(ast);
    return { imports, exports };
  }

  async getStructure(filePath, content = null) {
    const result = await this.parseFile(filePath, content);
    if (result.error) return { error: result.error };

    return {
      language: result.language,
      symbols: await this.extractSymbols(filePath, content),
      dependencies: await this.analyzeDependencies(filePath, content),
      stats: {
        lines: result.source.split('\n').length,
        characters: result.source.length,
        timestamp: result.timestamp
      }
    };
  }

  listParsers() {
    return Object.entries(PARSERS).map(([name, config]) => ({
      name,
      language: config.language,
      extensions: config.extensions,
      hasParser: this.parsers.has(name)
    }));
  }

  clearCache() {
    this.cache.clear();
    this.treeCache.clear();
  }
}

export const astManager = new ASTManager();
export { PARSERS };
