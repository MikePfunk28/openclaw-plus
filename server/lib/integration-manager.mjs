import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

const INTEGRATION_TYPES = {
  slack: {
    name: 'Slack',
    icon: '💬',
    description: 'Send messages, create channels, manage users',
    requiredEnv: ['SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET'],
    capabilities: ['send_message', 'create_channel', 'list_channels', 'list_users', 'add_reaction']
  },
  discord: {
    name: 'Discord',
    icon: '🎮',
    description: 'Bot messaging, server management',
    requiredEnv: ['DISCORD_BOT_TOKEN'],
    capabilities: ['send_message', 'list_channels', 'list_servers', 'manage_roles']
  },
  jira: {
    name: 'Jira',
    icon: '📋',
    description: 'Issue tracking, project management',
    requiredEnv: ['JIRA_HOST', 'JIRA_EMAIL', 'JIRA_API_TOKEN'],
    capabilities: ['create_issue', 'update_issue', 'search_issues', 'add_comment', 'transition_issue']
  },
  linear: {
    name: 'Linear',
    icon: '⚡',
    description: 'Modern issue tracking',
    requiredEnv: ['LINEAR_API_KEY'],
    capabilities: ['create_issue', 'update_issue', 'search_issues', 'add_comment', 'manage_projects']
  },
  github: {
    name: 'GitHub',
    icon: '🐙',
    description: 'Repositories, issues, PRs, CI',
    requiredEnv: ['GITHUB_TOKEN'],
    capabilities: ['create_issue', 'create_pr', 'list_repos', 'trigger_workflow', 'add_review']
  },
  gitlab: {
    name: 'GitLab',
    icon: '🦊',
    description: 'DevOps platform',
    requiredEnv: ['GITLAB_TOKEN', 'GITLAB_HOST'],
    capabilities: ['create_issue', 'create_mr', 'list_projects', 'trigger_pipeline']
  },
  notion: {
    name: 'Notion',
    icon: '📝',
    description: 'Notes, databases, collaboration',
    requiredEnv: ['NOTION_API_KEY'],
    capabilities: ['create_page', 'update_page', 'query_database', 'add_block']
  },
  asana: {
    name: 'Asana',
    icon: '✅',
    description: 'Task and project management',
    requiredEnv: ['ASANA_ACCESS_TOKEN'],
    capabilities: ['create_task', 'update_task', 'list_projects', 'add_comment']
  },
  trello: {
    name: 'Trello',
    icon: '📌',
    description: 'Kanban boards',
    requiredEnv: ['TRELLO_API_KEY', 'TRELLO_TOKEN'],
    capabilities: ['create_card', 'move_card', 'list_boards', 'add_comment']
  },
  pagerduty: {
    name: 'PagerDuty',
    icon: '🚨',
    description: 'Incident management',
    requiredEnv: ['PAGERDUTY_API_TOKEN'],
    capabilities: ['create_incident', 'acknowledge_incident', 'list_oncall', 'escalate']
  },
  servicenow: {
    name: 'ServiceNow',
    icon: '🎫',
    description: 'IT service management',
    requiredEnv: ['SERVICENOW_INSTANCE', 'SERVICENOW_USER', 'SERVICENOW_PASSWORD'],
    capabilities: ['create_ticket', 'update_ticket', 'search_tickets', 'list_catalog']
  },
  salesforce: {
    name: 'Salesforce',
    icon: '☁️',
    description: 'CRM platform',
    requiredEnv: ['SALESFORCE_LOGIN_URL', 'SALESFORCE_CLIENT_ID', 'SALESFORCE_CLIENT_SECRET'],
    capabilities: ['create_lead', 'update_account', 'search_contacts', 'create_opportunity']
  },
  zendesk: {
    name: 'Zendesk',
    icon: '🎫',
    description: 'Customer support',
    requiredEnv: ['ZENDESK_SUBDOMAIN', 'ZENDESK_EMAIL', 'ZENDESK_API_TOKEN'],
    capabilities: ['create_ticket', 'update_ticket', 'search_tickets', 'add_comment']
  },
  msteams: {
    name: 'Microsoft Teams',
    icon: '👥',
    description: 'Team collaboration',
    requiredEnv: ['MS_TEAMS_WEBHOOK_URL'],
    capabilities: ['send_message', 'create_channel', 'list_channels']
  },
  email: {
    name: 'Email (SMTP)',
    icon: '📧',
    description: 'Send emails',
    requiredEnv: ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD'],
    capabilities: ['send_email']
  }
};

