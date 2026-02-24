import jwt from "jsonwebtoken";

function getBearerToken(headerValue) {
  if (!headerValue || typeof headerValue !== "string") {
    return null;
  }

  const parts = headerValue.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    return null;
  }

  return parts[1] || null;
}

export function buildAuth(config) {
  const authMode = config?.auth?.mode || "token";
  const jwtSecret = config?.auth?.jwtSecretEnv ? process.env[config.auth.jwtSecretEnv] : null;
  const users = Array.isArray(config?.auth?.users) ? config.auth.users : [];
  const resolvedUsers = users
    .map((user) => {
      const token = user.tokenEnv ? process.env[user.tokenEnv] : null;
      if (!token) {
        return null;
      }
      return {
        id: user.id,
        name: user.name || user.id,
        role: user.role || "member",
        token,
        policy: {
          approvalMode: user?.toolPolicy?.approvalMode || "never",
          allowPatterns: user?.toolPolicy?.allowPatterns || ["*"],
          denyPatterns: user?.toolPolicy?.denyPatterns || []
        }
      };
    })
    .filter(Boolean);

  const authEnabled = resolvedUsers.length > 0 || (authMode === "jwt" && Boolean(jwtSecret));

  function buildDefaultAuth() {
    return {
      userId: "local-owner",
      name: "Local Owner",
      role: "admin",
      policy: { approvalMode: "never", allowPatterns: ["*"], denyPatterns: [] }
    };
  }

  function authenticateToken(rawToken) {
    if (!authEnabled) {
      return { ok: true, auth: buildDefaultAuth() };
    }

    if (authMode === "jwt") {
      if (!jwtSecret) {
        return { ok: false, error: "JWT auth misconfigured", status: 500 };
      }
      if (!rawToken) {
        return { ok: false, error: "Unauthorized", status: 401 };
      }
      try {
        const claims = jwt.verify(rawToken, jwtSecret);
        return {
          ok: true,
          auth: {
            userId: String(claims.sub || claims.user_id || "unknown-user"),
            name: String(claims.name || claims.email || claims.sub || "User"),
            role: String(claims.role || "member"),
            policy: {
              approvalMode: String(claims.approvalMode || "never"),
              allowPatterns: Array.isArray(claims.allowPatterns) ? claims.allowPatterns : ["*"],
              denyPatterns: Array.isArray(claims.denyPatterns) ? claims.denyPatterns : []
            }
          }
        };
      } catch {
        return { ok: false, error: "Unauthorized", status: 401 };
      }
    }

    const user = resolvedUsers.find((candidate) => candidate.token === rawToken);
    if (!user) {
      return { ok: false, error: "Unauthorized", status: 401 };
    }

    return {
      ok: true,
      auth: {
        userId: user.id,
        name: user.name,
        role: user.role,
        policy: user.policy
      }
    };
  }

  return {
    authEnabled,
    authenticateToken,
    middleware(req, res, next) {
      const token = getBearerToken(req.headers.authorization);
      const authResult = authenticateToken(token);
      if (!authResult.ok) {
        res.status(authResult.status || 401).json({ error: authResult.error || "Unauthorized" });
        return;
      }

      req.auth = authResult.auth;
      next();
    }
  };
}
