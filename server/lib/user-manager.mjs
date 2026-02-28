import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID, createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_ROLES = {
  admin: {
    name: 'Administrator',
    permissions: ['*'],
    description: 'Full access to all features'
  },
  developer: {
    name: 'Developer',
    permissions: [
      'agents:*',
      'skills:*',
      'sessions:*',
      'models:read',
      'models:write',
      'adapters:*',
      'workflows:*',
      'telemetry:read',
      'architecture:*',
      'drift:*'
    ],
    description: 'Full development access'
  },
  analyst: {
    name: 'Analyst',
    permissions: [
      'sessions:read',
      'sessions:write',
      'models:read',
      'telemetry:read',
      'workflows:read',
      'workflows:execute'
    ],
    description: 'Analysis and reporting access'
  },
  viewer: {
    name: 'Viewer',
    permissions: [
      'sessions:read',
      'models:read',
      'telemetry:read'
    ],
    description: 'Read-only access'
  },
  api_user: {
    name: 'API User',
    permissions: [
      'sessions:write',
      'skills:invoke',
      'models:read'
    ],
    description: 'API access for integrations'
  }
};

export class UserManager {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.usersFile = join(dataDir, 'users.json');
    this.sessionsFile = join(dataDir, 'user-sessions.json');
    this.users = new Map();
    this.sessions = new Map();
    this.roles = { ...DEFAULT_ROLES };
  }

  async initialize() {
    await this.load();
    await this.ensureAdmin();
  }

  async load() {
    try {
      const data = await readFile(this.usersFile, 'utf-8');
      const parsed = JSON.parse(data);
      this.users = new Map(Object.entries(parsed.users || {}));
      this.roles = { ...DEFAULT_ROLES, ...(parsed.roles || {}) };
    } catch {
      this.users = new Map();
    }

    try {
      const data = await readFile(this.sessionsFile, 'utf-8');
      this.sessions = new Map(Object.entries(JSON.parse(data)));
    } catch {
      this.sessions = new Map();
    }
  }

  async save() {
    const usersData = {
      users: Object.fromEntries(this.users),
      roles: this.roles
    };
    await writeFile(this.usersFile, JSON.stringify(usersData, null, 2));
    
    const sessionsData = Object.fromEntries(this.sessions);
    await writeFile(this.sessionsFile, JSON.stringify(sessionsData, null, 2));
  }

  async ensureAdmin() {
    if (this.users.size === 0) {
      await this.createUser({
        email: 'admin@localhost',
        name: 'Admin',
        role: 'admin',
        password: 'admin123'
      });
      console.log('[users] Created default admin user (admin@localhost / admin123)');
    }
  }

  hashPassword(password) {
    return createHash('sha256').update(password).digest('hex');
  }

  async createUser({ email, name, role, password, metadata = {} }) {
    if (this.users.has(email)) {
      throw new Error('User already exists');
    }

    if (!this.roles[role]) {
      throw new Error(`Invalid role: ${role}`);
    }

    const user = {
      id: randomUUID(),
      email,
      name,
      role,
      passwordHash: this.hashPassword(password),
      createdAt: new Date().toISOString(),
      lastLogin: null,
      metadata,
      preferences: {},
      apiKeys: []
    };

    this.users.set(email, user);
    await this.save();
    return this.sanitizeUser(user);
  }

  async updateUser(email, updates) {
    const user = this.users.get(email);
    if (!user) {
      throw new Error('User not found');
    }

    if (updates.role && !this.roles[updates.role]) {
      throw new Error(`Invalid role: ${updates.role}`);
    }

    if (updates.password) {
      updates.passwordHash = this.hashPassword(updates.password);
      delete updates.password;
    }

    Object.assign(user, updates, { updatedAt: new Date().toISOString() });
    this.users.set(email, user);
    await this.save();
    return this.sanitizeUser(user);
  }

  async deleteUser(email) {
    if (!this.users.has(email)) {
      throw new Error('User not found');
    }
    this.users.delete(email);
    await this.save();
    return { success: true };
  }

  getUser(email) {
    const user = this.users.get(email);
    return user ? this.sanitizeUser(user) : null;
  }

  getUserById(id) {
    for (const user of this.users.values()) {
      if (user.id === id) return this.sanitizeUser(user);
    }
    return null;
  }

  listUsers() {
    return Array.from(this.users.values()).map(u => this.sanitizeUser(u));
  }

  sanitizeUser(user) {
    const { passwordHash, ...safe } = user;
    return safe;
  }

  async authenticate(email, password) {
    const user = this.users.get(email);
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    if (user.passwordHash !== this.hashPassword(password)) {
      return { success: false, error: 'Invalid password' };
    }

    user.lastLogin = new Date().toISOString();
    this.users.set(email, user);
    await this.save();

    const sessionToken = randomUUID();
    this.sessions.set(sessionToken, {
      userId: user.id,
      email: user.email,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    });
    await this.save();

    return {
      success: true,
      user: this.sanitizeUser(user),
      token: sessionToken
    };
  }

  async validateSession(token) {
    const session = this.sessions.get(token);
    if (!session) {
      return { valid: false, error: 'Invalid session' };
    }

    if (new Date(session.expiresAt) < new Date()) {
      this.sessions.delete(token);
      await this.save();
      return { valid: false, error: 'Session expired' };
    }

    const user = this.getUserById(session.userId);
    if (!user) {
      return { valid: false, error: 'User not found' };
    }

    return { valid: true, user, session };
  }

  async logout(token) {
    this.sessions.delete(token);
    await this.save();
    return { success: true };
  }

  async createApiKey(email, { name, expiresAt }) {
    const user = this.users.get(email);
    if (!user) {
      throw new Error('User not found');
    }

    const apiKey = {
      id: randomUUID(),
      key: `ocp_${randomUUID().replace(/-/g, '')}`,
      name,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt || null,
      lastUsed: null
    };

    user.apiKeys = user.apiKeys || [];
    user.apiKeys.push(apiKey);
    this.users.set(email, user);
    await this.save();

    return apiKey;
  }

  async listApiKeys(email) {
    const user = this.users.get(email);
    if (!user) return [];
    return (user.apiKeys || []).map(k => ({
      id: k.id,
      name: k.name,
      createdAt: k.createdAt,
      expiresAt: k.expiresAt,
      lastUsed: k.lastUsed,
      keyPreview: k.key.slice(0, 12) + '...'
    }));
  }

  async revokeApiKey(email, keyId) {
    const user = this.users.get(email);
    if (!user) {
      throw new Error('User not found');
    }

    user.apiKeys = (user.apiKeys || []).filter(k => k.id !== keyId);
    this.users.set(email, user);
    await this.save();
    return { success: true };
  }

  async validateApiKey(key) {
    for (const user of this.users.values()) {
      const apiKey = (user.apiKeys || []).find(k => k.key === key);
      if (apiKey) {
        if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
          return { valid: false, error: 'API key expired' };
        }
        apiKey.lastUsed = new Date().toISOString();
        this.users.set(user.email, user);
        await this.save();
        return { valid: true, user: this.sanitizeUser(user) };
      }
    }
    return { valid: false, error: 'Invalid API key' };
  }

  getRole(roleName) {
    return this.roles[roleName] || null;
  }

  listRoles() {
    return Object.entries(this.roles).map(([id, role]) => ({ id, ...role }));
  }

  createRole(id, { name, permissions, description }) {
    if (this.roles[id]) {
      throw new Error('Role already exists');
    }
    this.roles[id] = { name, permissions, description: description || '' };
    return this.roles[id];
  }

  updateRole(id, updates) {
    if (!this.roles[id]) {
      throw new Error('Role not found');
    }
    this.roles[id] = { ...this.roles[id], ...updates };
    return this.roles[id];
  }

  deleteRole(id) {
    if (DEFAULT_ROLES[id]) {
      throw new Error('Cannot delete default role');
    }
    delete this.roles[id];
    return { success: true };
  }

  hasPermission(user, permission) {
    const role = this.roles[user.role];
    if (!role) return false;

    if (role.permissions.includes('*')) return true;

    const [resource, action] = permission.split(':');
    
    for (const perm of role.permissions) {
      if (perm === permission) return true;
      if (perm === `${resource}:*`) return true;
      if (perm === `*:${action}`) return true;
    }

    return false;
  }

  checkPermission(user, permission) {
    if (!this.hasPermission(user, permission)) {
      throw new Error(`Permission denied: ${permission}`);
    }
    return true;
  }

  getPermissions(user) {
    const role = this.roles[user.role];
    if (!role) return [];
    return role.permissions;
  }
}

export const userManager = new UserManager(join(process.cwd(), 'data'));
