import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { EXPERT_DOMAINS } from "./expert-router.mjs";
import { INDUSTRY_WORKFLOWS } from "./industry-workflows.mjs";

export const INDUSTRY_THEMES = {
  real_estate: {
    primaryColor: "#2563eb",
    secondaryColor: "#059669",
    accentColor: "#f59e0b",
    logo: "🏠",
    heroTitle: "AI Real Estate Assistant",
    heroSubtitle: "Valuations, listings, and market analysis in seconds",
    ctaText: "Get Started Free",
    features: [
      { icon: "📊", title: "Property Valuations", desc: "Instant comps and market analysis" },
      { icon: "✍️", title: "Listing Generator", desc: "Compelling descriptions that sell" },
      { icon: "📈", title: "Market Reports", desc: "Stay ahead with local insights" }
    ]
  },
  legal: {
    primaryColor: "#7c3aed",
    secondaryColor: "#4f46e5",
    accentColor: "#06b6d4",
    logo: "⚖️",
    heroTitle: "AI Legal Assistant",
    heroSubtitle: "Contract review and legal research, simplified",
    ctaText: "Start Free Trial",
    features: [
      { icon: "📋", title: "Contract Review", desc: "Identify issues in minutes" },
      { icon: "📝", title: "Document Generator", desc: "NDAs, agreements, and more" },
      { icon: "🔍", title: "Legal Research", desc: "Find relevant cases and statutes" }
    ]
  },
  marketing: {
    primaryColor: "#ec4899",
    secondaryColor: "#f43f5e",
    accentColor: "#8b5cf6",
    logo: "📈",
    heroTitle: "AI Marketing Assistant",
    heroSubtitle: "Content, campaigns, and copy that converts",
    ctaText: "Create Content Now",
    features: [
      { icon: "📅", title: "Content Calendar", desc: "30 days of posts in minutes" },
      { icon: "📧", title: "Email Sequences", desc: "Nurture leads automatically" },
      { icon: "🎯", title: "Ad Copy", desc: "High-converting ads for any platform" }
    ]
  },
  sales: {
    primaryColor: "#f97316",
    secondaryColor: "#ef4444",
    accentColor: "#eab308",
    logo: "🤝",
    heroTitle: "AI Sales Assistant",
    heroSubtitle: "More outreach, more meetings, more deals",
    ctaText: "Start Closing More",
    features: [
      { icon: "📧", title: "Cold Outreach", desc: "Personalized sequences at scale" },
      { icon: "📞", title: "Call Prep", desc: "Never go into a call unprepared" },
      { icon: "📄", title: "Proposals", desc: "Professional proposals in minutes" }
    ]
  },
  hr: {
    primaryColor: "#0891b2",
    secondaryColor: "#0d9488",
    accentColor: "#6366f1",
    logo: "👥",
    heroTitle: "AI HR Assistant",
    heroSubtitle: "Hire faster, onboard better, retain longer",
    ctaText: "Transform Your Hiring",
    features: [
      { icon: "📝", title: "Job Descriptions", desc: "Attract the right talent" },
      { icon: "🎤", title: "Interview Guides", desc: "Ask the right questions" },
      { icon: "🚀", title: "Onboarding", desc: "Set new hires up for success" }
    ]
  },
  finance: {
    primaryColor: "#10b981",
    secondaryColor: "#14b8a6",
    accentColor: "#f59e0b",
    logo: "💰",
    heroTitle: "AI Finance Assistant",
    heroSubtitle: "Investment analysis and portfolio insights",
    ctaText: "Analyze Now",
    features: [
      { icon: "📈", title: "Stock Analysis", desc: "Deep dives on any ticker" },
      { icon: "📊", title: "Portfolio Review", desc: "Optimize your allocation" },
      { icon: "🎯", title: "Risk Assessment", desc: "Understand your exposure" }
    ]
  },
  code: {
    primaryColor: "#6366f1",
    secondaryColor: "#8b5cf6",
    accentColor: "#06b6d4",
    logo: "💻",
    heroTitle: "AI Code Assistant",
    heroSubtitle: "Review, debug, and ship faster",
    ctaText: "Start Building",
    features: [
      { icon: "🔍", title: "Code Review", desc: "Catch issues before production" },
      { icon: "🔌", title: "API Design", desc: "Design clean interfaces" },
      { icon: "🧪", title: "Test Generation", desc: "Comprehensive test coverage" }
    ]
  },
  medical: {
    primaryColor: "#ef4444",
    secondaryColor: "#f97316",
    accentColor: "#22c55e",
    logo: "🏥",
    heroTitle: "AI Medical Assistant",
    heroSubtitle: "Medical information and research support",
    ctaText: "Learn More",
    features: [
      { icon: "🔍", title: "Symptom Analysis", desc: "Understand possibilities" },
      { icon: "💊", title: "Drug Information", desc: "Interactions and dosages" },
      { icon: "📚", title: "Research", desc: "Latest clinical findings" }
    ]
  },
  data_science: {
    primaryColor: "#8b5cf6",
    secondaryColor: "#a855f7",
    accentColor: "#ec4899",
    logo: "🔬",
    heroTitle: "AI Data Science Assistant",
    heroSubtitle: "Analyze, visualize, and predict",
    ctaText: "Start Analyzing",
    features: [
      { icon: "📊", title: "Data Analysis", desc: "Extract insights from any dataset" },
      { icon: "🤖", title: "ML Models", desc: "Build and evaluate models" },
      { icon: "📈", title: "Visualization", desc: "Beautiful charts and reports" }
    ]
  }
};

