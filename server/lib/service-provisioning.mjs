export const SERVICE_PROVISIONING = {
  vercel: {
    id: "vercel",
    name: "Vercel",
    description: "Deploy frontend apps, serverless functions, and edge middleware",
    icon: "▲",
    category: "hosting",
    authType: "apikey",
    envVars: ["VERCEL_TOKEN"],
    capabilities: {
      autoCreateAccount: false,
      requiresExistingAccount: true,
      freeTier: true,
      trialDays: null
    },
    operations: {
      listProjects: { name: "List Projects", inputs: {} },
      createProject: { name: "Create Project", inputs: { name: { type: "text", required: true }, framework: { type: "select", options: ["nextjs", "react", "vue", "svelte", "astro", "nuxt", "remix", "angular", "other"] } } },
      deleteProject: { name: "Delete Project", inputs: { projectId: { type: "text", required: true } } },
      deploy: { name: "Deploy", inputs: { projectId: { type: "text" }, files: { type: "json" } } },
      getDeployment: { name: "Get Deployment", inputs: { deploymentId: { type: "text", required: true } } },
      listDeployments: { name: "List Deployments", inputs: { projectId: { type: "text" } } },
      getLogs: { name: "Get Logs", inputs: { deploymentId: { type: "text", required: true } } },
      setEnvVars: { name: "Set Environment Variables", inputs: { projectId: { type: "text", required: true }, env: { type: "json", required: true } } },
      createDomain: { name: "Add Domain", inputs: { projectId: { type: "text", required: true }, domain: { type: "text", required: true } } },
      listDomains: { name: "List Domains", inputs: { projectId: { type: "text", required: true } } }
    }
  },

  supabase: {
    id: "supabase",
    name: "Supabase",
    description: "PostgreSQL database, auth, storage, real-time, edge functions",
    icon: "⚡",
    category: "backend",
    authType: "apikey",
    envVars: ["SUPABASE_ACCESS_TOKEN", "SUPABASE_PROJECT_REF", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_KEY"],
    capabilities: {
      autoCreateAccount: true,
      requiresExistingAccount: false,
      freeTier: true,
      trialDays: null,
      signupUrl: "https://supabase.com/dashboard/sign-up"
    },
    operations: {
      listProjects: { name: "List Projects", inputs: {} },
      createProject: { name: "Create Project", inputs: { name: { type: "text", required: true }, password: { type: "password", required: true }, region: { type: "select", options: ["us-east-1", "us-west-1", "eu-west-1", "eu-west-2", "eu-central-1", "ap-southeast-1", "ap-northeast-1", "ap-southeast-2"] } } },
      deleteProject: { name: "Delete Project", inputs: { projectId: { type: "text", required: true } } },
      query: { name: "Run SQL Query", inputs: { sql: { type: "textarea", required: true } } },
      listTables: { name: "List Tables", inputs: {} },
      createTable: { name: "Create Table", inputs: { name: { type: "text", required: true }, columns: { type: "json", required: true } } },
      insert: { name: "Insert Row", inputs: { table: { type: "text", required: true }, data: { type: "json", required: true } } },
      select: { name: "Select Rows", inputs: { table: { type: "text", required: true }, columns: { type: "text" }, filter: { type: "json" } } },
      update: { name: "Update Rows", inputs: { table: { type: "text", required: true }, data: { type: "json", required: true }, filter: { type: "json" } } },
      delete: { name: "Delete Rows", inputs: { table: { type: "text", required: true }, filter: { type: "json", required: true } } },
      signUp: { name: "Create User", inputs: { email: { type: "email", required: true }, password: { type: "password", required: true } } },
      listUsers: { name: "List Users", inputs: {} },
      uploadFile: { name: "Upload File", inputs: { bucket: { type: "text", required: true }, path: { type: "text", required: true }, file: { type: "file", required: true } } },
      downloadFile: { name: "Download File", inputs: { bucket: { type: "text", required: true }, path: { type: "text", required: true } } },
      createBucket: { name: "Create Storage Bucket", inputs: { name: { type: "text", required: true }, public: { type: "boolean" } } },
      deployFunction: { name: "Deploy Edge Function", inputs: { name: { type: "text", required: true }, code: { type: "textarea", required: true } } },
      invokeFunction: { name: "Invoke Function", inputs: { name: { type: "text", required: true }, payload: { type: "json" } } },
      getRealtimeChannels: { name: "List Realtime Channels", inputs: {} }
    }
  },

  convex: {
    id: "convex",
    name: "Convex",
    description: "Real-time type-safe backend - database, functions, auth, file storage",
    icon: "🔄",
    category: "backend",
    authType: "apikey",
    envVars: ["CONVEX_DEPLOY_KEY", "CONVEX_URL"],
    capabilities: {
      autoCreateAccount: true,
      requiresExistingAccount: false,
      freeTier: true,
      trialDays: null,
      signupUrl: "https://dashboard.convex.dev/signup"
    },
    features: {
      realtime: true,
      typeSafe: true,
      database: true,
      functions: true,
      auth: true,
      fileStorage: true,
      vectorSearch: true
    },
    operations: {
      listDeployments: { name: "List Deployments", inputs: {} },
      createDeployment: { name: "Create Deployment", inputs: { name: { type: "text", required: true } } },
      deploy: { name: "Deploy Functions", inputs: { code: { type: "textarea" } } },
      query: { name: "Run Query", inputs: { function: { type: "text", required: true }, args: { type: "json" } } },
      mutation: { name: "Run Mutation", inputs: { function: { type: "text", required: true }, args: { type: "json" } } },
      action: { name: "Run Action", inputs: { function: { type: "text", required: true }, args: { type: "json" } } },
      listDocuments: { name: "List Documents", inputs: { table: { type: "text", required: true } } },
      getDocument: { name: "Get Document", inputs: { table: { type: "text", required: true }, id: { type: "text", required: true } } },
      insertDocument: { name: "Insert Document", inputs: { table: { type: "text", required: true }, document: { type: "json", required: true } } },
      updateDocument: { name: "Update Document", inputs: { table: { type: "text", required: true }, id: { type: "text", required: true }, patch: { type: "json", required: true } } },
      deleteDocument: { name: "Delete Document", inputs: { table: { type: "text", required: true }, id: { type: "text", required: true } } },
      vectorSearch: { name: "Vector Search", inputs: { table: { type: "text", required: true }, query: { type: "text", required: true }, limit: { type: "number" } } }
    }
  },

  spacetime: {
    id: "spacetime",
    name: "SpacetimeDB",
    description: "Ultra-fast real-time database with server-side logic",
    icon: "🌌",
    category: "backend",
    authType: "apikey",
    envVars: ["SPACETIME_TOKEN", "SPACETIME_URL"],
    capabilities: {
      autoCreateAccount: true,
      requiresExistingAccount: false,
      freeTier: true,
      signupUrl: "https://spacetimedb.com"
    },
    features: {
      realtime: true,
      typeSafe: true,
      database: true,
      serverLogic: true,
      wasmModules: true,
      lowLatency: true
    },
    operations: {
      listDatabases: { name: "List Databases", inputs: {} },
      createDatabase: { name: "Create Database", inputs: { name: { type: "text", required: true } } },
      deleteDatabase: { name: "Delete Database", inputs: { name: { type: "text", required: true } } },
      publishModule: { name: "Publish WASM Module", inputs: { database: { type: "text", required: true }, module: { type: "file", required: true } } },
      subscribe: { name: "Subscribe to Table", inputs: { database: { type: "text", required: true }, table: { type: "text", required: true } } },
      query: { name: "SQL Query", inputs: { database: { type: "text", required: true }, sql: { type: "textarea", required: true } } },
      callReducer: { name: "Call Reducer", inputs: { database: { type: "text", required: true }, reducer: { type: "text", required: true }, args: { type: "json" } } }
    }
  },

  planetscale: {
    id: "planetscale",
    name: "PlanetScale",
    description: "Serverless MySQL with branching, scaling, and zero-downtime migrations",
    icon: "🪐",
    category: "database",
    authType: "apikey",
    envVars: ["PLANETSCALE_TOKEN", "PLANETSCALE_ORG"],
    operations: {
      listDatabases: { name: "List Databases", inputs: {} },
      createDatabase: { name: "Create Database", inputs: { name: { type: "text", required: true }, region: { type: "select", options: ["us-east", "us-west", "eu-west"] } } },
      deleteDatabase: { name: "Delete Database", inputs: { name: { type: "text", required: true } } },
      createBranch: { name: "Create Branch", inputs: { database: { type: "text", required: true }, branch: { type: "text", required: true } } },
      mergeBranch: { name: "Merge Branch", inputs: { database: { type: "text", required: true }, branch: { type: "text", required: true } } },
      query: { name: "Run Query", inputs: { database: { type: "text", required: true }, branch: { type: "text" }, sql: { type: "textarea", required: true } } }
    }
  },

  upstash: {
    id: "upstash",
    name: "Upstash",
    description: "Serverless Redis and Kafka",
    icon: "⚡",
    category: "database",
    authType: "apikey",
    envVars: ["UPSTASH_EMAIL", "UPSTASH_API_KEY"],
    operations: {
      listRedis: { name: "List Redis Databases", inputs: {} },
      createRedis: { name: "Create Redis", inputs: { name: { type: "text", required: true }, region: { type: "select", options: ["us-east-1", "eu-west-1", "ap-northeast-1"] } } },
      listKafka: { name: "List Kafka Clusters", inputs: {} },
      createKafka: { name: "Create Kafka", inputs: { name: { type: "text", required: true }, region: { type: "text" } } },
      createTopic: { name: "Create Topic", inputs: { cluster: { type: "text", required: true }, topic: { type: "text", required: true } } },
      produceMessage: { name: "Produce Message", inputs: { cluster: { type: "text" }, topic: { type: "text", required: true }, message: { type: "text", required: true } } }
    }
  },

  neon: {
    id: "neon",
    name: "Neon",
    description: "Serverless PostgreSQL with branching and auto-scaling",
    icon: "⚡",
    category: "database",
    authType: "apikey",
    envVars: ["NEON_API_KEY"],
    operations: {
      listProjects: { name: "List Projects", inputs: {} },
      createProject: { name: "Create Project", inputs: { name: { type: "text", required: true }, region: { type: "select", options: ["us-east-1", "eu-central-1", "ap-southeast-1"] } } },
      createBranch: { name: "Create Branch", inputs: { projectId: { type: "text", required: true }, name: { type: "text", required: true } } },
      getConnection: { name: "Get Connection String", inputs: { projectId: { type: "text", required: true }, branch: { type: "text" } } }
    }
  },

  railway: {
    id: "railway",
    name: "Railway",
    description: "Deploy apps, databases, and services with zero config",
    icon: "🚂",
    category: "hosting",
    authType: "apikey",
    envVars: ["RAILWAY_TOKEN"],
    operations: {
      listProjects: { name: "List Projects", inputs: {} },
      createProject: { name: "Create Project", inputs: { name: { type: "text", required: true } } },
      deploy: { name: "Deploy", inputs: { projectId: { type: "text" }, repo: { type: "text" } } },
      addDatabase: { name: "Add Database", inputs: { projectId: { type: "text", required: true }, type: { type: "select", options: ["postgres", "mysql", "redis", "mongodb"] } } },
      getVariables: { name: "Get Environment Variables", inputs: { projectId: { type: "text", required: true } } },
      setVariable: { name: "Set Variable", inputs: { projectId: { type: "text", required: true }, name: { type: "text", required: true }, value: { type: "text", required: true } } }
    }
  },

  render: {
    id: "render",
    name: "Render",
    description: "Cloud platform for web services, databases, and static sites",
    icon: "🎨",
    category: "hosting",
    authType: "apikey",
    envVars: ["RENDER_API_KEY"],
    operations: {
      listServices: { name: "List Services", inputs: {} },
      createWebService: { name: "Create Web Service", inputs: { name: { type: "text", required: true }, repo: { type: "text", required: true }, region: { type: "select", options: ["oregon", "frankfurt", "singapore", "ohio"] } } },
      createDatabase: { name: "Create Database", inputs: { name: { type: "text", required: true }, type: { type: "select", options: ["postgresql", "redis"] } } },
      deploy: { name: "Trigger Deploy", inputs: { serviceId: { type: "text", required: true } } },
      getLogs: { name: "Get Logs", inputs: { serviceId: { type: "text", required: true } } }
    }
  },

  fly: {
    id: "fly",
    name: "Fly.io",
    description: "Deploy apps globally on bare metal with edge computing",
    icon: "✈️",
    category: "hosting",
    authType: "apikey",
    envVars: ["FLY_API_TOKEN"],
    operations: {
      listApps: { name: "List Apps", inputs: {} },
      createApp: { name: "Create App", inputs: { name: { type: "text", required: true }, org: { type: "text" } } },
      deploy: { name: "Deploy", inputs: { app: { type: "text", required: true }, image: { type: "text" } } },
      scale: { name: "Scale App", inputs: { app: { type: "text", required: true }, count: { type: "number", required: true } } },
      listMachines: { name: "List Machines", inputs: { app: { type: "text", required: true } } },
      getLogs: { name: "Get Logs", inputs: { app: { type: "text", required: true } } }
    }
  },

  clerk: {
    id: "clerk",
    name: "Clerk",
    description: "Authentication and user management",
    icon: "🔐",
    category: "auth",
    authType: "apikey",
    envVars: ["CLERK_SECRET_KEY", "CLERK_PUBLISHABLE_KEY"],
    operations: {
      listUsers: { name: "List Users", inputs: { limit: { type: "number" } } },
      getUser: { name: "Get User", inputs: { userId: { type: "text", required: true } } },
      createUser: { name: "Create User", inputs: { email: { type: "email", required: true }, password: { type: "password" } } },
      deleteUser: { name: "Delete User", inputs: { userId: { type: "text", required: true } } },
      createSession: { name: "Create Session", inputs: { userId: { type: "text", required: true } } },
      verifySession: { name: "Verify Session", inputs: { token: { type: "text", required: true } } }
    }
  },

  resend: {
    id: "resend",
    name: "Resend",
    description: "Email API for developers",
    icon: "📧",
    category: "communication",
    authType: "apikey",
    envVars: ["RESEND_API_KEY"],
    operations: {
      send: { name: "Send Email", inputs: { to: { type: "text", required: true }, from: { type: "text", required: true }, subject: { type: "text", required: true }, html: { type: "textarea", required: true } } },
      listEmails: { name: "List Emails", inputs: {} },
      getDomain: { name: "Get Domain", inputs: { domainId: { type: "text", required: true } } },
      createDomain: { name: "Add Domain", inputs: { name: { type: "text", required: true } } }
    }
  },

  twilio: {
    id: "twilio",
    name: "Twilio",
    description: "SMS, voice, and video communications",
    icon: "📞",
    category: "communication",
    authType: "apikey",
    envVars: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
    operations: {
      sendSms: { name: "Send SMS", inputs: { to: { type: "text", required: true }, from: { type: "text", required: true }, body: { type: "text", required: true } } },
      listMessages: { name: "List Messages", inputs: { limit: { type: "number" } } },
      makeCall: { name: "Make Call", inputs: { to: { type: "text", required: true }, from: { type: "text", required: true }, url: { type: "text", required: true } } }
    }
  },

  langfuse: {
    id: "langfuse",
    name: "Langfuse",
    description: "LLM observability - traces, prompts, evaluations",
    icon: "🔍",
    category: "observability",
    authType: "apikey",
    envVars: ["LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY"],
    operations: {
      createTrace: { name: "Create Trace", inputs: { name: { type: "text", required: true }, metadata: { type: "json" } } },
      createSpan: { name: "Create Span", inputs: { traceId: { type: "text", required: true }, name: { type: "text", required: true } } },
      createGeneration: { name: "Log Generation", inputs: { traceId: { type: "text" }, name: { type: "text", required: true }, model: { type: "text" }, input: { type: "json" }, output: { type: "json" } } },
      createPrompt: { name: "Create Prompt", inputs: { name: { type: "text", required: true }, prompt: { type: "textarea", required: true } } },
      getPrompt: { name: "Get Prompt", inputs: { name: { type: "text", required: true } } },
      listTraces: { name: "List Traces", inputs: { limit: { type: "number" } } },
      getTrace: { name: "Get Trace", inputs: { traceId: { type: "text", required: true } } }
    }
  },

  helicone: {
    id: "helicone",
    name: "Helicone",
    description: "LLM observability and monitoring",
    icon: "📊",
    category: "observability",
    authType: "apikey",
    envVars: ["HELICONE_API_KEY"],
    operations: {
      logRequest: { name: "Log Request", inputs: { model: { type: "text" }, prompt: { type: "json" }, response: { type: "json" }, latency: { type: "number" } } },
      getMetrics: { name: "Get Metrics", inputs: {} },
      listRequests: { name: "List Requests", inputs: { limit: { type: "number" } } }
    }
  },

  posthog: {
    id: "posthog",
    name: "PostHog",
    description: "Product analytics, feature flags, session recording",
    icon: "🦔",
    category: "analytics",
    authType: "apikey",
    envVars: ["POSTHOG_API_KEY", "POSTHOG_PROJECT_ID"],
    operations: {
      capture: { name: "Capture Event", inputs: { event: { type: "text", required: true }, properties: { type: "json" } } },
      identify: { name: "Identify User", inputs: { userId: { type: "text", required: true }, properties: { type: "json" } } },
      createFeatureFlag: { name: "Create Feature Flag", inputs: { key: { type: "text", required: true }, enabled: { type: "boolean" } } },
      getFeatureFlag: { name: "Get Feature Flag", inputs: { key: { type: "text", required: true } } },
      query: { name: "Run Insight Query", inputs: { query: { type: "json", required: true } } }
    }
  }
};

export const AI_SERVICES = {
  runway: {
    id: "runway",
    name: "Runway",
    description: "AI video generation and editing",
    icon: "🎬",
    category: "media",
    authType: "apikey",
    envVars: ["RUNWAY_API_KEY"],
    operations: {
      textToVideo: { name: "Text to Video", inputs: { prompt: { type: "textarea", required: true }, duration: { type: "number" }, aspectRatio: { type: "select", options: ["16:9", "9:16", "1:1"] } } },
      imageToVideo: { name: "Image to Video", inputs: { image: { type: "file", required: true }, motion: { type: "number" } } },
      getTask: { name: "Get Task Status", inputs: { taskId: { type: "text", required: true } } },
      listModels: { name: "List Models", inputs: {} }
    }
  },

  elevenlabs: {
    id: "elevenlabs",
    name: "ElevenLabs",
    description: "AI voice synthesis and cloning",
    icon: "🔊",
    category: "media",
    authType: "apikey",
    envVars: ["ELEVENLABS_API_KEY"],
    operations: {
      textToSpeech: { name: "Text to Speech", inputs: { text: { type: "textarea", required: true }, voiceId: { type: "text", required: true } } },
      listVoices: { name: "List Voices", inputs: {} },
      cloneVoice: { name: "Clone Voice", inputs: { name: { type: "text", required: true }, files: { type: "json", required: true } } },
      getVoice: { name: "Get Voice", inputs: { voiceId: { type: "text", required: true } } },
      deleteVoice: { name: "Delete Voice", inputs: { voiceId: { type: "text", required: true } } }
    }
  },

  replicate: {
    id: "replicate",
    name: "Replicate",
    description: "Run ML models in the cloud",
    icon: "🔄",
    category: "ml",
    authType: "apikey",
    envVars: ["REPLICATE_API_TOKEN"],
    operations: {
      run: { name: "Run Model", inputs: { model: { type: "text", required: true, placeholder: "owner/model:version" }, input: { type: "json", required: true } } },
      getPrediction: { name: "Get Prediction", inputs: { predictionId: { type: "text", required: true } } },
      cancelPrediction: { name: "Cancel Prediction", inputs: { predictionId: { type: "text", required: true } } },
      listModels: { name: "List Models", inputs: {} }
    }
  },

  together: {
    id: "together",
    name: "Together AI",
    description: "Fast inference for open-source models",
    icon: "🤝",
    category: "inference",
    authType: "apikey",
    envVars: ["TOGETHER_API_KEY"],
    operations: {
      chat: { name: "Chat Completion", inputs: { model: { type: "text", required: true }, messages: { type: "json", required: true } } },
      generate: { name: "Generate", inputs: { model: { type: "text", required: true }, prompt: { type: "textarea", required: true } } },
      embeddings: { name: "Embeddings", inputs: { model: { type: "text", required: true }, input: { type: "text", required: true } } },
      listModels: { name: "List Models", inputs: {} }
    }
  },

  groq: {
    id: "groq",
    name: "Groq",
    description: "Ultra-fast LLM inference",
    icon: "⚡",
    category: "inference",
    authType: "apikey",
    envVars: ["GROQ_API_KEY"],
    operations: {
      chat: { name: "Chat Completion", inputs: { model: { type: "select", options: ["llama-3.1-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768", "gemma2-9b-it"] }, messages: { type: "json", required: true } } },
      generate: { name: "Generate", inputs: { model: { type: "text", required: true }, prompt: { type: "textarea", required: true } } },
      transcribe: { name: "Transcribe Audio", inputs: { file: { type: "file", required: true }, model: { type: "text", default: "whisper-large-v3" } } },
      listModels: { name: "List Models", inputs: {} }
    }
  },

  perplexity: {
    id: "perplexity",
    name: "Perplexity",
    description: "AI-powered search and answers",
    icon: "🔮",
    category: "search",
    authType: "apikey",
    envVars: ["PERPLEXITY_API_KEY"],
    operations: {
      chat: { name: "Chat", inputs: { model: { type: "select", options: ["llama-3.1-sonar-small-128k-online", "llama-3.1-sonar-large-128k-online"] }, messages: { type: "json", required: true } } }
    }
  },

  fireworks: {
    id: "fireworks",
    name: "Fireworks AI",
    description: "Fast inference for LLMs and image models",
    icon: "🎆",
    category: "inference",
    authType: "apikey",
    envVars: ["FIREWORKS_API_KEY"],
    operations: {
      chat: { name: "Chat Completion", inputs: { model: { type: "text", required: true }, messages: { type: "json", required: true } } },
      generate: { name: "Generate", inputs: { model: { type: "text", required: true }, prompt: { type: "textarea", required: true } } },
      generateImage: { name: "Generate Image", inputs: { model: { type: "text" }, prompt: { type: "text", required: true } } }
    }
  },

  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    description: "Advanced reasoning and coding models",
    icon: "🧠",
    category: "inference",
    authType: "apikey",
    envVars: ["DEEPSEEK_API_KEY"],
    operations: {
      chat: { name: "Chat Completion", inputs: { model: { type: "select", options: ["deepseek-chat", "deepseek-reasoner"] }, messages: { type: "json", required: true } } },
      generate: { name: "Generate", inputs: { model: { type: "text", required: true }, prompt: { type: "textarea", required: true } } }
    }
  },

  mistral: {
    id: "mistral",
    name: "Mistral AI",
    description: "Open-weight and commercial LLMs",
    icon: "🌀",
    category: "inference",
    authType: "apikey",
    envVars: ["MISTRAL_API_KEY"],
    operations: {
      chat: { name: "Chat Completion", inputs: { model: { type: "select", options: ["mistral-large-latest", "mistral-medium", "mistral-small", "codestral-latest"] }, messages: { type: "json", required: true } } },
      embeddings: { name: "Embeddings", inputs: { model: { type: "text", default: "mistral-embed" }, input: { type: "text", required: true } } }
    }
  },

  cohere: {
    id: "cohere",
    name: "Cohere",
    description: "Enterprise NLP and embeddings",
    icon: "💬",
    category: "inference",
    authType: "apikey",
    envVars: ["COHERE_API_KEY"],
    operations: {
      chat: { name: "Chat", inputs: { model: { type: "select", options: ["command-r-plus", "command-r", "command"] }, message: { type: "textarea", required: true } } },
      embed: { name: "Embed", inputs: { model: { type: "text", default: "embed-english-v3.0" }, texts: { type: "json", required: true } } },
      rerank: { name: "Rerank", inputs: { model: { type: "text", default: "rerank-english-v2.0" }, query: { type: "text", required: true }, documents: { type: "json", required: true } } },
      summarize: { name: "Summarize", inputs: { text: { type: "textarea", required: true } } }
    }
  }
};

