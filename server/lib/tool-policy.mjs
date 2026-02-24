function wildcardToRegex(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function matchesAny(patterns, value) {
  return patterns.some((pattern) => wildcardToRegex(pattern).test(value));
}

function resolveInputPolicy(inputPolicies, toolId) {
  if (!inputPolicies || typeof inputPolicies !== "object") {
    return null;
  }

  const entries = Object.entries(inputPolicies);
  for (const [pattern, rules] of entries) {
    if (wildcardToRegex(pattern).test(toolId)) {
      return rules;
    }
  }

  return null;
}

function checkInputConstraints({ toolId, input, inputPolicies }) {
  const rules = resolveInputPolicy(inputPolicies, toolId);
  if (!rules || typeof rules !== "object") {
    return { ok: true };
  }

  if (Array.isArray(rules.allowedActions) && rules.allowedActions.length > 0) {
    const action = String(input?.action || "");
    if (!rules.allowedActions.includes(action)) {
      return { ok: false, reason: `Action not allowed for ${toolId}: ${action || "(missing)"}` };
    }
  }

  if (Array.isArray(rules.requiredFields)) {
    for (const field of rules.requiredFields) {
      if (input?.[field] === undefined || input?.[field] === null || input?.[field] === "") {
        return { ok: false, reason: `Missing required field for ${toolId}: ${field}` };
      }
    }
  }

  if (Array.isArray(rules.forbiddenPatterns) && rules.forbiddenPatterns.length > 0) {
    const raw = JSON.stringify(input ?? {});
    for (const pattern of rules.forbiddenPatterns) {
      try {
        const regex = new RegExp(pattern, "i");
        if (regex.test(raw)) {
          return { ok: false, reason: `Input blocked by policy for ${toolId}` };
        }
      } catch {
        return { ok: false, reason: `Invalid forbidden pattern in policy: ${pattern}` };
      }
    }
  }

  return { ok: true };
}

export function checkToolPermission({ policy, toolId, input }) {
  const allowPatterns = Array.isArray(policy?.allowPatterns) ? policy.allowPatterns : ["*"];
  const denyPatterns = Array.isArray(policy?.denyPatterns) ? policy.denyPatterns : [];

  if (matchesAny(denyPatterns, toolId)) {
    return { ok: false, reason: `Blocked by deny policy: ${toolId}` };
  }

  if (!matchesAny(allowPatterns, toolId)) {
    return { ok: false, reason: `Not allowed by policy: ${toolId}` };
  }

  if (policy?.approvalMode === "manual") {
    return { ok: false, reason: `Manual approval required for ${toolId}` };
  }

  const inputCheck = checkInputConstraints({
    toolId,
    input,
    inputPolicies: policy?.inputPolicies
  });
  if (!inputCheck.ok) {
    return inputCheck;
  }

  return { ok: true };
}