export class WrapperGenerator {
  constructor(outputDir) {
    this.outputDir = outputDir;
  }

  async generateWrapper(industryId, options = {}) {
    const expert = EXPERT_DOMAINS[industryId];
    const workflows = INDUSTRY_WORKFLOWS[industryId];
    const theme = INDUSTRY_THEMES[industryId];

    if (!expert || !theme) {
      throw new Error(`Unknown industry: ${industryId}`);
    }

    const wrapperDir = path.join(this.outputDir, `wrapper-${industryId}`);
    
    if (!existsSync(wrapperDir)) {
      await mkdir(wrapperDir, { recursive: true });
    }

    const config = {
      id: `wrapper-${industryId}`,
      name: options.name || `${expert.name} Pro`,
      industry: industryId,
      tagline: theme.heroSubtitle,
      domain: options.domain || `${industryId}.yourcompany.com`,
      pricing: options.pricing || { monthly: 49, yearly: 470 },
      expert,
      workflows: workflows?.workflows || [],
      templates: workflows?.templates || {},
      theme,
      createdAt: new Date().toISOString()
    };

    await writeFile(
      path.join(wrapperDir, "config.json"),
      JSON.stringify(config, null, 2)
    );

    const landingPage = this.generateLandingPage(config);
    await writeFile(path.join(wrapperDir, "index.html"), landingPage);

    const appJs = this.generateAppJs(config);
    await writeFile(path.join(wrapperDir, "app.js"), appJs);

    const styles = this.generateStyles(config);
    await writeFile(path.join(wrapperDir, "styles.css"), styles);

    const serverCode = this.generateServer(config);
    await writeFile(path.join(wrapperDir, "server.js"), serverCode);

    const packageJson = {
      name: `wrapper-${industryId}`,
      version: "1.0.0",
      scripts: {
        start: "node server.js",
        dev: "node server.js"
      },
      dependencies: {
        express: "^4.18.2",
        cors: "^2.8.5"
      }
    };
    await writeFile(path.join(wrapperDir, "package.json"), JSON.stringify(packageJson, null, 2));

    return {
      path: wrapperDir,
      config,
      files: ["config.json", "index.html", "app.js", "styles.css", "server.js", "package.json"]
    };
  }

