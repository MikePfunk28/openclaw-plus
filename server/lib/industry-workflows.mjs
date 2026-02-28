export const INDUSTRY_WORKFLOWS = {
  real_estate: {
    id: "real_estate",
    name: "Real Estate Workflows",
    workflows: [
      {
        id: "property_valuation",
        name: "Property Valuation Report",
        description: "Generate comprehensive property valuation with comparables",
        icon: "📊",
        inputs: [
          { name: "address", type: "text", label: "Property Address", required: true },
          { name: "property_type", type: "select", label: "Property Type", options: ["Single Family", "Condo", "Multi-Family", "Land", "Commercial"] },
          { name: "bedrooms", type: "number", label: "Bedrooms" },
          { name: "bathrooms", type: "number", label: "Bathrooms" },
          { name: "sqft", type: "number", label: "Square Feet" }
        ],
        steps: [
          { type: "analyze", prompt: "Analyze property at {address}" },
          { type: "search", prompt: "Find comparable sales within 1 mile" },
          { type: "calculate", prompt: "Calculate price per sqft and estimated value" },
          { type: "report", prompt: "Generate professional valuation report" }
        ],
        outputFormat: "pdf_report"
      },
      {
        id: "buyer_qualification",
        name: "Buyer Pre-Qualification",
        description: "Assess buyer financial readiness",
        icon: "💰",
        inputs: [
          { name: "income", type: "number", label: "Annual Income", required: true },
          { name: "down_payment", type: "number", label: "Down Payment Available" },
          { name: "debts", type: "number", label: "Monthly Debt Payments" },
          { name: "credit_score", type: "select", label: "Credit Score Range", options: ["Excellent (740+)", "Good (700-739)", "Fair (650-699)", "Below 650"] }
        ],
        steps: [
          { type: "calculate", prompt: "Calculate DTI ratio and buying power" },
          { type: "search", prompt: "Find mortgage rates for {credit_score}" },
          { type: "recommend", prompt: "Recommend price range and loan types" }
        ],
        outputFormat: "summary"
      },
      {
        id: "listing_description",
        name: "Listing Description Generator",
        description: "Create compelling property listings",
        icon: "✍️",
        inputs: [
          { name: "address", type: "text", label: "Property Address", required: true },
          { name: "features", type: "textarea", label: "Key Features (comma separated)" },
          { name: "tone", type: "select", label: "Tone", options: ["Luxury", "Family-friendly", "Investment", "First-time buyer"] }
        ],
        steps: [
          { type: "generate", prompt: "Write compelling listing for {address} with features: {features}" },
          { type: "optimize", prompt: "Optimize for MLS and social media" }
        ],
        outputFormat: "text"
      },
      {
        id: "market_analysis",
        name: "Market Analysis Report",
        description: "Analyze local real estate market trends",
        icon: "📈",
        inputs: [
          { name: "zip_code", type: "text", label: "ZIP Code", required: true },
          { name: "timeframe", type: "select", label: "Timeframe", options: ["Last 30 days", "Last 90 days", "Last 6 months", "Last year"] }
        ],
        steps: [
          { type: "search", prompt: "Get market data for {zip_code}" },
          { type: "analyze", prompt: "Analyze price trends, inventory, days on market" },
          { type: "visualize", prompt: "Create charts showing trends" },
          { type: "report", prompt: "Generate market analysis summary" }
        ],
        outputFormat: "report"
      }
    ],
    templates: {
      email_buyer_followup: {
        name: "Buyer Follow-up Email",
        category: "email",
        template: `Hi {first_name},

Following up on our conversation about your home search in {area}. Based on your criteria:
- Budget: {budget}
- Bedrooms: {bedrooms}+
- Preferred areas: {areas}

I've identified {count} properties that match your needs. Would you be available for a call this {day} to discuss?

Best regards,
{agent_name}`
      },
      email_seller_update: {
        name: "Seller Weekly Update",
        category: "email",
        template: `Hi {first_name},

Here's your weekly listing update for {address}:

📊 This Week's Activity:
- Page views: {views}
- Saves: {saves}
- Showing requests: {showings}

📈 Market Comparison:
- Similar homes: {comparable_count}
- Average days on market: {avg_dom}
- Your listing: {days_listed} days

{recommendation}

Best regards,
{agent_name}`
      }
    },
    onboarding: {
      steps: [
        { title: "Welcome", content: "Set up your AI real estate assistant" },
        { title: "Your Profile", fields: ["name", "brokerage", "phone", "license_number"] },
        { title: "Service Area", fields: ["zip_codes", "property_types", "price_range"] },
        { title: "Connect MLS", description: "Optional: Connect your MLS for live data" },
        { title: "Ready!", content: "Start generating valuations, descriptions, and market reports" }
      ]
    }
  },

  legal: {
    id: "legal",
    name: "Legal Workflows",
    workflows: [
      {
        id: "contract_review",
        name: "Contract Quick Review",
        description: "Identify key terms and potential issues in contracts",
        icon: "📋",
        inputs: [
          { name: "contract_text", type: "textarea", label: "Paste Contract Text", required: true },
          { name: "contract_type", type: "select", label: "Contract Type", options: ["Employment", "Service Agreement", "NDA", "Lease", "Purchase", "Other"] },
          { name: "your_role", type: "select", label: "Your Role", options: ["Provider", "Client", "Employer", "Employee", "Landlord", "Tenant"] }
        ],
        steps: [
          { type: "extract", prompt: "Extract key terms: parties, dates, amounts, obligations" },
          { type: "analyze", prompt: "Identify potential issues for {your_role}" },
          { type: "summarize", prompt: "Create plain-language summary" },
          { type: "flag", prompt: "Flag clauses requiring attention" }
        ],
        outputFormat: "checklist"
      },
      {
        id: "nda_generator",
        name: "NDA Generator",
        description: "Create customized non-disclosure agreements",
        icon: "🔒",
        inputs: [
          { name: "disclosing_party", type: "text", label: "Disclosing Party Name", required: true },
          { name: "receiving_party", type: "text", label: "Receiving Party Name", required: true },
          { name: "purpose", type: "textarea", label: "Purpose of Disclosure" },
          { name: "duration", type: "select", label: "Duration", options: ["1 year", "2 years", "3 years", "5 years", "Perpetual"] }
        ],
        steps: [
          { type: "generate", prompt: "Generate mutual NDA with specified terms" },
          { type: "review", prompt: "Ensure standard protective clauses included" }
        ],
        outputFormat: "document"
      }
    ],
    templates: {
      engagement_letter: {
        name: "Client Engagement Letter",
        category: "document",
        template: `{date}

{client_name}
{client_address}

Re: Engagement for Legal Services

Dear {client_name},

This letter confirms our engagement to represent you in connection with {matter_description}.

SCOPE OF REPRESENTATION:
{scope}

FEES AND BILLING:
{fee_structure}

Please sign below to confirm this engagement.

Sincerely,
{attorney_name}`
      }
    },
    onboarding: {
      steps: [
        { title: "Welcome", content: "Set up your legal AI assistant" },
        { title: "Practice Area", fields: ["practice_areas", "jurisdiction", "bar_number"] },
        { title: "Document Preferences", fields: ["default_state", "include_disclaimers"] },
        { title: "Ready!", content: "Start reviewing contracts and generating documents" }
      ]
    }
  },

  marketing: {
    id: "marketing",
    name: "Marketing Workflows",
    workflows: [
      {
        id: "content_calendar",
        name: "30-Day Content Calendar",
        description: "Generate a month of social media content",
        icon: "📅",
        inputs: [
          { name: "business_type", type: "text", label: "Business Type", required: true },
          { name: "platforms", type: "multiselect", label: "Platforms", options: ["Instagram", "LinkedIn", "Twitter/X", "Facebook", "TikTok"] },
          { name: "tone", type: "select", label: "Brand Voice", options: ["Professional", "Casual", "Humorous", "Inspirational", "Educational"] },
          { name: "goals", type: "textarea", label: "Marketing Goals" }
        ],
        steps: [
          { type: "plan", prompt: "Create 30-day content strategy for {business_type}" },
          { type: "generate", prompt: "Write posts for each day with hashtags" },
          { type: "schedule", prompt: "Optimize posting times for each platform" }
        ],
        outputFormat: "calendar"
      },
      {
        id: "email_sequence",
        name: "Email Sequence Generator",
        description: "Create automated email nurture sequences",
        icon: "📧",
        inputs: [
          { name: "product_service", type: "text", label: "Product/Service", required: true },
          { name: "target_audience", type: "textarea", label: "Target Audience Description" },
          { name: "sequence_length", type: "select", label: "Sequence Length", options: ["3 emails", "5 emails", "7 emails", "10 emails"] },
          { name: "goal", type: "select", label: "Sequence Goal", options: ["Welcome", "Sales", "Re-engagement", "Product Launch", "Webinar"] }
        ],
        steps: [
          { type: "plan", prompt: "Plan email sequence strategy for {goal}" },
          { type: "generate", prompt: "Write {sequence_length} with subject lines" },
          { type: "optimize", prompt: "Add CTAs and personalization tokens" }
        ],
        outputFormat: "document"
      },
      {
        id: "ad_copy",
        name: "Ad Copy Generator",
        description: "Generate high-converting ad copy",
        icon: "🎯",
        inputs: [
          { name: "product", type: "text", label: "Product/Service", required: true },
          { name: "platform", type: "select", label: "Platform", options: ["Facebook", "Google", "LinkedIn", "Instagram", "TikTok"] },
          { name: "offer", type: "textarea", label: "Your Offer" },
          { name: "audience", type: "textarea", label: "Target Audience" }
        ],
        steps: [
          { type: "analyze", prompt: "Identify pain points and hooks for {audience}" },
          { type: "generate", prompt: "Create 5 ad variations with headlines and body copy" },
          { type: "optimize", prompt: "Add emojis, CTAs, and character count for {platform}" }
        ],
        outputFormat: "text"
      }
    ],
    templates: {
      social_post: {
        name: "Social Media Post",
        category: "social",
        template: `{hook}

{main_content}

{bullet_points}

{cta}

{hashtags}`
      },
      landing_page: {
        name: "Landing Page Copy",
        category: "web",
        template: `# {headline}

## {subheadline}

{hero_copy}

### Here's what you get:
{benefits}

### How it works:
{steps}

**{cta_button}**

{guarantee}`
      }
    },
    onboarding: {
      steps: [
        { title: "Welcome", content: "Set up your marketing AI assistant" },
        { title: "Brand Profile", fields: ["brand_name", "industry", "target_audience", "brand_voice"] },
        { title: "Channels", fields: ["social_platforms", "email_platform", "website_url"] },
        { title: "Ready!", content: "Start creating content that converts" }
      ]
    }
  },

  sales: {
    id: "sales",
    name: "Sales Workflows",
    workflows: [
      {
        id: "cold_outreach",
        name: "Cold Outreach Sequence",
        description: "Generate personalized cold email sequences",
        icon: "📧",
        inputs: [
          { name: "your_product", type: "text", label: "Your Product/Service", required: true },
          { name: "prospect_industry", type: "text", label: "Target Industry" },
          { name: "prospect_role", type: "text", label: "Target Job Title" },
          { name: "sequence_length", type: "select", label: "Number of Emails", options: ["3", "5", "7"] }
        ],
        steps: [
          { type: "research", prompt: "Identify pain points for {prospect_role} in {prospect_industry}" },
          { type: "generate", prompt: "Write {sequence_length} email sequence" },
          { type: "personalize", prompt: "Add personalization tokens and A/B subject lines" }
        ],
        outputFormat: "document"
      },
      {
        id: "discovery_questions",
        name: "Discovery Call Prep",
        description: "Generate discovery questions for prospect calls",
        icon: "📞",
        inputs: [
          { name: "product", type: "text", label: "Your Product/Service", required: true },
          { name: "prospect_company", type: "text", label: "Prospect Company" },
          { name: "prospect_industry", type: "text", label: "Industry" },
          { name: "call_goal", type: "textarea", label: "Call Objective" }
        ],
        steps: [
          { type: "research", prompt: "Research {prospect_company} and {prospect_industry}" },
          { type: "generate", prompt: "Create 10-15 discovery questions" },
          { type: "prepare", prompt: "Add objection handling responses" }
        ],
        outputFormat: "document"
      },
      {
        id: "proposal",
        name: "Proposal Generator",
        description: "Create sales proposals",
        icon: "📄",
        inputs: [
          { name: "client_name", type: "text", label: "Client Name", required: true },
          { name: "project_scope", type: "textarea", label: "Project Scope" },
          { name: "pricing", type: "text", label: "Pricing/Tiers" },
          { name: "timeline", type: "text", label: "Timeline" }
        ],
        steps: [
          { type: "generate", prompt: "Create professional proposal for {client_name}" },
          { type: "add", prompt: "Include scope, pricing, and timeline sections" },
          { type: "polish", prompt: "Add case studies placeholder and next steps" }
        ],
        outputFormat: "document"
      }
    ],
    templates: {
      cold_email: {
        name: "Cold Email Template",
        category: "email",
        template: `Subject: {subject_line}

Hi {first_name},

{personalized_hook}

{problem_statement}

{solution_intro}

{social_proof}

{soft_cta}

Best,
{your_name}`
      },
      follow_up: {
        name: "Follow-up Email",
        category: "email",
        template: `Hi {first_name},

Just following up on my last email about {topic}.

{value_reminder}

Would it make sense to schedule a quick call this week?

{signature}`
      }
    },
    onboarding: {
      steps: [
        { title: "Welcome", content: "Set up your sales AI assistant" },
        { title: "Your Product", fields: ["product_name", "value_proposition", "pricing", "ideal_customer"] },
        { title: "Sales Process", fields: ["sales_cycle_length", "key_objections", "competitors"] },
        { title: "Ready!", content: "Start generating outreach and closing deals" }
      ]
    }
  },

  hr: {
    id: "hr",
    name: "HR Workflows",
    workflows: [
      {
        id: "job_description",
        name: "Job Description Generator",
        description: "Create compelling job postings",
        icon: "📝",
        inputs: [
          { name: "job_title", type: "text", label: "Job Title", required: true },
          { name: "department", type: "text", label: "Department" },
          { name: "experience_level", type: "select", label: "Experience Level", options: ["Entry Level", "Mid Level", "Senior", "Director", "Executive"] },
          { name: "location", type: "text", label: "Location/Remote" }
        ],
        steps: [
          { type: "generate", prompt: "Write inclusive job description for {job_title}" },
          { type: "optimize", prompt: "Add required/preferred qualifications split" },
          { type: "enhance", prompt: "Include company culture and benefits section" }
        ],
        outputFormat: "document"
      },
      {
        id: "interview_questions",
        name: "Interview Question Bank",
        description: "Generate role-specific interview questions",
        icon: "🎤",
        inputs: [
          { name: "job_title", type: "text", label: "Job Title", required: true },
          { name: "skills_required", type: "textarea", label: "Key Skills Required" },
          { name: "interview_type", type: "select", label: "Interview Type", options: ["Phone Screen", "Technical", "Behavioral", "Cultural Fit", "Final Round"] }
        ],
        steps: [
          { type: "generate", prompt: "Create 10-15 interview questions for {job_title}" },
          { type: "add", prompt: "Include evaluation criteria for each question" },
          { type: "organize", prompt: "Group by skill/competency area" }
        ],
        outputFormat: "document"
      },
      {
        id: "onboarding_plan",
        name: "Onboarding Plan Generator",
        description: "Create new hire onboarding plans",
        icon: "🚀",
        inputs: [
          { name: "job_title", type: "text", label: "Job Title", required: true },
          { name: "start_date", type: "date", label: "Start Date" },
          { name: "manager", type: "text", label: "Manager Name" },
          { name: "team_size", type: "number", label: "Team Size" }
        ],
        steps: [
          { type: "generate", prompt: "Create 30-60-90 day onboarding plan" },
          { type: "add", prompt: "Include first week checklist and key meetings" },
          { type: "schedule", prompt: "Add training and milestone schedule" }
        ],
        outputFormat: "document"
      }
    ],
    templates: {
      offer_letter: {
        name: "Offer Letter",
        category: "document",
        template: `{date}

{candidate_name}
{candidate_address}

Dear {first_name},

We are pleased to offer you the position of {job_title} at {company_name}.

POSITION DETAILS:
- Title: {job_title}
- Department: {department}
- Reports to: {manager}
- Start Date: {start_date}

COMPENSATION:
- Base Salary: {salary} per year
- Bonus: {bonus_structure}

BENEFITS:
{benefits_summary}

Please sign and return by {response_deadline}.

Welcome to the team!

{hr_name}
{company_name}`
      }
    },
    onboarding: {
      steps: [
        { title: "Welcome", content: "Set up your HR AI assistant" },
        { title: "Company Info", fields: ["company_name", "industry", "company_size", "locations"] },
        { title: "Hiring Needs", fields: ["common_roles", "hiring_volume", "ats_system"] },
        { title: "Ready!", content: "Start creating job posts and managing hiring" }
      ]
    }
  },

  finance: {
    id: "finance",
    name: "Finance Workflows",
    workflows: [
      {
        id: "stock_analysis",
        name: "Stock Analysis Report",
        description: "Generate comprehensive stock analysis",
        icon: "📈",
        inputs: [
          { name: "ticker", type: "text", label: "Stock Ticker", required: true },
          { name: "analysis_type", type: "select", label: "Analysis Type", options: ["Quick Overview", "Deep Dive", "Comparison", "Technical"] }
        ],
        steps: [
          { type: "fetch", prompt: "Get financial data for {ticker}" },
          { type: "analyze", prompt: "Analyze fundamentals, valuation, and trends" },
          { type: "report", prompt: "Generate analysis report with bullish/bearish cases" }
        ],
        outputFormat: "report"
      },
      {
        id: "portfolio_review",
        name: "Portfolio Analysis",
        description: "Analyze portfolio allocation and risk",
        icon: "📊",
        inputs: [
          { name: "holdings", type: "textarea", label: "Holdings (ticker, shares, cost basis)", required: true },
          { name: "goals", type: "textarea", label: "Investment Goals" }
        ],
        steps: [
          { type: "parse", prompt: "Parse holdings and fetch current prices" },
          { type: "analyze", prompt: "Calculate allocation, risk metrics, and performance" },
          { type: "recommend", prompt: "Suggest rebalancing if needed" }
        ],
        outputFormat: "report"
      }
    ],
    templates: {},
    onboarding: {
      steps: [
        { title: "Welcome", content: "Set up your finance AI assistant" },
        { title: "Investment Profile", fields: ["risk_tolerance", "investment_horizon", "goals"] },
        { title: "Ready!", content: "Start analyzing investments" }
      ]
    },
    disclaimer: "This provides educational information only, not financial advice. Consult a licensed financial advisor."
  },

  code: {
    id: "code",
    name: "Development Workflows",
    workflows: [
      {
        id: "code_review",
        name: "Code Review",
        description: "Review code for issues and improvements",
        icon: "🔍",
        inputs: [
          { name: "code", type: "textarea", label: "Paste Code", required: true },
          { name: "language", type: "select", label: "Language", options: ["JavaScript", "TypeScript", "Python", "Go", "Rust", "Java", "C#", "Other"] },
          { name: "focus", type: "multiselect", label: "Focus Areas", options: ["Security", "Performance", "Best Practices", "Readability", "All"] }
        ],
        steps: [
          { type: "analyze", prompt: "Review {language} code for {focus}" },
          { type: "identify", prompt: "Identify bugs, security issues, and improvements" },
          { type: "suggest", prompt: "Provide refactored code examples" }
        ],
        outputFormat: "review"
      },
      {
        id: "api_design",
        name: "API Design",
        description: "Design REST or GraphQL APIs",
        icon: "🔌",
        inputs: [
          { name: "resource", type: "text", label: "Resource/Entity Name", required: true },
          { name: "operations", type: "multiselect", label: "Operations", options: ["Create", "Read", "Update", "Delete", "List", "Search"] },
          { name: "style", type: "select", label: "API Style", options: ["REST", "GraphQL", "gRPC"] }
        ],
        steps: [
          { type: "design", prompt: "Design {style} API for {resource}" },
          { type: "generate", prompt: "Generate endpoint definitions and types" },
          { type: "document", prompt: "Add OpenAPI/Schema documentation" }
        ],
        outputFormat: "document"
      }
    ],
    templates: {},
    onboarding: {
      steps: [
        { title: "Welcome", content: "Set up your development AI assistant" },
        { title: "Preferences", fields: ["primary_language", "framework", "code_style"] },
        { title: "Ready!", content: "Start building better code" }
      ]
    }
  }
};

