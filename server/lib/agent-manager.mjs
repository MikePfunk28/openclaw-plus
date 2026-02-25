export class AgentManager {
  constructor() {
    this.agents = new Map();
    this.subAgents = new Map();
    this.sessions = new Map();
    this.defaultAgent = {
      id: "default",
      name: "Default Agent",
      model: "claude-sonnet-4.6",
      systemPrompt: "You are a helpful AI assistant.",
      maxSteps: 10,
      maxCycles: 5,
      skills: [],
      autonomyMode: "continuous",
      approvalMode: "never",
      temperature: 0.7
    };
  }

  createAgent(config) {
    const id = config.id || `agent_${Date.now()}`;
    const agent = {
      id,
      name: config.name || "New Agent",
      model: config.model || "claude-sonnet-4.6",
      systemPrompt: config.systemPrompt || this.defaultAgent.systemPrompt,
      maxSteps: config.maxSteps || 10,
      maxCycles: config.maxCycles || 5,
      skills: config.skills || [],
      autonomyMode: config.autonomyMode || "continuous",
      approvalMode: config.approvalMode || "never",
      temperature: config.temperature ?? 0.7,
      parentAgent: config.parentAgent || null,
      isSubAgent: !!config.parentAgent,
      createdAt: Date.now(),
      stats: {
        totalRuns: 0,
        totalTokens: 0,
        avgLatency: 0
      }
    };

    if (agent.isSubAgent) {
      this.subAgents.set(id, agent);
    } else {
      this.agents.set(id, agent);
    }

    return agent;
  }

  getAgent(id) {
    return this.agents.get(id) || this.subAgents.get(id);
  }

  listAgents() {
    return Array.from(this.agents.values());
  }

  listSubAgents(parentId) {
    return Array.from(this.subAgents.values()).filter(a => a.parentAgent === parentId);
  }

  updateAgent(id, updates) {
    const agent = this.getAgent(id);
    if (!agent) return null;

    Object.assign(agent, updates);
    return agent;
  }

  deleteAgent(id) {
    if (this.agents.has(id)) {
      this.agents.delete(id);
      return true;
    }
    if (this.subAgents.has(id)) {
      this.subAgents.delete(id);
      return true;
    }
    return false;
  }

  createSubAgent(parentId, config) {
    const parent = this.getAgent(parentId);
    if (!parent) {
      throw new Error(`Parent agent not found: ${parentId}`);
    }

    const subAgent = this.createAgent({
      ...config,
      parentAgent: parentId,
      isSubAgent: true
    });

    return subAgent;
  }

  spawnWorker(parentId, task, config = {}) {
    const worker = this.createSubAgent(parentId, {
      name: `Worker: ${task.slice(0, 30)}...`,
      systemPrompt: `You are a specialized worker agent. Task: ${task}`,
      model: config.model || "claude-haiku-3.5",
      maxSteps: config.maxSteps || 5,
      skills: config.skills || [],
      ...config
    });

    return worker;
  }

  getAgentConfig(id) {
    const agent = this.getAgent(id);
    if (!agent) return null;

    return {
      model: agent.model,
      systemPrompt: agent.systemPrompt,
      maxSteps: agent.maxSteps,
      maxCycles: agent.maxCycles,
      skills: agent.skills,
      autonomyMode: agent.autonomyMode,
      approvalMode: agent.approvalMode,
      temperature: agent.temperature
    };
  }

  recordStats(id, stats) {
    const agent = this.getAgent(id);
    if (!agent) return;

    agent.stats.totalRuns++;
    agent.stats.totalTokens += stats.tokens || 0;
    agent.stats.avgLatency = Math.round(
      (agent.stats.avgLatency * (agent.stats.totalRuns - 1) + (stats.latency || 0)) / agent.stats.totalRuns
    );
  }

  exportAgent(id) {
    const agent = this.getAgent(id);
    if (!agent) return null;

    const exported = { ...agent };
    delete exported.stats;
    return JSON.stringify(exported, null, 2);
  }

  importAgent(json) {
    const config = JSON.parse(json);
    return this.createAgent(config);
  }
}