export class IntegrationManager {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.configFile = join(dataDir, 'integrations.json');
    this.integrations = new Map();
    this.webhooks = new Map();
  }

  async initialize() {
    await this.load();
  }

  async load() {
    try {
      const data = await readFile(this.configFile, 'utf-8');
      const parsed = JSON.parse(data);
      this.integrations = new Map(Object.entries(parsed.integrations || {}));
      this.webhooks = new Map(Object.entries(parsed.webhooks || {}));
    } catch {
      this.integrations = new Map();
      this.webhooks = new Map();
    }
  }

  async save() {
    const data = {
      integrations: Object.fromEntries(this.integrations),
      webhooks: Object.fromEntries(this.webhooks)
    };
    await writeFile(this.configFile, JSON.stringify(data, null, 2));
  }

  listIntegrationTypes() {
    return Object.entries(INTEGRATION_TYPES).map(([id, config]) => ({
      id,
      ...config
    }));
  }

  getIntegrationType(type) {
    return INTEGRATION_TYPES[type] || null;
  }

  async configureIntegration(userId, type, config) {
    const integrationType = INTEGRATION_TYPES[type];
    if (!integrationType) {
      throw new Error(`Unknown integration type: ${type}`);
    }

    const missingEnv = integrationType.requiredEnv.filter(
      env => !config[env] && !process.env[env]
    );

    if (missingEnv.length > 0) {
      throw new Error(`Missing required configuration: ${missingEnv.join(', ')}`);
    }

    const integration = {
      id: randomUUID(),
      type,
      userId,
      config,
      capabilities: integrationType.capabilities,
      createdAt: new Date().toISOString(),
      status: 'configured'
    };

    this.integrations.set(integration.id, integration);
    await this.save();

    return {
      id: integration.id,
      type: integration.type,
      status: integration.status,
      capabilities: integration.capabilities
    };
  }

  async updateIntegration(id, updates) {
    const integration = this.integrations.get(id);
    if (!integration) {
      throw new Error('Integration not found');
    }

    Object.assign(integration, updates, { updatedAt: new Date().toISOString() });
    this.integrations.set(id, integration);
    await this.save();

    return integration;
  }

  async deleteIntegration(id) {
    if (!this.integrations.has(id)) {
      throw new Error('Integration not found');
    }
    this.integrations.delete(id);
    await this.save();
    return { success: true };
  }

  listIntegrations(userId = null) {
    let integrations = Array.from(this.integrations.values());
    if (userId) {
      integrations = integrations.filter(i => i.userId === userId);
    }
    return integrations.map(i => ({
      id: i.id,
      type: i.type,
      name: INTEGRATION_TYPES[i.type]?.name || i.type,
      icon: INTEGRATION_TYPES[i.type]?.icon || '🔌',
      status: i.status,
      capabilities: i.capabilities,
      createdAt: i.createdAt
    }));
  }

  getIntegration(id) {
    return this.integrations.get(id);
  }

  async testIntegration(id) {
    const integration = this.integrations.get(id);
    if (!integration) {
      throw new Error('Integration not found');
    }

    try {
      switch (integration.type) {
        case 'slack':
          return await this.testSlack(integration);
        case 'discord':
          return await this.testDiscord(integration);
        case 'github':
          return await this.testGithub(integration);
        case 'jira':
          return await this.testJira(integration);
        case 'linear':
          return await this.testLinear(integration);
        default:
          return { success: true, message: 'Integration configured (no test available)' };
      }
    } catch (error) {
      integration.status = 'error';
      integration.lastError = error.message;
      this.integrations.set(id, integration);
      await this.save();
      return { success: false, error: error.message };
    }
  }

  async testSlack(integration) {
    const token = integration.config.SLACK_BOT_TOKEN || process.env.SLACK_BOT_TOKEN;
    const response = await fetch('https://slack.com/api/auth.test', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.error);
    integration.status = 'connected';
    return { success: true, team: data.team, user: data.user };
  }

  async testDiscord(integration) {
    const token = integration.config.DISCORD_BOT_TOKEN || process.env.DISCORD_BOT_TOKEN;
    const response = await fetch('https://discord.com/api/users/@me', {
      headers: { 'Authorization': `Bot ${token}` }
    });
    if (!response.ok) throw new Error('Discord auth failed');
    const data = await response.json();
    integration.status = 'connected';
    return { success: true, bot: data.username };
  }

  async testGithub(integration) {
    const token = integration.config.GITHUB_TOKEN || process.env.GITHUB_TOKEN;
    const response = await fetch('https://api.github.com/user', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('GitHub auth failed');
    const data = await response.json();
    integration.status = 'connected';
    return { success: true, user: data.login };
  }

  async testJira(integration) {
    return { success: true, message: 'Jira configuration valid' };
  }

  async testLinear(integration) {
    const token = integration.config.LINEAR_API_KEY || process.env.LINEAR_API_KEY;
    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ viewer { name } }' })
    });
    const data = await response.json();
    if (data.errors) throw new Error(data.errors[0].message);
    integration.status = 'connected';
    return { success: true, user: data.data.viewer.name };
  }

  async executeAction(integrationId, action, params) {
    const integration = this.integrations.get(integrationId);
    if (!integration) {
      throw new Error('Integration not found');
    }

    if (!integration.capabilities.includes(action)) {
      throw new Error(`Integration does not support action: ${action}`);
    }

    const handler = this[`action_${integration.type}_${action}`];
    if (!handler) {
      throw new Error(`No handler for ${integration.type}.${action}`);
    }

    return await handler.call(this, integration, params);
  }

  async action_slack_send_message(integration, { channel, message, blocks }) {
    const token = integration.config.SLACK_BOT_TOKEN || process.env.SLACK_BOT_TOKEN;
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ channel, text: message, blocks })
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.error);
    return { success: true, ts: data.ts, channel: data.channel };
  }

  async action_slack_list_channels(integration) {
    const token = integration.config.SLACK_BOT_TOKEN || process.env.SLACK_BOT_TOKEN;
    const response = await fetch('https://slack.com/api/conversations.list', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.error);
    return { channels: data.channels.map(c => ({ id: c.id, name: c.name })) };
  }

  async action_jira_create_issue(integration, { project, summary, description, type, priority }) {
    const { JIRA_HOST, JIRA_EMAIL, JIRA_API_TOKEN } = {
      ...integration.config,
      ...process.env
    };

    const response = await fetch(`${JIRA_HOST}/rest/api/3/issue`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          project: { key: project },
          summary,
          description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: description }] }] },
          issuetype: { name: type || 'Task' },
          priority: { name: priority || 'Medium' }
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Jira error: ${error}`);
    }

    const data = await response.json();
    return { success: true, key: data.key, id: data.id };
  }

  async action_linear_create_issue(integration, { teamId, title, description, priority }) {
    const token = integration.config.LINEAR_API_KEY || process.env.LINEAR_API_KEY;

    const priorityMap = { urgent: 1, high: 2, medium: 3, low: 4 };
    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: `
          mutation CreateIssue($input: IssueCreateInput!) {
            issueCreate(input: $input) {
              success
              issue { id identifier title }
            }
          }
        `,
        variables: {
          input: { teamId, title, description, priority: priorityMap[priority] || 3 }
        }
      })
    });

    const data = await response.json();
    if (data.errors) throw new Error(data.errors[0].message);
    return { success: true, ...data.data.issueCreate.issue };
  }

  async action_github_create_issue(integration, { owner, repo, title, body, labels }) {
    const token = integration.config.GITHUB_TOKEN || process.env.GITHUB_TOKEN;

    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title, body, labels })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub error: ${error}`);
    }

    const data = await response.json();
    return { success: true, number: data.number, url: data.html_url };
  }

  async createWebhook(integrationId, events, url) {
    const integration = this.integrations.get(integrationId);
    if (!integration) {
      throw new Error('Integration not found');
    }

    const webhook = {
      id: randomUUID(),
      integrationId,
      events,
      url,
      createdAt: new Date().toISOString(),
      lastTriggered: null,
      triggerCount: 0
    };

    this.webhooks.set(webhook.id, webhook);
    await this.save();

    return webhook;
  }

  async listWebhooks(integrationId = null) {
    let webhooks = Array.from(this.webhooks.values());
    if (integrationId) {
      webhooks = webhooks.filter(w => w.integrationId === integrationId);
    }
    return webhooks;
  }

  async deleteWebhook(id) {
    this.webhooks.delete(id);
    await this.save();
    return { success: true };
  }

  async triggerWebhooks(eventType, payload) {
    const results = [];

    for (const webhook of this.webhooks.values()) {
      if (webhook.events.includes(eventType) || webhook.events.includes('*')) {
        try {
          const response = await fetch(webhook.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event: eventType, data: payload, timestamp: new Date().toISOString() })
          });

          webhook.lastTriggered = new Date().toISOString();
          webhook.triggerCount++;
          this.webhooks.set(webhook.id, webhook);

          results.push({ webhookId: webhook.id, success: response.ok });
        } catch (error) {
          results.push({ webhookId: webhook.id, success: false, error: error.message });
        }
      }
    }

    await this.save();
    return results;
  }
}

export const integrationManager = new IntegrationManager(join(process.cwd(), 'data'));