export class WorkflowEngine {
  constructor() {
    this.workflows = INDUSTRY_WORKFLOWS;
  }

  getIndustryWorkflows(industryId) {
    return this.workflows[industryId]?.workflows || [];
  }

  getWorkflow(industryId, workflowId) {
    const industry = this.workflows[industryId];
    if (!industry) return null;
    return industry.workflows.find(w => w.id === workflowId) || null;
  }

  getTemplates(industryId) {
    return this.workflows[industryId]?.templates || {};
  }

  getOnboarding(industryId) {
    return this.workflows[industryId]?.onboarding || null;
  }

  getAllIndustries() {
    return Object.entries(this.workflows).map(([id, data]) => ({
      id,
      name: data.name,
      workflowCount: data.workflows.length,
      templateCount: Object.keys(data.templates || {}).length
    }));
  }

  executeWorkflow(workflow, inputs) {
    const results = [];
    let context = { ...inputs };

    for (const step of workflow.steps) {
      const prompt = this.interpolatePrompt(step.prompt, context);
      results.push({
        type: step.type,
        prompt,
        status: "pending"
      });
    }

    return { workflow, inputs, steps: results, context };
  }

  interpolatePrompt(template, context) {
    return template.replace(/\{(\w+)\}/g, (match, key) => {
      return context[key] !== undefined ? String(context[key]) : match;
    });
  }
}

export const workflowEngine = new WorkflowEngine();