  generateLandingPage(config) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${config.name} - ${config.tagline}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <link href="styles.css" rel="stylesheet">
</head>
<body>
    <nav class="navbar">
        <div class="container nav-content">
            <div class="logo">${config.theme.logo} ${config.name}</div>
            <div class="nav-links">
                <a href="#features">Features</a>
                <a href="#pricing">Pricing</a>
                <a href="/app" class="btn-primary">Launch App</a>
            </div>
        </div>
    </nav>

    <section class="hero">
        <div class="container">
            <h1>${config.theme.heroTitle}</h1>
            <p class="subtitle">${config.theme.heroSubtitle}</p>
            <a href="/app" class="cta-button">${config.theme.ctaText}</a>
            <p class="trial-note">No credit card required</p>
        </div>
    </section>

    <section id="features" class="features">
        <div class="container">
            <h2>Everything you need</h2>
            <div class="features-grid">
                ${config.theme.features.map(f => `
                <div class="feature-card">
                    <div class="feature-icon">${f.icon}</div>
                    <h3>${f.title}</h3>
                    <p>${f.desc}</p>
                </div>
                `).join("")}
            </div>
        </div>
    </section>

    <section id="pricing" class="pricing">
        <div class="container">
            <h2>Simple Pricing</h2>
            <div class="pricing-cards">
                <div class="pricing-card">
                    <h3>Monthly</h3>
                    <div class="price">$${config.pricing.monthly}<span>/mo</span></div>
                    <ul>
                        <li>Unlimited queries</li>
                        <li>All workflows</li>
                        <li>Email support</li>
                    </ul>
                    <a href="/app" class="btn-secondary">Get Started</a>
                </div>
                <div class="pricing-card featured">
                    <div class="badge">Best Value</div>
                    <h3>Yearly</h3>
                    <div class="price">$${Math.round(config.pricing.yearly / 12)}<span>/mo</span></div>
                    <p class="billed">Billed $${config.pricing.yearly}/year</p>
                    <ul>
                        <li>Unlimited queries</li>
                        <li>All workflows</li>
                        <li>Priority support</li>
                        <li>API access</li>
                    </ul>
                    <a href="/app" class="btn-primary">Get Started</a>
                </div>
            </div>
        </div>
    </section>

    <section class="cta-section">
        <div class="container">
            <h2>Ready to get started?</h2>
            <p>Join thousands of professionals using AI to work smarter.</p>
            <a href="/app" class="cta-button">Start Free Trial</a>
        </div>
    </section>

    <footer>
        <div class="container">
            <p>&copy; ${new Date().getFullYear()} ${config.name}. All rights reserved.</p>
        </div>
    </footer>
</body>
</html>`;
  }

  generateStyles(config) {
    return `:root {
    --primary: ${config.theme.primaryColor};
    --secondary: ${config.theme.secondaryColor};
    --accent: ${config.theme.accentColor};
    --dark: #0f172a;
    --light: #f8fafc;
}

* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Inter', sans-serif; background: var(--light); color: var(--dark); }
.container { max-width: 1200px; margin: 0 auto; padding: 0 24px; }

.navbar { position: fixed; top: 0; left: 0; right: 0; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1); z-index: 100; }
.nav-content { display: flex; justify-content: space-between; align-items: center; height: 64px; }
.logo { font-size: 1.25rem; font-weight: 700; color: var(--primary); }
.nav-links { display: flex; gap: 32px; align-items: center; }
.nav-links a { text-decoration: none; color: var(--dark); font-weight: 500; }

.btn-primary { background: var(--primary); color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; }
.btn-primary:hover { background: var(--secondary); }
.btn-secondary { border: 2px solid var(--primary); color: var(--primary); padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; }
.btn-secondary:hover { background: var(--primary); color: white; }

.hero { padding: 160px 0 100px; text-align: center; background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%); color: white; }
.hero h1 { font-size: 3.5rem; margin-bottom: 16px; }
.subtitle { font-size: 1.5rem; opacity: 0.9; margin-bottom: 32px; }
.cta-button { display: inline-block; background: white; color: var(--primary); padding: 16px 40px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 1.1rem; }
.cta-button:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
.trial-note { margin-top: 16px; opacity: 0.8; }

