function setSecurityHeaders(req, res, next) {
  const mode = req.app?.locals?.securityMode || "balanced";
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=() ");
  if (mode === "open") {
    res.setHeader(
      "content-security-policy",
      "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; connect-src * ws: wss:; frame-ancestors 'none'"
    );
  } else {
    res.setHeader(
      "content-security-policy",
      "default-src 'self'; img-src 'self' https: data:; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self' ws: wss:; frame-ancestors 'none'"
    );
  }
  if (req.secure || req.headers["x-forwarded-proto"] === "https") {
    res.setHeader("strict-transport-security", "max-age=31536000; includeSubDomains");
  }
  next();
}

function corsMiddleware(config) {
  const cors = config?.security?.cors || {};
  const allowOrigin = cors.allowOrigin || "*";
  const allowHeaders = cors.allowHeaders || "Content-Type, Authorization, X-Inbound-Token";
  const allowMethods = cors.allowMethods || "GET, POST, OPTIONS";
  const allowedOrigins = Array.isArray(allowOrigin)
    ? allowOrigin
    : String(allowOrigin)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

  return function corsHandler(req, res, next) {
    const requestOrigin = req.headers.origin;
    const allowAll = allowedOrigins.includes("*");
    const originAllowed = allowAll || (requestOrigin && allowedOrigins.includes(requestOrigin));

    if (allowAll) {
      res.setHeader("access-control-allow-origin", "*");
    } else if (originAllowed) {
      res.setHeader("access-control-allow-origin", requestOrigin);
      res.setHeader("vary", "Origin");
    }

    res.setHeader("access-control-allow-headers", allowHeaders);
    res.setHeader("access-control-allow-methods", allowMethods);

    if (!allowAll && requestOrigin && !originAllowed) {
      res.status(403).json({ error: "Origin not allowed" });
      return;
    }

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  };
}

function createRateLimiter({ windowMs = 60000, max = 90 }) {
  const requests = new Map();

  return function rateLimit(req, res, next) {
    const ip =
      req.headers["x-forwarded-for"]?.split(",")?.[0]?.trim() ||
      req.socket?.remoteAddress ||
      "unknown";
    const now = Date.now();
    const record = requests.get(ip) || { count: 0, resetAt: now + windowMs };

    if (now > record.resetAt) {
      record.count = 0;
      record.resetAt = now + windowMs;
    }

    record.count += 1;
    requests.set(ip, record);

    if (record.count > max) {
      res.status(429).json({ error: "Rate limit exceeded" });
      return;
    }

    next();
  };
}

export function securityMiddleware(config) {
  const rateLimitConfig = config?.security?.rateLimit || {};
  return {
    mode: config?.security?.mode || "balanced",
    cors: corsMiddleware(config),
    headers: setSecurityHeaders,
    rateLimit: createRateLimiter({
      windowMs: Number(rateLimitConfig.windowMs || 60000),
      max: Number(rateLimitConfig.max || 90)
    })
  };
}
