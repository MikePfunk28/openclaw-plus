export const GUARDRAILS = {
  input: {
    pii_detection: {
      id: "pii_detection",
      name: "PII Detection",
      description: "Detect and redact personally identifiable information",
      enabled: true,
      severity: "high",
      patterns: {
        ssn: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
        credit_card: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
        email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        phone: /\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,
        ip_address: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
        api_key: /\b(?:sk-|api-|key-|token-)[a-zA-Z0-9]{20,}\b/gi
      },
      action: "redact",
      replacements: {
        ssn: "[REDACTED_SSN]",
        credit_card: "[REDACTED_CC]",
        email: "[REDACTED_EMAIL]",
        phone: "[REDACTED_PHONE]",
        ip_address: "[REDACTED_IP]",
        api_key: "[REDACTED_KEY]"
      }
    },

    prompt_injection: {
      id: "prompt_injection",
      name: "Prompt Injection Detection",
      description: "Detect attempts to manipulate model behavior",
      enabled: true,
      severity: "critical",
      patterns: [
        /ignore (all )?(previous|above|prior) instructions/i,
        /disregard (all )?(previous|above|prior)/i,
        /you are now/i,
        /act as if/i,
        /pretend (to be|you're)/i,
        /forget (all )?(previous|above)/i,
        /new instructions/i,
        /override (previous|default)/i,
        /system:\s*you/i,
        /\[system\]/i,
        /<\|im_start\|>/i,
        /<\|im_end\|>/i,
        /###\s*instruction/i,
        /###\s*system/i
      ],
      action: "block"
    },

    toxic_content: {
      id: "toxic_content",
      name: "Toxic Content Filter",
      description: "Filter harmful, hateful, or explicit content",
      enabled: true,
      severity: "high",
      categories: ["hate", "harassment", "self_harm", "sexual", "violence"],
      action: "block",
      threshold: 0.8
    },

    jailbreak: {
      id: "jailbreak",
      name: "Jailbreak Detection",
      description: "Detect attempts to bypass safety measures",
      enabled: true,
      severity: "critical",
      patterns: [
        /dan\s*mode/i,
        /do anything now/i,
        /developer mode/i,
        /sudo mode/i,
        /god mode/i,
        /unrestricted/i,
        /no (rules|restrictions|limits)/i,
        /bypass (safety|filter|guard)/i
      ],
      action: "block"
    },

    max_length: {
      id: "max_length",
      name: "Maximum Input Length",
      description: "Limit input size to prevent abuse",
      enabled: true,
      severity: "medium",
      maxLength: 100000,
      action: "truncate"
    }
  },

  output: {
    pii_scrub: {
      id: "pii_scrub",
      name: "Output PII Scrubbing",
      description: "Remove PII from model outputs",
      enabled: true,
      severity: "high",
      patterns: "same_as_input",
      action: "redact"
    },

    hallucination_check: {
      id: "hallucination_check",
      name: "Hallucination Detection",
      description: "Flag potentially fabricated information",
      enabled: true,
      severity: "medium",
      indicators: [
        /i (don't|do not) (have|know|remember)/i,
        /as of my (last|current) (knowledge|training|update)/i,
        /i (cannot|can't|am unable to) (verify|confirm)/i
      ],
      action: "flag"
    },

    bias_detection: {
      id: "bias_detection",
      name: "Bias Detection",
      description: "Detect biased or unfair content",
      enabled: true,
      severity: "medium",
      action: "flag"
    },

    fact_check: {
      id: "fact_check",
      name: "Fact Checking",
      description: "Verify claims against knowledge base",
      enabled: false,
      severity: "low",
      action: "flag"
    }
  },

  tools: {
    dangerous_commands: {
      id: "dangerous_commands",
      name: "Dangerous Command Blocker",
      description: "Block potentially harmful system commands",
      enabled: true,
      severity: "critical",
      patterns: {
        shell: [
          /rm\s+-rf\s+\//i,
          /rm\s+-rf\s+\*/i,
          /:\(\)\{ :|:& \};:/i,
          />\s*\/dev\/sda/i,
          /mkfs/i,
          /dd\s+if=/i,
          /chmod\s+777/i,
          /chown\s+.*:.*\s+\//i
        ],
        windows: [
          /format\s+[a-z]:/i,
          /del\s+\/[sq]\s+\*/i,
          /rmdir\s+\/[sq]\s+/i,
          /cipher\s+\/w:/i,
          /diskpart/i,
          /shutdown/i,
          /bcdedit/i
        ]
      },
      action: "block"
    },

    network_access: {
      id: "network_access",
      name: "Network Access Control",
      description: "Control which URLs/domains can be accessed",
      enabled: true,
      severity: "high",
      allowedDomains: [],
      blockedDomains: [
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
        "169.254.169.254",
        "internal",
        "*.internal",
        "*.local"
      ],
      blockedPorts: [22, 23, 25, 3306, 5432, 6379, 27017],
      action: "block"
    },

    file_access: {
      id: "file_access",
      name: "File Access Control",
      description: "Restrict file system access",
      enabled: true,
      severity: "high",
      allowedPaths: [],
      blockedPaths: [
        "/etc/passwd",
        "/etc/shadow",
        "/etc/hosts",
        "~/.ssh",
        "~/.aws",
        "~/.env",
        "C:\\Windows\\System32",
        "C:\\Users\\*\\AppData"
      ],
      action: "block"
    },

    rate_limiting: {
      id: "rate_limiting",
      name: "Rate Limiting",
      description: "Limit frequency of operations",
      enabled: true,
      severity: "medium",
      limits: {
        per_minute: 60,
        per_hour: 1000,
        per_day: 10000
      },
      action: "throttle"
    }
  }
};

export class GuardrailEngine {
  constructor(config = {}) {
    this.config = { ...GUARDRAILS, ...config };
    this.violations = [];
    this.auditLog = [];
  }

  checkInput(input, context = {}) {
    const results = {
      passed: true,
      violations: [],
      sanitized: input,
      blocked: false
    };

    for (const [id, guardrail] of Object.entries(this.config.input)) {
      if (!guardrail.enabled) continue;

      const check = this.runInputCheck(id, guardrail, input, context);
      
      if (!check.passed) {
        results.violations.push(check);
        
        if (guardrail.action === "block") {
          results.blocked = true;
          results.passed = false;
        } else if (guardrail.action === "redact") {
          results.sanitized = check.sanitized;
        }
        
        this.logViolation(id, guardrail, check, context);
      }
    }

    return results;
  }

  runInputCheck(id, guardrail, input, context) {
    const result = { id, passed: true, details: [] };

    switch (id) {
      case "pii_detection":
        return this.checkPII(guardrail, input);
      
      case "prompt_injection":
        return this.checkPatterns(guardrail, input, "prompt_injection");
      
      case "jailbreak":
        return this.checkPatterns(guardrail, input, "jailbreak");
      
      case "max_length":
        return this.checkLength(guardrail, input);
      
      default:
        return result;
    }
  }

  checkPII(guardrail, input) {
    const result = { id: "pii_detection", passed: true, details: [], sanitized: input };
    let sanitized = input;

    for (const [type, pattern] of Object.entries(guardrail.patterns)) {
      const matches = input.match(pattern);
      if (matches) {
        result.passed = false;
        result.details.push({ type, count: matches.length, samples: matches.slice(0, 3) });
        sanitized = sanitized.replace(pattern, guardrail.replacements[type]);
      }
    }

    result.sanitized = sanitized;
    return result;
  }

  checkPatterns(guardrail, input, id) {
    const result = { id, passed: true, details: [] };

    for (const pattern of guardrail.patterns) {
      if (pattern.test(input)) {
        result.passed = false;
        result.details.push({ pattern: pattern.toString(), matched: true });
      }
    }

    return result;
  }

  checkLength(guardrail, input) {
    const result = { id: "max_length", passed: true, details: [] };

    if (input.length > guardrail.maxLength) {
      result.passed = false;
      result.details.push({ 
        length: input.length, 
        max: guardrail.maxLength,
        action: guardrail.action 
      });
      
      if (guardrail.action === "truncate") {
        result.truncated = input.substring(0, guardrail.maxLength);
      }
    }

    return result;
  }

  checkOutput(output, context = {}) {
    const results = {
      passed: true,
      violations: [],
      sanitized: output,
      flagged: false
    };

    for (const [id, guardrail] of Object.entries(this.config.output)) {
      if (!guardrail.enabled) continue;

      const check = this.runOutputCheck(id, guardrail, output, context);
      
      if (!check.passed) {
        results.violations.push(check);
        
        if (guardrail.action === "block") {
          results.passed = false;
        } else if (guardrail.action === "redact") {
          results.sanitized = check.sanitized || results.sanitized;
        } else if (guardrail.action === "flag") {
          results.flagged = true;
        }
        
        this.logViolation(id, guardrail, check, context);
      }
    }

    return results;
  }

  runOutputCheck(id, guardrail, output, context) {
    const result = { id, passed: true, details: [] };

    switch (id) {
      case "pii_scrub":
        return this.checkPII(guardrail, output);
      
      case "hallucination_check":
        return this.checkPatterns(guardrail, output, "hallucination_check");
      
      default:
        return result;
    }
  }

  checkToolCall(toolId, params, context = {}) {
    const results = {
      passed: true,
      violations: [],
      sanitized: params
    };

    for (const [id, guardrail] of Object.entries(this.config.tools)) {
      if (!guardrail.enabled) continue;

      const check = this.runToolCheck(id, guardrail, toolId, params, context);
      
      if (!check.passed) {
        results.violations.push(check);
        
        if (guardrail.action === "block") {
          results.passed = false;
        }
        
        this.logViolation(id, guardrail, check, { toolId, params, ...context });
      }
    }

    return results;
  }

  runToolCheck(id, guardrail, toolId, params, context) {
    const result = { id, passed: true, details: [] };

    switch (id) {
      case "dangerous_commands":
        return this.checkDangerousCommands(guardrail, toolId, params);
      
      case "network_access":
        return this.checkNetworkAccess(guardrail, params);
      
      case "file_access":
        return this.checkFileAccess(guardrail, params);
      
      default:
        return result;
    }
  }

  checkDangerousCommands(guardrail, toolId, params) {
    const result = { id: "dangerous_commands", passed: true, details: [] };

    if (toolId === "shell_execute" || toolId === "process_control") {
      const command = params.command || params.cmd || "";
      const patterns = [...(guardrail.patterns.shell || []), ...(guardrail.patterns.windows || [])];
      
      for (const pattern of patterns) {
        if (pattern.test(command)) {
          result.passed = false;
          result.details.push({ pattern: pattern.toString(), command });
        }
      }
    }

    return result;
  }

  checkNetworkAccess(guardrail, params) {
    const result = { id: "network_access", passed: true, details: [] };

    const url = params.url || params.uri || params.endpoint || "";
    
    try {
      const parsed = new URL(url);
      
      for (const blocked of guardrail.blockedDomains) {
        if (parsed.hostname.includes(blocked.replace("*", ""))) {
          result.passed = false;
          result.details.push({ blocked: blocked, hostname: parsed.hostname });
        }
      }
      
      if (guardrail.blockedPorts.includes(parseInt(parsed.port))) {
        result.passed = false;
        result.details.push({ blockedPort: parsed.port });
      }
    } catch {
      // Invalid URL, let it pass
    }

    return result;
  }

  checkFileAccess(guardrail, params) {
    const result = { id: "file_access", passed: true, details: [] };

    const path = params.path || params.filepath || params.filename || "";
    
    for (const blocked of guardrail.blockedPaths) {
      const pattern = blocked.replace("*", ".*");
      if (new RegExp(pattern, "i").test(path)) {
        result.passed = false;
        result.details.push({ blocked: blocked, path });
      }
    }

    return result;
  }

  logViolation(guardrailId, guardrail, check, context) {
    const violation = {
      timestamp: Date.now(),
      guardrailId,
      severity: guardrail.severity,
      action: guardrail.action,
      details: check.details,
      context: {
        userId: context.userId,
        sessionId: context.sessionId,
        traceId: context.traceId
      }
    };
    
    this.violations.push(violation);
    this.auditLog.push({
      type: "violation",
      ...violation
    });
  }

  getViolations(limit = 100) {
    return this.violations.slice(-limit);
  }

  getAuditLog(limit = 1000) {
    return this.auditLog.slice(-limit);
  }

  enable(guardrailId) {
    for (const category of Object.values(this.config)) {
      if (guardrailId in category) {
        category[guardrailId].enabled = true;
        return true;
      }
    }
    return false;
  }

  disable(guardrailId) {
    for (const category of Object.values(this.config)) {
      if (guardrailId in category) {
        category[guardrailId].enabled = false;
        return true;
      }
    }
    return false;
  }

  configure(guardrailId, options) {
    for (const category of Object.values(this.config)) {
      if (guardrailId in category) {
        category[guardrailId] = { ...category[guardrailId], ...options };
        return true;
      }
    }
    return false;
  }

  middleware() {
    return async (req, res, next) => {
      const body = req.body;
      
      if (body?.objective || body?.prompt || body?.message) {
        const input = body.objective || body.prompt || body.message;
        const check = this.checkInput(input, { userId: req.auth?.userId });
        
        if (check.blocked) {
          res.status(400).json({
            error: "Input blocked by security guardrails",
            violations: check.violations.map(v => v.id)
          });
          return;
        }
        
        req.sanitizedInput = check.sanitized;
      }
      
      next();
    };
  }
}

export const guardrails = new GuardrailEngine();

export function applyAwsGuardrails(config = {}) {
  return {
    contentPolicy: {
      enabled: config.contentPolicy !== false,
      filters: {
        hate: config.hateThreshold || "HIGH",
        insults: config.insultsThreshold || "HIGH",
        sexual: config.sexualThreshold || "HIGH",
        violence: config.violenceThreshold || "HIGH",
        misconduct: config.misconductThreshold || "HIGH",
        promptAttack: config.promptAttack !== false
      }
    },
    sensitiveInformation: {
      enabled: config.sensitiveInfo !== false,
      piiEntities: config.piiEntities || ["ALL"],
      regexPatterns: config.regexPatterns || []
    },
    topicPolicy: {
      enabled: config.topicPolicy !== false,
      deniedTopics: config.deniedTopics || []
    },
    wordPolicy: {
      enabled: config.wordPolicy !== false,
      managedWordLists: config.managedWordLists || ["PROFANITY"],
      words: config.blockedWords || []
    }
  };
}
