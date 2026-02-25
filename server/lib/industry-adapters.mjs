export const INDUSTRY_ADAPTERS = {
  real_estate: {
    id: "real_estate",
    name: "Real Estate Integrations",
    adapters: {
      mls: {
        name: "MLS Connector",
        description: "Connect to Multiple Listing Service for property data",
        authType: "oauth2",
        endpoints: {
          searchProperties: { method: "GET", path: "/properties/search" },
          getProperty: { method: "GET", path: "/properties/:id" },
          getComparables: { method: "GET", path: "/properties/:id/comparables" },
          getMarketStats: { method: "GET", path: "/markets/:zip/stats" }
        },
        envVars: ["MLS_CLIENT_ID", "MLS_CLIENT_SECRET", "MLS_API_URL"]
      },
      zillow: {
        name: "Zillow API",
        description: "Property valuations and market data",
        authType: "apikey",
        endpoints: {
          getZestimate: { method: "GET", path: "/zestimate" },
          search: { method: "GET", path: "/search" },
          getDetails: { method: "GET", path: "/property" }
        },
        envVars: ["ZILLOW_API_KEY"]
      },
      attom: {
        name: "ATTOM Data",
        description: "Property data, valuations, and analytics",
        authType: "apikey",
        endpoints: {
          propertyDetail: { method: "GET", path: "/property/detail" },
          avm: { method: "GET", path: "/property/avm" },
          salesHistory: { method: "GET", path: "/property/saleshistory" },
          school: { method: "GET", path: "/property/school" }
        },
        envVars: ["ATTOM_API_KEY"]
      },
      rentcast: {
        name: "RentCast",
        description: "Rental market data and estimates",
        authType: "apikey",
        endpoints: {
          rentEstimate: { method: "GET", path: "/rent/estimate" },
          marketData: { method: "GET", path: "/rent/market" },
          listings: { method: "GET", path: "/rent/listings" }
        },
        envVars: ["RENTCAST_API_KEY"]
      },
      mortgage: {
        name: "Mortgage Calculator",
        description: "Mortgage calculations and rate data",
        authType: "none",
        local: true,
        functions: {
          calculatePayment: (principal, rate, years) => {
            const monthlyRate = rate / 100 / 12;
            const numPayments = years * 12;
            const payment = principal * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1);
            return { monthly: Math.round(payment), total: Math.round(payment * numPayments), interest: Math.round(payment * numPayments - principal) };
          },
          calculateAffordability: (income, debts, rate, downPaymentPercent) => {
            const maxMonthly = (income / 12 * 0.28) - debts;
            const monthlyRate = rate / 100 / 12;
            const loanAmount = maxMonthly / monthlyRate * (1 - Math.pow(1 + monthlyRate, -360));
            const totalHome = loanAmount / (1 - downPaymentPercent / 100);
            return { maxMonthlyPayment: Math.round(maxMonthly), maxLoan: Math.round(loanAmount), maxHomePrice: Math.round(totalHome), downPayment: Math.round(totalHome * downPaymentPercent / 100) };
          }
        }
      },
      google_maps: {
        name: "Google Maps",
        description: "Location data, nearby amenities, commute times",
        authType: "apikey",
        endpoints: {
          geocode: { method: "GET", path: "https://maps.googleapis.com/maps/api/geocode/json" },
          places: { method: "GET", path: "https://maps.googleapis.com/maps/api/place/nearbysearch/json" },
          distance: { method: "GET", path: "https://maps.googleapis.com/maps/api/distancematrix/json" }
        },
        envVars: ["GOOGLE_MAPS_API_KEY"]
      }
    }
  },

  legal: {
    id: "legal",
    name: "Legal Integrations",
    adapters: {
      clio: {
        name: "Clio",
        description: "Legal practice management - cases, documents, billing",
        authType: "oauth2",
        endpoints: {
          listMatters: { method: "GET", path: "/matters" },
          getMatter: { method: "GET", path: "/matters/:id" },
          listDocuments: { method: "GET", path: "/documents" },
          createDocument: { method: "POST", path: "/documents" }
        },
        envVars: ["CLIO_CLIENT_ID", "CLIO_CLIENT_SECRET"]
      },
      westlaw: {
        name: "Westlaw",
        description: "Legal research and case law",
        authType: "oauth2",
        endpoints: {
          search: { method: "GET", path: "/search" },
          getDocument: { method: "GET", path: "/documents/:id" },
          citationCheck: { method: "POST", path: "/citations/check" }
        },
        envVars: ["WESTLAW_CLIENT_ID", "WESTLAW_CLIENT_SECRET"]
      },
      lexnex: {
        name: "LexisNexis",
        description: "Legal research and public records",
        authType: "oauth2",
        endpoints: {
          search: { method: "POST", path: "/search" },
          getCase: { method: "GET", path: "/cases/:id" }
        },
        envVars: ["LEXNEX_API_KEY"]
      },
      docsign: {
        name: "DocuSign",
        description: "Electronic signatures for legal documents",
        authType: "oauth2",
        endpoints: {
          createEnvelope: { method: "POST", path: "/envelopes" },
          getEnvelope: { method: "GET", path: "/envelopes/:id" },
          getDocuments: { method: "GET", path: "/envelopes/:id/documents" }
        },
        envVars: ["DOCUSIGN_CLIENT_ID", "DOCUSIGN_CLIENT_SECRET"]
      },
      court_listener: {
        name: "CourtListener",
        description: "Free legal database - case law and PACER data",
        authType: "apikey",
        endpoints: {
          search: { method: "GET", path: "https://www.courtlistener.com/api/rest/v3/search/" },
          opinion: { method: "GET", path: "https://www.courtlistener.com/api/rest/v3/opinions/:id/" }
        },
        envVars: ["COURT_LISTENER_API_KEY"]
      }
    }
  },

  marketing: {
    id: "marketing",
    name: "Marketing Integrations",
    adapters: {
      mailchimp: {
        name: "Mailchimp",
        description: "Email marketing and automation",
        authType: "apikey",
        endpoints: {
          lists: { method: "GET", path: "/lists" },
          addMember: { method: "POST", path: "/lists/:id/members" },
          campaigns: { method: "GET", path: "/campaigns" },
          createCampaign: { method: "POST", path: "/campaigns" },
          sendCampaign: { method: "POST", path: "/campaigns/:id/actions/send" }
        },
        envVars: ["MAILCHIMP_API_KEY", "MAILCHIMP_SERVER_PREFIX"]
      },
      hubspot: {
        name: "HubSpot",
        description: "CRM, marketing automation, content",
        authType: "apikey",
        endpoints: {
          contacts: { method: "GET", path: "/crm/v3/objects/contacts" },
          createContact: { method: "POST", path: "/crm/v3/objects/contacts" },
          companies: { method: "GET", path: "/crm/v3/objects/companies" },
          deals: { method: "GET", path: "/crm/v3/objects/deals" }
        },
        envVars: ["HUBSPOT_API_KEY"]
      },
      meta: {
        name: "Meta (Facebook/Instagram)",
        description: "Social media advertising and insights",
        authType: "oauth2",
        endpoints: {
          getAdAccounts: { method: "GET", path: "/me/adaccounts" },
          getCampaigns: { method: "GET", path: "/:accountId/campaigns" },
          createAd: { method: "POST", path: "/:accountId/ads" },
          getInsights: { method: "GET", path: "/:accountId/insights" }
        },
        envVars: ["META_APP_ID", "META_APP_SECRET", "META_ACCESS_TOKEN"]
      },
      google_ads: {
        name: "Google Ads",
        description: "Search and display advertising",
        authType: "oauth2",
        endpoints: {
          getCampaigns: { method: "GET", path: "/customers/:id/googleAds:search" },
          getKeywords: { method: "GET", path: "/customers/:id/googleAds:search" },
          createCampaign: { method: "POST", path: "/customers/:id/campaigns:mutate" }
        },
        envVars: ["GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET"]
      },
      twitter: {
        name: "X (Twitter)",
        description: "Social media posting and analytics",
        authType: "oauth2",
        endpoints: {
          tweet: { method: "POST", path: "/2/tweets" },
          getUser: { method: "GET", path: "/2/users/me" },
          getTimeline: { method: "GET", path: "/2/users/:id/timelines/reverse" }
        },
        envVars: ["TWITTER_BEARER_TOKEN", "TWITTER_API_KEY", "TWITTER_API_SECRET"]
      },
      linkedin: {
        name: "LinkedIn",
        description: "Professional network posting and ads",
        authType: "oauth2",
        endpoints: {
          postShare: { method: "POST", path: "/ugcPosts" },
          getProfile: { method: "GET", path: "/me" },
          getAnalytics: { method: "GET", path: "/organizationalEntityShareStatistics" }
        },
        envVars: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"]
      },
      canva: {
        name: "Canva",
        description: "Design and content creation",
        authType: "oauth2",
        endpoints: {
          createDesign: { method: "POST", path: "/designs" },
          exportDesign: { method: "POST", path: "/designs/:id/export" }
        },
        envVars: ["CANVA_CLIENT_ID", "CANVA_CLIENT_SECRET"]
      }
    }
  },

  sales: {
    id: "sales",
    name: "Sales Integrations",
    adapters: {
      salesforce: {
        name: "Salesforce",
        description: "Full CRM - leads, contacts, opportunities, cases, custom objects",
        authType: "oauth2",
        endpoints: {
          query: { method: "GET", path: "/services/data/v59.0/query" },
          queryAll: { method: "GET", path: "/services/data/v59.0/queryAll" },
          describe: { method: "GET", path: "/services/data/v59.0/sobjects/:object/describe" },
          getLead: { method: "GET", path: "/services/data/v59.0/sobjects/Lead/:id" },
          createLead: { method: "POST", path: "/services/data/v59.0/sobjects/Lead" },
          updateLead: { method: "PATCH", path: "/services/data/v59.0/sobjects/Lead/:id" },
          convertLead: { method: "POST", path: "/services/data/v59.0/actions/standard/convertLead" },
          getContact: { method: "GET", path: "/services/data/v59.0/sobjects/Contact/:id" },
          createContact: { method: "POST", path: "/services/data/v59.0/sobjects/Contact" },
          getAccount: { method: "GET", path: "/services/data/v59.0/sobjects/Account/:id" },
          createAccount: { method: "POST", path: "/services/data/v59.0/sobjects/Account" },
          getOpportunity: { method: "GET", path: "/services/data/v59.0/sobjects/Opportunity/:id" },
          createOpportunity: { method: "POST", path: "/services/data/v59.0/sobjects/Opportunity" },
          updateOpportunity: { method: "PATCH", path: "/services/data/v59.0/sobjects/Opportunity/:id" },
          getCase: { method: "GET", path: "/services/data/v59.0/sobjects/Case/:id" },
          createCase: { method: "POST", path: "/services/data/v59.0/sobjects/Case" },
          getTask: { method: "GET", path: "/services/data/v59.0/sobjects/Task/:id" },
          createTask: { method: "POST", path: "/services/data/v59.0/sobjects/Task" },
          getEvent: { method: "GET", path: "/services/data/v59.0/sobjects/Event/:id" },
          createEvent: { method: "POST", path: "/services/data/v59.0/sobjects/Event" },
          runReport: { method: "GET", path: "/services/data/v59.0/analytics/reports/:id" },
          search: { method: "GET", path: "/services/data/v59.0/search" },
          apex: { method: "POST", path: "/services/data/v59.0/tooling/executeAnonymous" }
        },
        envVars: ["SALESFORCE_CLIENT_ID", "SALESFORCE_CLIENT_SECRET", "SALESFORCE_INSTANCE_URL", "SALESFORCE_REFRESH_TOKEN"]
      },
      salesforce_bulk: {
        name: "Salesforce Bulk API",
        description: "Bulk data operations",
        authType: "oauth2",
        endpoints: {
          createJob: { method: "POST", path: "/services/data/v59.0/jobs/ingest" },
          getJob: { method: "GET", path: "/services/data/v59.0/jobs/ingest/:id" },
          uploadData: { method: "PUT", path: "/services/data/v59.0/jobs/ingest/:id/batches" },
          closeJob: { method: "PATCH", path: "/services/data/v59.0/jobs/ingest/:id" },
          getResults: { method: "GET", path: "/services/data/v59.0/jobs/ingest/:id/successfulResults" }
        },
        envVars: ["SALESFORCE_CLIENT_ID", "SALESFORCE_CLIENT_SECRET", "SALESFORCE_INSTANCE_URL", "SALESFORCE_REFRESH_TOKEN"]
      },
      hubspot_crm: {
        name: "HubSpot CRM",
        description: "Free CRM with contacts, deals, pipelines",
        authType: "apikey",
        endpoints: {
          contacts: { method: "GET", path: "/crm/v3/objects/contacts" },
          createContact: { method: "POST", path: "/crm/v3/objects/contacts" },
          deals: { method: "GET", path: "/crm/v3/objects/deals" },
          createDeal: { method: "POST", path: "/crm/v3/objects/deals" }
        },
        envVars: ["HUBSPOT_API_KEY"]
      },
      pipedrive: {
        name: "Pipedrive",
        description: "Sales CRM focused on deal management",
        authType: "apikey",
        endpoints: {
          getPersons: { method: "GET", path: "/persons" },
          createPerson: { method: "POST", path: "/persons" },
          getDeals: { method: "GET", path: "/deals" },
          createDeal: { method: "POST", path: "/deals" }
        },
        envVars: ["PIPEDRIVE_API_KEY", "PIPEDRIVE_COMPANY_DOMAIN"]
      },
      outreach: {
        name: "Outreach",
        description: "Sales engagement and sequence automation",
        authType: "oauth2",
        endpoints: {
          getProspects: { method: "GET", path: "/prospects" },
          createProspect: { method: "POST", path: "/prospects" },
          getSequences: { method: "GET", path: "/sequences" },
          createSequence: { method: "POST", path: "/sequences" }
        },
        envVars: ["OUTREACH_CLIENT_ID", "OUTREACH_CLIENT_SECRET"]
      },
      apollo: {
        name: "Apollo.io",
        description: "B2B contact database and enrichment",
        authType: "apikey",
        endpoints: {
          searchPeople: { method: "POST", path: "/mixed_people/search" },
          getPerson: { method: "GET", path: "/people/:id" },
          searchOrgs: { method: "POST", path: "/organizations/search" }
        },
        envVars: ["APOLLO_API_KEY"]
      },
      zoominfo: {
        name: "ZoomInfo",
        description: "B2B intelligence and contact data",
        authType: "apikey",
        endpoints: {
          searchContact: { method: "POST", path: "/search/contact" },
          searchCompany: { method: "POST", path: "/search/company" },
          enrich: { method: "POST", path: "/enrich" }
        },
        envVars: ["ZOOMINFO_API_KEY"]
      },
      gong: {
        name: "Gong",
        description: "Revenue intelligence from calls/meetings",
        authType: "apikey",
        endpoints: {
          getCalls: { method: "GET", path: "/calls" },
          getCallTranscript: { method: "GET", path: "/calls/:id/transcript" },
          getDeals: { method: "GET", path: "/deals" }
        },
        envVars: ["GONG_ACCESS_KEY", "GONG_SECRET_KEY"]
      }
    }
  },

  hr: {
    id: "hr",
    name: "HR Integrations",
    adapters: {
      greenhouse: {
        name: "Greenhouse",
        description: "Applicant tracking system",
        authType: "apikey",
        endpoints: {
          getJobs: { method: "GET", path: "/jobs" },
          createJob: { method: "POST", path: "/jobs" },
          getCandidates: { method: "GET", path: "/candidates" },
          addCandidate: { method: "POST", path: "/candidates" }
        },
        envVars: ["GREENHOUSE_API_KEY"]
      },
      lever: {
        name: "Lever",
        description: "Talent acquisition platform",
        authType: "apikey",
        endpoints: {
          getPostings: { method: "GET", path: "/postings" },
          getCandidates: { method: "GET", path: "/candidates" },
          createCandidate: { method: "POST", path: "/candidates" }
        },
        envVars: ["LEVER_API_KEY"]
      },
      workday: {
        name: "Workday",
        description: "HRIS and workforce management",
        authType: "oauth2",
        endpoints: {
          getWorkers: { method: "GET", path: "/workers" },
          getWorker: { method: "GET", path: "/workers/:id" },
          getTimeOff: { method: "GET", path: "/workers/:id/time-off" }
        },
        envVars: ["WORKDAY_CLIENT_ID", "WORKDAY_CLIENT_SECRET", "WORKDAY_TENANT"]
      },
      bamboohr: {
        name: "BambooHR",
        description: "HR software for SMBs",
        authType: "apikey",
        endpoints: {
          getEmployees: { method: "GET", path: "/employees/directory" },
          getEmployee: { method: "GET", path: "/employees/:id" },
          createEmployee: { method: "POST", path: "/employees" }
        },
        envVars: ["BAMBOOHR_API_KEY", "BAMBOOHR_SUBDOMAIN"]
      },
      indeed: {
        name: "Indeed",
        description: "Job posting and applicant sourcing",
        authType: "oauth2",
        endpoints: {
          postJob: { method: "POST", path: "/jobs" },
          getApplicants: { method: "GET", path: "/jobs/:id/applicants" }
        },
        envVars: ["INDEED_CLIENT_ID", "INDEED_CLIENT_SECRET"]
      },
      linkedin_jobs: {
        name: "LinkedIn Jobs",
        description: "Post jobs to LinkedIn network",
        authType: "oauth2",
        endpoints: {
          postJob: { method: "POST", path: "/jobPostings" },
          getApplications: { method: "GET", path: "/jobPostings/:id/applications" }
        },
        envVars: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"]
      },
      checkr: {
        name: "Checkr",
        description: "Background checks",
        authType: "apikey",
        endpoints: {
          createCandidate: { method: "POST", path: "/candidates" },
          createReport: { method: "POST", path: "/reports" },
          getReport: { method: "GET", path: "/reports/:id" }
        },
        envVars: ["CHECKR_API_KEY"]
      },
      slack: {
        name: "Slack",
        description: "Team communication and onboarding",
        authType: "oauth2",
        endpoints: {
          postMessage: { method: "POST", path: "/chat.postMessage" },
          inviteUser: { method: "POST", path: "/users.admin.invite" },
          createChannel: { method: "POST", path: "/conversations.create" }
        },
        envVars: ["SLACK_BOT_TOKEN", "SLACK_APP_ID"]
      }
    }
  },

  finance: {
    id: "finance",
    name: "Finance Integrations",
    adapters: {
      alpha_vantage: {
        name: "Alpha Vantage",
        description: "Stock quotes, forex, crypto data",
        authType: "apikey",
        endpoints: {
          quote: { method: "GET", path: "https://www.alphavantage.co/query", params: { function: "GLOBAL_QUOTE" } },
          timeSeries: { method: "GET", path: "https://www.alphavantage.co/query", params: { function: "TIME_SERIES_DAILY" } },
          companyOverview: { method: "GET", path: "https://www.alphavantage.co/query", params: { function: "OVERVIEW" } }
        },
        envVars: ["ALPHA_VANTAGE_API_KEY"]
      },
      polygon: {
        name: "Polygon.io",
        description: "Real-time and historical market data",
        authType: "apikey",
        endpoints: {
          getTicker: { method: "GET", path: "https://api.polygon.io/v3/reference/tickers/:ticker" },
          getAggregates: { method: "GET", path: "https://api.polygon.io/v2/aggs/ticker/:ticker/range/:multiplier/:timespan/:from/:to" },
          getNews: { method: "GET", path: "https://api.polygon.io/v2/reference/news" }
        },
        envVars: ["POLYGON_API_KEY"]
      },
      iex: {
        name: "IEX Cloud",
        description: "Stock data and financial metrics",
        authType: "apikey",
        endpoints: {
          quote: { method: "GET", path: "/stock/:symbol/quote" },
          stats: { method: "GET", path: "/stock/:symbol/stats" },
          financials: { method: "GET", path: "/stock/:symbol/financials" },
          cashFlow: { method: "GET", path: "/stock/:symbol/cash-flow" }
        },
        envVars: ["IEX_API_KEY"]
      },
      plaid: {
        name: "Plaid",
        description: "Bank account connectivity",
        authType: "apikey",
        endpoints: {
          createLinkToken: { method: "POST", path: "/link/token/create" },
          exchangeToken: { method: "POST", path: "/item/public_token/exchange" },
          getBalance: { method: "POST", path: "/accounts/balance/get" },
          getTransactions: { method: "POST", path: "/transactions/get" }
        },
        envVars: ["PLAID_CLIENT_ID", "PLAID_SECRET", "PLAID_ENV"]
      },
      stripe: {
        name: "Stripe",
        description: "Payments and billing",
        authType: "apikey",
        endpoints: {
          createCustomer: { method: "POST", path: "/customers" },
          createPayment: { method: "POST", path: "/payment_intents" },
          getBalance: { method: "GET", path: "/balance" },
          listCharges: { method: "GET", path: "/charges" }
        },
        envVars: ["STRIPE_SECRET_KEY"]
      },
      quickbooks: {
        name: "QuickBooks",
        description: "Accounting and bookkeeping",
        authType: "oauth2",
        endpoints: {
          getAccounts: { method: "GET", path: "/query?query=select * from Account" },
          getInvoices: { method: "GET", path: "/query?query=select * from Invoice" },
          createInvoice: { method: "POST", path: "/invoice" },
          getReports: { method: "GET", path: "/reports/:reportName" }
        },
        envVars: ["QUICKBOOKS_CLIENT_ID", "QUICKBOOKS_CLIENT_SECRET", "QUICKBOOKS_REALM_ID"]
      },
      coinbase: {
        name: "Coinbase",
        description: "Cryptocurrency data and trading",
        authType: "apikey",
        endpoints: {
          getAccounts: { method: "GET", path: "/accounts" },
          getSpotPrice: { method: "GET", path: "/prices/:currency/spot" },
          getExchangeRates: { method: "GET", path: "/exchange-rates" }
        },
        envVars: ["COINBASE_API_KEY", "COINBASE_API_SECRET"]
      }
    }
  },

  servicenow: {
    id: "servicenow",
    name: "ServiceNow Integrations",
    adapters: {
      incidents: {
        name: "Incident Management",
        description: "Create, update, query incidents",
        authType: "basic",
        endpoints: {
          list: { method: "GET", path: "/api/now/table/incident" },
          get: { method: "GET", path: "/api/now/table/incident/:sys_id" },
          create: { method: "POST", path: "/api/now/table/incident" },
          update: { method: "PATCH", path: "/api/now/table/incident/:sys_id" },
          close: { method: "PATCH", path: "/api/now/table/incident/:sys_id", body: { state: 7 } }
        },
        envVars: ["SERVICENOW_INSTANCE", "SERVICENOW_USER", "SERVICENOW_PASSWORD"]
      },
      changes: {
        name: "Change Management",
        description: "Change requests and approvals",
        authType: "basic",
        endpoints: {
          list: { method: "GET", path: "/api/now/table/change_request" },
          get: { method: "GET", path: "/api/now/table/change_request/:sys_id" },
          create: { method: "POST", path: "/api/now/table/change_request" },
          update: { method: "PATCH", path: "/api/now/table/change_request/:sys_id" }
        },
        envVars: ["SERVICENOW_INSTANCE", "SERVICENOW_USER", "SERVICENOW_PASSWORD"]
      },
      catalog: {
        name: "Service Catalog",
        description: "Request catalog items",
        authType: "basic",
        endpoints: {
          listItems: { method: "GET", path: "/api/sn_sc/v1/servicecatalog/items" },
          getItem: { method: "GET", path: "/api/sn_sc/v1/servicecatalog/items/:sys_id" },
          checkout: { method: "POST", path: "/api/sn_sc/v1/servicecatalog/checkout" }
        },
        envVars: ["SERVICENOW_INSTANCE", "SERVICENOW_USER", "SERVICENOW_PASSWORD"]
      },
      cmdb: {
        name: "CMDB",
        description: "Configuration management database",
        authType: "basic",
        endpoints: {
          listCI: { method: "GET", path: "/api/now/table/cmdb_ci" },
          getCI: { method: "GET", path: "/api/now/table/cmdb_ci/:sys_id" },
          listServers: { method: "GET", path: "/api/now/table/cmdb_ci_server" },
          listApps: { method: "GET", path: "/api/now/table/cmdb_ci_appl" }
        },
        envVars: ["SERVICENOW_INSTANCE", "SERVICENOW_USER", "SERVICENOW_PASSWORD"]
      },
      knowledge: {
        name: "Knowledge Base",
        description: "Knowledge articles",
        authType: "basic",
        endpoints: {
          search: { method: "GET", path: "/api/now/table/kb_knowledge" },
          get: { method: "GET", path: "/api/now/table/kb_knowledge/:sys_id" }
        },
        envVars: ["SERVICENOW_INSTANCE", "SERVICENOW_USER", "SERVICENOW_PASSWORD"]
      },
      flow: {
        name: "Flow Designer",
        description: "Trigger and manage flows",
        authType: "basic",
        endpoints: {
          trigger: { method: "POST", path: "/api/now/flow/executor" },
          getStatus: { method: "GET", path: "/api/now/flow/executor/:execution_id" }
        },
        envVars: ["SERVICENOW_INSTANCE", "SERVICENOW_USER", "SERVICENOW_PASSWORD"]
      }
    }
  },

  it_ops: {
    id: "it_ops",
    name: "IT Operations Integrations",
    adapters: {
      terraform: {
        name: "Terraform Cloud",
        description: "Infrastructure as code management",
        authType: "apikey",
        endpoints: {
          listWorkspaces: { method: "GET", path: "https://app.terraform.io/api/v2/organizations/:org/workspaces" },
          getWorkspace: { method: "GET", path: "https://app.terraform.io/api/v2/workspaces/:id" },
          runApply: { method: "POST", path: "https://app.terraform.io/api/v2/runs" },
          runDestroy: { method: "POST", path: "https://app.terraform.io/api/v2/runs", body: { "data": { "attributes": { "is-destroy": true } } } },
          getRun: { method: "GET", path: "https://app.terraform.io/api/v2/runs/:id" },
          getState: { method: "GET", path: "https://app.terraform.io/api/v2/state-version-outputs/:id" }
        },
        envVars: ["TERRAFORM_TOKEN", "TERRAFORM_ORG"]
      },
      terraformEnterprise: {
        name: "Terraform Enterprise",
        description: "Self-hosted Terraform",
        authType: "apikey",
        endpoints: {
          listWorkspaces: { method: "GET", path: "/api/v2/organizations/:org/workspaces" },
          runApply: { method: "POST", path: "/api/v2/runs" },
          getRun: { method: "GET", path: "/api/v2/runs/:id" }
        },
        envVars: ["TFE_TOKEN", "TFE_HOST", "TFE_ORG"]
      },
      pulumi: {
        name: "Pulumi",
        description: "Infrastructure as code",
        authType: "apikey",
        endpoints: {
          listStacks: { method: "GET", path: "https://api.pulumi.com/api/stacks" },
          getStack: { method: "GET", path: "https://api.pulumi.com/api/stacks/:org/:project/:stack" },
          preview: { method: "POST", path: "https://api.pulumi.com/api/stacks/:org/:project/:stack/preview" },
          update: { method: "POST", path: "https://api.pulumi.com/api/stacks/:org/:project/:stack/update" },
          destroy: { method: "POST", path: "https://api.pulumi.com/api/stacks/:org/:project/:stack/destroy" }
        },
        envVars: ["PULUMI_ACCESS_TOKEN", "PULUMI_ORG"]
      },
      ansible: {
        name: "Ansible Tower/AWX",
        description: "Configuration management",
        authType: "oauth2",
        endpoints: {
          listInventories: { method: "GET", path: "/api/v2/inventories" },
          listJobTemplates: { method: "GET", path: "/api/v2/job_templates" },
          launchJob: { method: "POST", path: "/api/v2/job_templates/:id/launch/" },
          getJob: { method: "GET", path: "/api/v2/jobs/:id" },
          getJobOutput: { method: "GET", path: "/api/v2/jobs/:id/stdout/" }
        },
        envVars: ["ANSIBLE_TOWER_URL", "ANSIBLE_TOWER_TOKEN"]
      },
      kubernetes: {
        name: "Kubernetes",
        description: "Container orchestration",
        authType: "bearer",
        endpoints: {
          getPods: { method: "GET", path: "/api/v1/namespaces/:ns/pods" },
          getDeployments: { method: "GET", path: "/apis/apps/v1/namespaces/:ns/deployments" },
          scaleDeployment: { method: "PATCH", path: "/apis/apps/v1/namespaces/:ns/deployments/:name/scale" },
          getServices: { method: "GET", path: "/api/v1/namespaces/:ns/services" },
          getNodes: { method: "GET", path: "/api/v1/nodes" }
        },
        envVars: ["KUBERNETES_API_URL", "KUBERNETES_TOKEN"]
      },
      argocd: {
        name: "ArgoCD",
        description: "GitOps continuous delivery",
        authType: "bearer",
        endpoints: {
          listApps: { method: "GET", path: "/api/v1/applications" },
          getApp: { method: "GET", path: "/api/v1/applications/:name" },
          syncApp: { method: "POST", path: "/api/v1/applications/:name/sync" },
          refreshApp: { method: "GET", path: "/api/v1/applications/:name/refresh" }
        },
        envVars: ["ARGOCD_URL", "ARGOCD_TOKEN"]
      },
      datadog: {
        name: "Datadog",
        description: "Monitoring and observability",
        authType: "apikey",
        endpoints: {
          queryMetrics: { method: "POST", path: "https://api.datadoghq.com/api/v1/query" },
          getHosts: { method: "GET", path: "https://api.datadoghq.com/api/v1/hosts" },
          postEvent: { method: "POST", path: "https://api.datadoghq.com/api/v1/events" },
          createMonitor: { method: "POST", path: "https://api.datadoghq.com/api/v1/monitor" },
          getMonitors: { method: "GET", path: "https://api.datadoghq.com/api/v1/monitor" }
        },
        envVars: ["DATADOG_API_KEY", "DATADOG_APP_KEY"]
      },
      pagerduty: {
        name: "PagerDuty",
        description: "Incident response and on-call",
        authType: "apikey",
        endpoints: {
          listIncidents: { method: "GET", path: "https://api.pagerduty.com/incidents" },
          getIncident: { method: "GET", path: "https://api.pagerduty.com/incidents/:id" },
          createIncident: { method: "POST", path: "https://api.pagerduty.com/incidents" },
          acknowledge: { method: "PUT", path: "https://api.pagerduty.com/incidents/:id" },
          listServices: { method: "GET", path: "https://api.pagerduty.com/services" },
          listOnCall: { method: "GET", path: "https://api.pagerduty.com/oncalls" }
        },
        envVars: ["PAGERDUTY_API_KEY", "PAGERDUTY_ROUTING_KEY"]
      },
      newrelic: {
        name: "New Relic",
        description: "APM and observability",
        authType: "apikey",
        endpoints: {
          queryNRQL: { method: "POST", path: "https://api.newrelic.com/graphql" },
          listApps: { method: "GET", path: "https://api.newrelic.com/v2/applications.json" },
          getAlerts: { method: "GET", path: "https://api.newrelic.com/v2/alerts_violations.json" }
        },
        envVars: ["NEWRELIC_API_KEY", "NEWRELIC_ACCOUNT_ID"]
      },
      splunk: {
        name: "Splunk",
        description: "Log analytics and SIEM",
        authType: "bearer",
        endpoints: {
          search: { method: "POST", path: "/services/search/jobs" },
          getSearch: { method: "GET", path: "/services/search/jobs/:id" },
          getResults: { method: "GET", path: "/services/search/jobs/:id/results" }
        },
        envVars: ["SPLUNK_URL", "SPLUNK_TOKEN"]
      },
      grafana: {
        name: "Grafana",
        description: "Dashboards and visualization",
        authType: "apikey",
        endpoints: {
          listDashboards: { method: "GET", path: "/api/search" },
          getDashboard: { method: "GET", path: "/api/dashboards/uid/:uid" },
          createDashboard: { method: "POST", path: "/api/dashboards/db" },
          listAlerts: { method: "GET", path: "/api/alerts" }
        },
        envVars: ["GRAFANA_URL", "GRAFANA_API_KEY"]
      }
    }
  },

  devops: {
    id: "devops",
    name: "DevOps & CI/CD Integrations",
    adapters: {
      jenkins: {
        name: "Jenkins",
        description: "CI/CD automation server",
        authType: "basic",
        endpoints: {
          listJobs: { method: "GET", path: "/api/json" },
          getJob: { method: "GET", path: "/job/:name/api/json" },
          build: { method: "POST", path: "/job/:name/build" },
          buildWithParams: { method: "POST", path: "/job/:name/buildWithParameters" },
          getBuild: { method: "GET", path: "/job/:name/:build/api/json" },
          getConsole: { method: "GET", path: "/job/:name/:build/consoleText" }
        },
        envVars: ["JENKINS_URL", "JENKINS_USER", "JENKINS_TOKEN"]
      },
      github_actions: {
        name: "GitHub Actions",
        description: "CI/CD workflows",
        authType: "apikey",
        endpoints: {
          listWorkflows: { method: "GET", path: "https://api.github.com/repos/:owner/:repo/actions/workflows" },
          triggerWorkflow: { method: "POST", path: "https://api.github.com/repos/:owner/:repo/actions/workflows/:id/dispatches" },
          listRuns: { method: "GET", path: "https://api.github.com/repos/:owner/:repo/actions/runs" },
          getRun: { method: "GET", path: "https://api.github.com/repos/:owner/:repo/actions/runs/:id" },
          cancelRun: { method: "POST", path: "https://api.github.com/repos/:owner/:repo/actions/runs/:id/cancel" },
          getLogs: { method: "GET", path: "https://api.github.com/repos/:owner/:repo/actions/runs/:id/logs" }
        },
        envVars: ["GITHUB_TOKEN"]
      },
      circleci: {
        name: "CircleCI",
        description: "CI/CD platform",
        authType: "apikey",
        endpoints: {
          listPipelines: { method: "GET", path: "https://circleci.com/api/v2/pipeline" },
          triggerPipeline: { method: "POST", path: "https://circleci.com/api/v2/project/:slug/pipeline" },
          getWorkflow: { method: "GET", path: "https://circleci.com/api/v2/workflow/:id" },
          cancelWorkflow: { method: "POST", path: "https://circleci.com/api/v2/workflow/:id/cancel" }
        },
        envVars: ["CIRCLECI_TOKEN"]
      },
      azure_devops: {
        name: "Azure DevOps",
        description: "Microsoft DevOps suite",
        authType: "basic",
        endpoints: {
          listPipelines: { method: "GET", path: "/:org/:project/_apis/pipelines" },
          runPipeline: { method: "POST", path: "/:org/:project/_apis/pipelines/:id/runs" },
          getRun: { method: "GET", path: "/:org/:project/_apis/pipelines/:id/runs/:runId" },
          listRepos: { method: "GET", path: "/:org/:project/_apis/git/repositories" }
        },
        envVars: ["AZURE_DEVOPS_TOKEN", "AZURE_DEVOPS_ORG"]
      },
      gitlab_ci: {
        name: "GitLab CI",
        description: "GitLab CI/CD",
        authType: "apikey",
        endpoints: {
          listPipelines: { method: "GET", path: "/projects/:id/pipelines" },
          triggerPipeline: { method: "POST", path: "/projects/:id/pipeline" },
          getPipeline: { method: "GET", path: "/projects/:id/pipelines/:pipeline_id" },
          retryPipeline: { method: "POST", path: "/projects/:id/pipelines/:pipeline_id/retry" },
          cancelPipeline: { method: "POST", path: "/projects/:id/pipelines/:pipeline_id/cancel" }
        },
        envVars: ["GITLAB_TOKEN", "GITLAB_URL"]
      },
      docker_registry: {
        name: "Docker Registry",
        description: "Container image registry",
        authType: "basic",
        endpoints: {
          listRepositories: { method: "GET", path: "/v2/_catalog" },
          listTags: { method: "GET", path: "/v2/:name/tags/list" },
          getManifest: { method: "GET", path: "/v2/:name/manifests/:reference" }
        },
        envVars: ["DOCKER_REGISTRY_URL", "DOCKER_REGISTRY_USER", "DOCKER_REGISTRY_PASSWORD"]
      },
      harbor: {
        name: "Harbor",
        description: "Enterprise container registry",
        authType: "basic",
        endpoints: {
          listProjects: { method: "GET", path: "/api/v2.0/projects" },
          listRepos: { method: "GET", path: "/api/v2.0/projects/:project/repositories" },
          scanImage: { method: "POST", path: "/api/v2.0/projects/:project/repositories/:repo/artifacts/:reference/scan" },
          getVulnerabilities: { method: "GET", path: "/api/v2.0/projects/:project/repositories/:repo/artifacts/:reference/additions/vulnerabilities" }
        },
        envVars: ["HARBOR_URL", "HARBOR_USER", "HARBOR_PASSWORD"]
      },
      sonarqube: {
        name: "SonarQube",
        description: "Code quality analysis",
        authType: "apikey",
        endpoints: {
          getMetrics: { method: "GET", path: "/api/measures/component" },
          getIssues: { method: "GET", path: "/api/issues/search" },
          getQualityGate: { method: "GET", path: "/api/qualitygates/project_status" },
          listProjects: { method: "GET", path: "/api/projects/search" }
        },
        envVars: ["SONARQUBE_URL", "SONARQUBE_TOKEN"]
      },
      nexus: {
        name: "Nexus Repository",
        description: "Artifact repository manager",
        authType: "basic",
        endpoints: {
          listRepositories: { method: "GET", path: "/service/rest/v1/repositories" },
          searchComponents: { method: "GET", path: "/service/rest/v1/search" },
          getComponent: { method: "GET", path: "/service/rest/v1/components/:id" }
        },
        envVars: ["NEXUS_URL", "NEXUS_USER", "NEXUS_PASSWORD"]
      }
    }
  },

  code: {
    id: "code",
    name: "Development Integrations",
    adapters: {
      github: {
        name: "GitHub",
        description: "Repositories, issues, PRs, actions",
        authType: "apikey",
        endpoints: {
          getRepo: { method: "GET", path: "https://api.github.com/repos/:owner/:repo" },
          listIssues: { method: "GET", path: "https://api.github.com/repos/:owner/:repo/issues" },
          createIssue: { method: "POST", path: "https://api.github.com/repos/:owner/:repo/issues" },
          createPR: { method: "POST", path: "https://api.github.com/repos/:owner/:repo/pulls" },
          listWorkflows: { method: "GET", path: "https://api.github.com/repos/:owner/:repo/actions/workflows" }
        },
        envVars: ["GITHUB_TOKEN"]
      },
      gitlab: {
        name: "GitLab",
        description: "Git hosting and CI/CD",
        authType: "apikey",
        endpoints: {
          getProject: { method: "GET", path: "/projects/:id" },
          listIssues: { method: "GET", path: "/projects/:id/issues" },
          createMR: { method: "POST", path: "/projects/:id/merge_requests" },
          triggerPipeline: { method: "POST", path: "/projects/:id/pipeline" }
        },
        envVars: ["GITLAB_TOKEN", "GITLAB_URL"]
      },
      vercel: {
        name: "Vercel",
        description: "Deployments and edge functions",
        authType: "apikey",
        endpoints: {
          getDeployments: { method: "GET", path: "/deployments" },
          createDeployment: { method: "POST", path: "/deployments" },
          getLogs: { method: "GET", path: "/deployments/:id/events" }
        },
        envVars: ["VERCEL_TOKEN"]
      },
      docker: {
        name: "Docker Hub",
        description: "Container registry",
        authType: "apikey",
        endpoints: {
          getRepositories: { method: "GET", path: "/repositories/:namespace" },
          getTags: { method: "GET", path: "/repositories/:namespace/:repo/tags" }
        },
        envVars: ["DOCKER_USERNAME", "DOCKER_PASSWORD"]
      },
      sentry: {
        name: "Sentry",
        description: "Error tracking and monitoring",
        authType: "apikey",
        endpoints: {
          getIssues: { method: "GET", path: "/projects/:org/:project/issues" },
          getEvents: { method: "GET", path: "/projects/:org/:project/events" }
        },
        envVars: ["SENTRY_TOKEN"]
      },
      datadog: {
        name: "Datadog",
        description: "Monitoring and analytics",
        authType: "apikey",
        endpoints: {
          queryMetrics: { method: "POST", path: "/api/v1/query" },
          getHosts: { method: "GET", path: "/api/v1/hosts" },
          postEvent: { method: "POST", path: "/api/v1/events" }
        },
        envVars: ["DATADOG_API_KEY", "DATADOG_APP_KEY"]
      },
      linear: {
        name: "Linear",
        description: "Issue tracking",
        authType: "apikey",
        endpoints: {
          getIssues: { method: "POST", path: "/graphql" },
          createIssue: { method: "POST", path: "/graphql" }
        },
        envVars: ["LINEAR_API_KEY"]
      },
      jira: {
        name: "Jira",
        description: "Project and issue tracking",
        authType: "oauth2",
        endpoints: {
          searchIssues: { method: "GET", path: "/search" },
          getIssue: { method: "GET", path: "/issue/:id" },
          createIssue: { method: "POST", path: "/issue" }
        },
        envVars: ["JIRA_EMAIL", "JIRA_API_TOKEN", "JIRA_DOMAIN"]
      }
    }
  },

  medical: {
    id: "medical",
    name: "Healthcare Integrations",
    adapters: {
      epic: {
        name: "Epic FHIR",
        description: "EHR data via FHIR API",
        authType: "oauth2",
        endpoints: {
          getPatient: { method: "GET", path: "/Patient/:id" },
          getObservations: { method: "GET", path: "/Observation" },
          getMedications: { method: "GET", path: "/MedicationRequest" },
          getConditions: { method: "GET", path: "/Condition" }
        },
        envVars: ["EPIC_CLIENT_ID", "EPIC_CLIENT_SECRET"]
      },
      fhir: {
        name: "SMART FHIR",
        description: "Standard healthcare data exchange",
        authType: "oauth2",
        endpoints: {
          searchPatients: { method: "GET", path: "/Patient" },
          getResources: { method: "GET", path: "/:resourceType" }
        },
        envVars: ["FHIR_CLIENT_ID", "FHIR_CLIENT_SECRET", "FHIR_URL"]
      },
      openfda: {
        name: "OpenFDA",
        description: "FDA drug and device data",
        authType: "apikey",
        endpoints: {
          drugLabel: { method: "GET", path: "https://api.fda.gov/drug/label.json" },
          drugAdverse: { method: "GET", path: "https://api.fda.gov/drug/event.json" },
          deviceRecall: { method: "GET", path: "https://api.fda.gov/device/recall.json" }
        },
        envVars: ["FDA_API_KEY"]
      },
      pubmed: {
        name: "PubMed",
        description: "Medical literature search",
        authType: "none",
        endpoints: {
          search: { method: "GET", path: "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi" },
          fetch: { method: "GET", path: "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi" }
        },
        envVars: ["PUBMED_API_KEY"]
      },
      infermedica: {
        name: "Infermedica",
        description: "Symptom checker and triage",
        authType: "apikey",
        endpoints: {
          parse: { method: "POST", path: "/parse" },
          diagnosis: { method: "POST", path: "/diagnosis" },
          triage: { method: "POST", path: "/triage" }
        },
        envVars: ["INFERMEDICA_APP_ID", "INFERMEDICA_APP_KEY"]
      }
    },
    disclaimer: "For informational purposes only. Not medical advice. Always consult healthcare professionals."
  },

  data_science: {
    id: "data_science",
    name: "Data Science Integrations",
    adapters: {
      bigquery: {
        name: "Google BigQuery",
        description: "Data warehouse queries",
        authType: "oauth2",
        endpoints: {
          query: { method: "POST", path: "/projects/:projectId/queries" },
          getTable: { method: "GET", path: "/projects/:projectId/datasets/:datasetId/tables/:tableId" }
        },
        envVars: ["GOOGLE_CLOUD_PROJECT", "GOOGLE_APPLICATION_CREDENTIALS"]
      },
      snowflake: {
        name: "Snowflake",
        description: "Cloud data platform",
        authType: "apikey",
        endpoints: {
          query: { method: "POST", path: "/api/v2/statements" }
        },
        envVars: ["SNOWFLAKE_ACCOUNT", "SNOWFLAKE_USER", "SNOWFLAKE_PASSWORD"]
      },
      dbt: {
        name: "dbt Cloud",
        description: "Data transformation",
        authType: "apikey",
        endpoints: {
          runJob: { method: "POST", path: "/api/v2/accounts/:accountId/jobs/:jobId/run" },
          getRun: { method: "GET", path: "/api/v2/accounts/:accountId/runs/:runId" }
        },
        envVars: ["DBT_API_KEY", "DBT_ACCOUNT_ID"]
      },
      huggingface: {
        name: "Hugging Face",
        description: "ML models and datasets",
        authType: "apikey",
        endpoints: {
          inference: { method: "POST", path: "https://api-inference.huggingface.co/models/:model" },
          listModels: { method: "GET", path: "https://huggingface.co/api/models" }
        },
        envVars: ["HUGGINGFACE_API_KEY"]
      },
      replicate: {
        name: "Replicate",
        description: "Run ML models in cloud",
        authType: "apikey",
        endpoints: {
          createPrediction: { method: "POST", path: "/predictions" },
          getPrediction: { method: "GET", path: "/predictions/:id" }
        },
        envVars: ["REPLICATE_API_KEY"]
      },
      anthropic: {
        name: "Anthropic",
        description: "Claude API for AI",
        authType: "apikey",
        endpoints: {
          messages: { method: "POST", path: "https://api.anthropic.com/v1/messages" }
        },
        envVars: ["ANTHROPIC_API_KEY"]
      }
    }
  }
};