export const AI_SDKS = {
  openai: {
    id: "openai",
    name: "OpenAI SDK",
    description: "GPT-4, GPT-4o, DALL-E, Whisper, TTS",
    icon: "🤖",
    npmPackage: "openai",
    envVars: ["OPENAI_API_KEY"],
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo", "dall-e-3", "whisper-1", "tts-1"],
    operations: ["chat", "completions", "embeddings", "images", "audio", "files", "assistants", "threads", "fine_tuning"]
  },

  anthropic: {
    id: "anthropic",
    name: "Anthropic SDK",
    description: "Claude 3.5 Sonnet, Opus, Haiku",
    icon: "🧠",
    npmPackage: "@anthropic-ai/sdk",
    envVars: ["ANTHROPIC_API_KEY"],
    models: ["claude-sonnet-4-20250514", "claude-opus-4-20250514", "claude-3-5-haiku-20241022"],
    operations: ["messages", "messages_stream", "batches"]
  },

  google_ai: {
    id: "google_ai",
    name: "Google AI SDK",
    description: "Gemini 2.0 Flash, Gemini 2.5 Pro",
    icon: "💎",
    npmPackage: "@google/generative-ai",
    envVars: ["GOOGLE_AI_API_KEY"],
    models: ["gemini-2.0-flash", "gemini-2.5-pro-preview-06-05", "gemini-1.5-pro", "gemini-1.5-flash"],
    operations: ["generateContent", "streamGenerateContent", "embedContent", "countTokens"]
  },

  glm: {
    id: "glm",
    name: "GLM / Zhipu AI",
    description: "Chinese LLM - GLM-4, ChatGLM",
    icon: "🇨🇳",
    npmPackage: "zhipu-ai",
    envVars: ["ZHIPU_API_KEY"],
    models: ["glm-4", "glm-4-plus", "glm-4-air", "chatglm-turbo"],
    operations: ["chat", "completions", "embeddings"]
  },

  ai_sdk: {
    id: "ai_sdk",
    name: "Vercel AI SDK",
    description: "Unified interface for all AI providers",
    icon: "▲",
    npmPackage: "ai",
    providers: ["openai", "anthropic", "google", "mistral", "cohere", "groq", "together", "fireworks", "deepseek", "perplexity"],
    features: ["streamText", "generateText", "streamObject", "generateObject", "embed", "embedMany", "toolCalling", "multiModal"]
  },

  langchain: {
    id: "langchain",
    name: "LangChain",
    description: "Build LLM applications with chains",
    icon: "⛓️",
    npmPackage: "langchain",
    features: ["chains", "agents", "tools", "retrievers", "memory", "callbacks", "document_loaders", "vector_stores"]
  },

  llamaindex: {
    id: "llamaindex",
    name: "LlamaIndex",
    description: "Data framework for LLM applications",
    icon: "🦙",
    npmPackage: "llamaindex",
    features: ["indices", "query_engines", "chat_engines", "retrievers", "embeddings", "llms", "readers", "tools"]
  }
};

export function listServiceCategories() {
  return [
    { id: "hosting", name: "Hosting & Deployment", services: ["vercel", "railway", "render", "fly"] },
    { id: "backend", name: "Backend & Real-time", services: ["supabase", "convex", "spacetime"] },
    { id: "database", name: "Databases", services: ["planetscale", "upstash", "neon"] },
    { id: "auth", name: "Authentication", services: ["clerk"] },
    { id: "communication", name: "Communication", services: ["resend", "twilio"] },
    { id: "observability", name: "Observability", services: ["langfuse", "helicone", "posthog"] },
    { id: "inference", name: "AI Inference", services: ["groq", "together", "fireworks", "deepseek", "mistral", "cohere"] },
    { id: "media", name: "AI Media", services: ["runway", "elevenlabs", "replicate"] },
    { id: "search", name: "AI Search", services: ["perplexity"] }
  ];
}