.features { padding: 100px 0; }
.features h2 { text-align: center; font-size: 2.5rem; margin-bottom: 60px; }
.features-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 32px; }
.feature-card { background: white; padding: 40px; border-radius: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); text-align: center; }
.feature-icon { font-size: 3rem; margin-bottom: 16px; }
.feature-card h3 { font-size: 1.25rem; margin-bottom: 8px; }
.feature-card p { color: #64748b; }

.pricing { padding: 100px 0; background: white; }
.pricing h2 { text-align: center; font-size: 2.5rem; margin-bottom: 60px; }
.pricing-cards { display: flex; justify-content: center; gap: 32px; flex-wrap: wrap; }
.pricing-card { background: var(--light); padding: 40px; border-radius: 16px; width: 320px; text-align: center; position: relative; }
.pricing-card.featured { border: 2px solid var(--primary); transform: scale(1.05); }
.pricing-card .badge { position: absolute; top: -12px; left: 50%; transform: translateX(-50%); background: var(--accent); color: white; padding: 4px 16px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; }
.pricing-card h3 { font-size: 1.25rem; margin-bottom: 16px; }
.price { font-size: 3rem; font-weight: 800; color: var(--primary); }
.price span { font-size: 1rem; font-weight: 400; color: #64748b; }
.billed { color: #64748b; font-size: 0.9rem; margin-bottom: 24px; }
.pricing-card ul { list-style: none; margin: 24px 0; text-align: left; }
.pricing-card li { padding: 8px 0; padding-left: 24px; position: relative; }
.pricing-card li:before { content: "✓"; position: absolute; left: 0; color: var(--primary); font-weight: bold; }

.cta-section { padding: 100px 0; text-align: center; background: linear-gradient(135deg, var(--secondary) 0%, var(--primary) 100%); color: white; }
.cta-section h2 { font-size: 2.5rem; margin-bottom: 16px; }
.cta-section p { font-size: 1.25rem; opacity: 0.9; margin-bottom: 32px; }
.cta-section .cta-button { background: white; color: var(--primary); }

footer { padding: 40px 0; text-align: center; background: var(--dark); color: white; }

@media (max-width: 768px) {
    .hero h1 { font-size: 2.5rem; }
    .subtitle { font-size: 1.2rem; }
    .pricing-card.featured { transform: none; }
}`;
  }

  generateAppJs(config) {
    return `const API_BASE = window.location.origin;
let currentExpert = '${config.industry}';
let sessionId = null;

async function init() {
    sessionId = 'session-' + Date.now();
    await loadWorkflows();
    setupChat();
}

async function loadWorkflows() {
    const workflowsEl = document.getElementById('workflows');
    if (!workflowsEl) return;
    
    const workflows = ${JSON.stringify(config.workflows)};
    
    workflowsEl.innerHTML = workflows.map(w => \`
        <div class="workflow-card" onclick="runWorkflow('\${w.id}')">
            <div class="workflow-icon">\${w.icon}</div>
            <div class="workflow-info">
                <h4>\${w.name}</h4>
                <p>\${w.description}</p>
            </div>
        </div>
    \`).join('');
}

function setupChat() {
    const form = document.getElementById('chat-form');
    const input = document.getElementById('chat-input');
    const messages = document.getElementById('messages');
    
    if (!form) return;
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const message = input.value.trim();
        if (!message) return;
        
        addMessage('user', message);
        input.value = '';
        
        try {
            const response = await fetch(API_BASE + '/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, sessionId, expert: currentExpert })
            });
            
            const data = await response.json();
            addMessage('assistant', data.response);
        } catch (error) {
            addMessage('assistant', 'Sorry, there was an error. Please try again.');
        }
    });
}

function addMessage(role, content) {
    const messages = document.getElementById('messages');
    const div = document.createElement('div');
    div.className = 'message ' + role;
    div.textContent = content;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
}

async function runWorkflow(workflowId) {
    const workflows = ${JSON.stringify(config.workflows)};
    const workflow = workflows.find(w => w.id === workflowId);
    if (!workflow) return;
    
    const modal = document.getElementById('workflow-modal');
    const form = document.getElementById('workflow-form');
    const title = document.getElementById('modal-title');
    
    title.textContent = workflow.name;
    form.innerHTML = workflow.inputs.map(input => \`
        <div class="form-group">
            <label>\${input.label}\${input.required ? ' *' : ''}</label>
            \${input.type === 'textarea' ? \`
                <textarea name="\${input.name}" \${input.required ? 'required' : ''}></textarea>
            \` : input.type === 'select' ? \`
                <select name="\${input.name}" \${input.required ? 'required' : ''}>
                    \${input.options.map(o => \`<option value="\${o}">\${o}</option>\`).join('')}
                </select>
            \` : \`
                <input type="\${input.type}" name="\${input.name}" \${input.required ? 'required' : ''}>
            \`}
        </div>
    \`).join('') + '<button type="submit" class="btn-primary">Run Workflow</button>';
    
    modal.classList.add('visible');
    
    form.onsubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const inputs = Object.fromEntries(formData);
        
        modal.classList.remove('visible');
        addMessage('user', 'Running: ' + workflow.name);
        
        try {
            const response = await fetch(API_BASE + '/api/workflow', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ workflowId, inputs, sessionId })
            });
            
            const data = await response.json();
            addMessage('assistant', data.result);
        } catch (error) {
            addMessage('assistant', 'Error running workflow. Please try again.');
        }
    };
}

function closeModal() {
    document.getElementById('workflow-modal').classList.remove('visible');
}

document.addEventListener('DOMContentLoaded', init);`;
  }

  generateServer(config) {
    return `const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const config = ${JSON.stringify(config)};

// Serve static files
app.use(express.static(__dirname));

// App page
app.get('/app', (req, res) => {
    res.send(\`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>\${config.name}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link href="styles.css" rel="stylesheet">
    <style>
        .app-layout { display: grid; grid-template-columns: 280px 1fr; height: 100vh; }
        .sidebar { background: #1e293b; color: white; padding: 24px; overflow-y: auto; }
        .main { display: flex; flex-direction: column; }
        .chat-area { flex: 1; overflow-y: auto; padding: 24px; background: #f8fafc; }
        .input-area { padding: 16px 24px; background: white; border-top: 1px solid #e2e8f0; }
        .sidebar h2 { font-size: 1rem; color: #94a3b8; margin-bottom: 16px; }
        .workflow-card { display: flex; gap: 12px; padding: 12px; background: rgba(255,255,255,0.1); border-radius: 8px; margin-bottom: 8px; cursor: pointer; }
        .workflow-card:hover { background: rgba(255,255,255,0.2); }
        .workflow-icon { font-size: 1.5rem; }
        .workflow-info h4 { font-size: 0.9rem; margin-bottom: 4px; }
        .workflow-info p { font-size: 0.75rem; color: #94a3b8; }
        #chat-form { display: flex; gap: 12px; }
        #chat-input { flex: 1; padding: 12px 16px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 1rem; }
        #chat-form button { padding: 12px 24px; background: \${config.theme.primaryColor}; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }
        .message { padding: 12px 16px; border-radius: 12px; margin-bottom: 12px; max-width: 80%; }
        .message.user { background: \${config.theme.primaryColor}; color: white; margin-left: auto; }
        .message.assistant { background: white; border: 1px solid #e2e8f0; }
        #workflow-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: none; justify-content: center; align-items: center; }
        #workflow-modal.visible { display: flex; }
        .modal-content { background: white; padding: 32px; border-radius: 16px; width: 90%; max-width: 500px; max-height: 80vh; overflow-y: auto; }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        .close-btn { background: none; border: none; font-size: 1.5rem; cursor: pointer; }
        .form-group { margin-bottom: 16px; }
        .form-group label { display: block; margin-bottom: 8px; font-weight: 500; }
        .form-group input, .form-group textarea, .form-group select { width: 100%; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 1rem; }
        .form-group textarea { min-height: 100px; resize: vertical; }
        .form-group button { width: 100%; margin-top: 8px; }
    </style>
</head>
<body>
    <div class="app-layout">
        <aside class="sidebar">
            <h1 style="font-size:1.25rem;margin-bottom:24px;">\${config.theme.logo} \${config.name}</h1>
            <h2>Workflows</h2>
            <div id="workflows"></div>
        </aside>
        <main class="main">
            <div id="messages" class="chat-area">
                <div class="message assistant">Hello! I'm your \${config.expert.name}. How can I help you today?</div>
            </div>
            <div class="input-area">
                <form id="chat-form">
                    <input type="text" id="chat-input" placeholder="Type your message..." autocomplete="off">
                    <button type="submit">Send</button>
                </form>
            </div>
        </main>
    </div>
    <div id="workflow-modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3 id="modal-title"></h3>
                <button class="close-btn" onclick="closeModal()">&times;</button>
            </div>
            <form id="workflow-form"></form>
        </div>
    </div>
    <script src="app.js"></script>
</body>
</html>\`);
});

// Chat endpoint - connect to OpenClaw Plus backend
app.post('/api/chat', async (req, res) => {
    const { message, sessionId, expert } = req.body;
    
    // Forward to OpenClaw Plus backend
    const OPENCLAW_URL = process.env.OPENCLAW_URL || 'http://localhost:8787';
    
    try {
        const response = await fetch(OPENCLAW_URL + '/api/run/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                objective: message,
                sessionId,
                expertId: expert,
                modelId: 'claude-sonnet'
            })
        });
        
        const data = await response.json();
        res.json({ response: data.answer || data.response || 'Processing...' });
    } catch (error) {
        // Fallback to direct expert response
        res.json({ 
            response: \`I'm your \${config.expert.name}. You asked: "\${message}"\\n\\nI'm ready to help! For full AI capabilities, connect this wrapper to the OpenClaw Plus backend.\`
        });
    }
});

// Workflow endpoint
app.post('/api/workflow', async (req, res) => {
    const { workflowId, inputs, sessionId } = req.body;
    
    const workflow = config.workflows.find(w => w.id === workflowId);
    if (!workflow) {
        res.status(404).json({ error: 'Workflow not found' });
        return;
    }
    
    // Format inputs into a prompt
    const inputSummary = Object.entries(inputs)
        .map(([k, v]) => \`- \${k}: \${v}\`)
        .join('\\n');
    
    const prompt = \`Execute workflow: \${workflow.name}\\n\\nInputs:\\n\${inputSummary}\\n\\nSteps:\\n\${workflow.steps.map(s => '- ' + s.type + ': ' + s.prompt).join('\\n')}\`;
    
    res.json({ result: \`Workflow "\${workflow.name}" executed with inputs:\\n\\n\${inputSummary}\\n\\nFor full execution, connect to OpenClaw Plus backend.\` });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(\`\${config.name} wrapper running on http://localhost:\${PORT}\`);
    console.log(\`Connect to OpenClaw Plus at: \${process.env.OPENCLAW_URL || 'http://localhost:8787'}\`);
});`;
  }

  listAvailableIndustries() {
    return Object.keys(EXPERT_DOMAINS).map(id => ({
      id,
      name: EXPERT_DOMAINS[id].name,
      icon: EXPERT_DOMAINS[id].icon,
      hasWorkflows: Boolean(INDUSTRY_WORKFLOWS[id]?.workflows?.length),
      hasTheme: Boolean(INDUSTRY_THEMES[id])
    }));
  }
}

export const wrapperGenerator = new WrapperGenerator("./wrappers");