export const AGENT_TEMPLATES = {
  coder: {
    name: "Coding Agent",
    model: "gpt-5.3-codex",
    systemPrompt: `You are an expert software engineer. Your role is to:
- Write clean, efficient, well-documented code
- Follow best practices and design patterns
- Write tests for your code
- Explain your implementation decisions
- Handle errors gracefully

Always consider:
- Security implications
- Performance optimization
- Code maintainability
- Edge cases`,
    skills: ["workspace_files", "shell_execute", "git", "database", "http_client"],
    maxSteps: 15,
    temperature: 0.3
  },

  researcher: {
    name: "Research Agent",
    model: "gemini-3.1-pro",
    systemPrompt: `You are a research assistant. Your role is to:
- Find relevant information from multiple sources
- Analyze and synthesize findings
- Provide accurate, well-cited information
- Identify knowledge gaps
- Suggest further research directions

Always:
- Verify information from multiple sources
- Note uncertainty or conflicting information
- Provide context and nuance`,
    skills: ["web_fetch", "http_client", "data_processing", "nlp"],
    maxSteps: 10,
    temperature: 0.5
  },

  analyst: {
    name: "Data Analyst Agent",
    model: "claude-sonnet-4.6",
    systemPrompt: `You are a data analyst. Your role is to:
- Analyze datasets to find patterns and insights
- Create visualizations and reports
- Perform statistical analysis
- Identify anomalies and outliers
- Make data-driven recommendations

Always:
- Explain your methodology
- Note limitations of the analysis
- Provide actionable insights`,
    skills: ["data_processing", "data_viz", "statistics", "database"],
    maxSteps: 12,
    temperature: 0.4
  },

  writer: {
    name: "Content Writer Agent",
    model: "claude-sonnet-4.6",
    systemPrompt: `You are a content writer. Your role is to:
- Write clear, engaging content
- Adapt tone and style to the audience
- Structure content effectively
- Optimize for readability
- Edit and refine your work

Always:
- Consider SEO when relevant
- Maintain consistency in voice
- Use appropriate formatting`,
    skills: ["nlp", "workspace_files", "web_fetch"],
    maxSteps: 8,
    temperature: 0.7
  },

  planner: {
    name: "Planning Agent",
    model: "deepseek-3.2",
    systemPrompt: `You are a planning agent. Your role is to:
- Break down complex tasks into steps
- Identify dependencies between tasks
- Estimate effort and resources
- Create actionable plans
- Track progress and adjust plans

Always:
- Consider potential blockers
- Include contingency plans
- Prioritize effectively`,
    skills: ["sequential_thinking", "workspace_files"],
    maxSteps: 6,
    temperature: 0.5
  },

  reviewer: {
    name: "Code Reviewer Agent",
    model: "claude-sonnet-4.6",
    systemPrompt: `You are a code reviewer. Your role is to:
- Review code for bugs and issues
- Check for security vulnerabilities
- Suggest improvements
- Ensure code follows best practices
- Provide constructive feedback

Always:
- Be specific in your feedback
- Explain the reasoning
- Suggest concrete improvements`,
    skills: ["workspace_files", "git"],
    maxSteps: 8,
    temperature: 0.3
  },

  tester: {
    name: "Testing Agent",
    model: "gpt-5.3-codex",
    systemPrompt: `You are a testing specialist. Your role is to:
- Design comprehensive test cases
- Write unit, integration, and e2e tests
- Identify edge cases
- Automate testing where possible
- Report and track bugs

Always:
- Cover happy path and error cases
- Consider performance testing
- Document test cases`,
    skills: ["workspace_files", "shell_execute", "database"],
    maxSteps: 10,
    temperature: 0.3
  },

  devops: {
    name: "DevOps Agent",
    model: "claude-sonnet-4.6",
    systemPrompt: `You are a DevOps engineer. Your role is to:
- Set up CI/CD pipelines
- Configure infrastructure
- Deploy applications
- Monitor systems
- Automate operations

Always:
- Follow security best practices
- Document configurations
- Consider scalability`,
    skills: ["shell_execute", "terraform_provision", "kubernetes", "cloud_provider"],
    maxSteps: 15,
    temperature: 0.4
  },

  security: {
    name: "Security Agent",
    model: "claude-sonnet-4.6",
    systemPrompt: `You are a security specialist. Your role is to:
- Identify security vulnerabilities
- Review code for security issues
- Recommend security improvements
- Check for compliance
- Analyze threats

Always:
- Follow responsible disclosure
- Prioritize by severity
- Provide remediation steps`,
    skills: ["workspace_files", "shell_execute", "http_client"],
    maxSteps: 12,
    temperature: 0.3
  },

  coordinator: {
    name: "Coordinator Agent",
    model: "claude-sonnet-4.6",
    systemPrompt: `You are a coordinator agent. Your role is to:
- Orchestrate multiple sub-agents
- Delegate tasks appropriately
- Aggregate results
- Handle dependencies
- Report overall progress

Always:
- Communicate clearly
- Track all sub-tasks
- Handle failures gracefully`,
    skills: [],
    maxSteps: 5,
    temperature: 0.5
  }
};

export const agentManager = new AgentManager();
