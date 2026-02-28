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

export function buildUnifiedAuth(config, userManager) {
  const authMode = config?.auth?.mode || "token";
  const jwtSecret = config?.auth?.jwtSecretEnv
    ? process.env[config.auth.jwtSecretEnv]
    : null;
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
          denyPatterns: user?.toolPolicy?.denyPatterns || [],
        },
      };
    })
    .filter(Boolean);

  const authEnabled =
    resolvedUsers.length > 0 ||
    (authMode === "jwt" && Boolean(jwtSecret)) ||
    (userManager && userManager.users.size > 0);

  function buildDefaultAuth() {
    return {
      userId: "local-owner",
      name: "Local Owner",
      role: "admin",
      policy: { approvalMode: "never", allowPatterns: ["*"], denyPatterns: [] },
    };
  }

  async function authenticateToken(rawToken) {
    if (!authEnabled) {
      return { ok: true, auth: buildDefaultAuth() };
    }

    if (!rawToken) {
      return { ok: false, error: "Unauthorized", status: 401 };
    }

    // Try JWT auth first
    if (authMode === "jwt" && jwtSecret) {
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
              allowPatterns: Array.isArray(claims.allowPatterns)
                ? claims.allowPatterns
                : ["*"],
              denyPatterns: Array.isArray(claims.denyPatterns)
                ? claims.denyPatterns
                : [],
            },
          },
        };
      } catch {
        // JWT verification failed, continue to other auth methods
      }
    }

    // Try static token auth
    const staticUser = resolvedUsers.find(
      (candidate) => candidate.token === rawToken,
    );
    if (staticUser) {
      return {
        ok: true,
        auth: {
          userId: staticUser.id,
          name: staticUser.name,
          role: staticUser.role,
          policy: staticUser.policy,
        },
      };
    }

    // Try UserManager session token
    if (userManager) {
      const sessionResult = await userManager.validateSession(rawToken);
      if (sessionResult.valid) {
        return {
          ok: true,
          auth: {
            userId: sessionResult.user.id,
            name: sessionResult.user.name,
            role: sessionResult.user.role,
            policy: {
              approvalMode: "never",
              allowPatterns: ["*"],
              denyPatterns: [],
            },
          },
        };
      }

      // Try UserManager API key
      const apiKeyResult = await userManager.validateApiKey(rawToken);
      if (apiKeyResult.valid) {
        return {
          ok: true,
          auth: {
            userId: apiKeyResult.user.id,
            name: apiKeyResult.user.name,
            role: apiKeyResult.user.role,
            policy: {
              approvalMode: "never",
              allowPatterns: ["*"],
              denyPatterns: [],
            },
          },
        };
      }
    }

    return { ok: false, error: "Unauthorized", status: 401 };
  }

  return {
    authEnabled,
    authenticateToken,
    middleware: (req, res, next) => {
      const token = getBearerToken(req.headers.authorization);
      console.log("[unified-auth] Middleware called for:", req.path);
      console.log("[unified-auth] Token present:", !!token);

      authenticateToken(token)
        .then((authResult) => {
          console.log(
            "[unified-auth] Auth result:",
            authResult.ok ? "SUCCESS" : "FAILED",
          );

          if (!authResult.ok) {
            console.log("[unified-auth] Returning error:", authResult.error);
            res
              .status(authResult.status || 401)
              .json({ error: authResult.error || "Unauthorized" });
            return;
          }

          req.auth = authResult.auth;
          console.log("[unified-auth] Set req.auth:", {
            userId: req.auth.userId,
            name: req.auth.name,
            role: req.auth.role,
          });
          console.log("[unified-auth] Calling next()");
          next();
        })
        .catch((error) => {
          console.error("[unified-auth] Authentication error:", error);
          res.status(500).json({ error: "Authentication failed" });
        });
    },
  };
}