export class AdapterRegistry {
  constructor() {
    this.adapters = INDUSTRY_ADAPTERS;
    this.connections = new Map();
  }

  getIndustryAdapters(industryId) {
    return this.adapters[industryId]?.adapters || {};
  }

  getAdapterConfig(industryId, adapterId) {
    return this.adapters[industryId]?.adapters?.[adapterId] || null;
  }

  listIndustries() {
    return Object.entries(this.adapters).map(([id, data]) => ({
      id,
      name: data.name,
      adapterCount: Object.keys(data.adapters).length
    }));
  }

  getRequiredEnvVars(industryId, adapterId) {
    const adapter = this.getAdapterConfig(industryId, adapterId);
    return adapter?.envVars || [];
  }

  checkEnvConfigured(industryId, adapterId) {
    const required = this.getRequiredEnvVars(industryId, adapterId);
    const configured = required.filter(v => process.env[v]);
    return {
      configured: configured.length === required.length,
      missing: required.filter(v => !process.env[v]),
      found: configured
    };
  }

  async callAdapter(industryId, adapterId, endpoint, params = {}) {
    const adapter = this.getAdapterConfig(industryId, adapterId);
    if (!adapter) {
      throw new Error(`Adapter not found: ${industryId}/${adapterId}`);
    }

    const endpointConfig = adapter.endpoints?.[endpoint];
    if (!endpointConfig) {
      throw new Error(`Endpoint not found: ${endpoint}`);
    }

    if (adapter.local && adapter.functions?.[endpoint]) {
      return adapter.functions[endpoint](...Object.values(params));
    }

    const envCheck = this.checkEnvConfigured(industryId, adapterId);
    if (!envCheck.configured) {
      throw new Error(`Missing environment variables: ${envCheck.missing.join(", ")}`);
    }

    const url = this.buildUrl(endpointConfig, params);
    const headers = this.buildHeaders(adapter, industryId, adapterId);
    
    const response = await fetch(url, {
      method: endpointConfig.method,
      headers,
      body: endpointConfig.method !== "GET" ? JSON.stringify(params) : undefined
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  buildUrl(endpointConfig, params) {
    let url = endpointConfig.path;
    
    for (const [key, value] of Object.entries(params)) {
      url = url.replace(`:${key}`, encodeURIComponent(value));
    }

    if (endpointConfig.params) {
      const searchParams = new URLSearchParams(endpointConfig.params);
      for (const [key, value] of Object.entries(params)) {
        if (!url.includes(`:${key}`)) {
          searchParams.append(key, value);
        }
      }
      url += `?${searchParams.toString()}`;
    }

    return url;
  }

  buildHeaders(adapter, industryId, adapterId) {
    const headers = { "Content-Type": "application/json" };

    if (adapter.authType === "apikey") {
      const keyVar = adapter.envVars.find(v => v.includes("API_KEY") || v.includes("TOKEN"));
      if (keyVar && process.env[keyVar]) {
        if (industryId === "finance" && adapterId === "alpha_vantage") {
          return headers;
        }
        headers["Authorization"] = `Bearer ${process.env[keyVar]}`;
      }
    }

    return headers;
  }
}

export const adapterRegistry = new AdapterRegistry();
