export const skill = {
  id: "http_client",
  name: "HTTP Client",
  description: "Make HTTP requests to any API endpoint. Supports GET, POST, PUT, DELETE, PATCH with custom headers and body.",
  inputSchema: {
    type: "object",
    properties: {
      method: {
        type: "string",
        enum: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
        description: "HTTP method",
        default: "GET"
      },
      url: {
        type: "string",
        description: "URL to request"
      },
      headers: {
        type: "object",
        description: "HTTP headers",
        additionalProperties: { type: "string" }
      },
      body: {
        description: "Request body (object for JSON, string for raw)"
      },
      timeout: {
        type: "number",
        description: "Timeout in milliseconds (default: 30000)",
        default: 30000
      },
      followRedirects: {
        type: "boolean",
        description: "Follow redirects (default: true)",
        default: true
      }
    },
    required: ["url"],
    additionalProperties: false
  },
  async run({ input }) {
    const url = input?.url;
    if (!url) {
      throw new Error("url is required");
    }

    const method = input?.method || "GET";
    const headers = input?.headers || {};
    const body = input?.body;
    const timeout = input?.timeout || 30000;
    const followRedirects = input?.followRedirects !== false;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const fetchOptions = {
        method,
        headers: {
          "User-Agent": "OpenClaw-Plus/1.0",
          ...headers
        },
        signal: controller.signal,
        redirect: followRedirects ? "follow" : "manual"
      };

      if (body && ["POST", "PUT", "PATCH"].includes(method)) {
        if (typeof body === "object") {
          fetchOptions.headers["Content-Type"] = "application/json";
          fetchOptions.body = JSON.stringify(body);
        } else {
          fetchOptions.body = String(body);
        }
      }

      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);

      const responseHeaders = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const contentType = response.headers.get("content-type") || "";
      let responseBody;

      if (contentType.includes("application/json")) {
        try {
          responseBody = await response.json();
        } catch {
          responseBody = await response.text();
        }
      } else {
        responseBody = await response.text();
        if (responseBody.length > 100000) {
          responseBody = responseBody.slice(0, 100000) + "\n... [truncated]";
        }
      }

      return {
        ok: response.ok,
        method,
        url: response.url,
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: responseBody
      };
    } catch (error) {
      return {
        ok: false,
        error: error.name === "AbortError" ? "Request timed out" : error.message,
        method,
        url
      };
    }
  }
};
