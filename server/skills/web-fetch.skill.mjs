import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";

export const skill = {
  id: "web_fetch",
  name: "Web Fetch",
  description: "Fetch and convert web content to text/markdown for AI consumption. Supports URLs, APIs, and web scraping.",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "URL to fetch"
      },
      format: {
        type: "string",
        enum: ["text", "markdown", "html", "json"],
        description: "Output format (default: markdown)",
        default: "markdown"
      },
      timeout: {
        type: "number",
        description: "Timeout in milliseconds (default: 30000)",
        default: 30000
      },
      headers: {
        type: "object",
        description: "Custom headers to send",
        additionalProperties: { type: "string" }
      },
      selector: {
        type: "string",
        description: "CSS selector to extract specific content"
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

    const format = input?.format || "markdown";
    const timeout = input?.timeout || 30000;
    const headers = input?.headers || {};
    const selector = input?.selector;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const fetchHeaders = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": format === "json" ? "application/json" : "text/html,application/xhtml+xml",
        ...headers
      };

      const response = await fetch(url, {
        headers: fetchHeaders,
        signal: controller.signal,
        redirect: "follow"
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          ok: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          url
        };
      }

      const contentType = response.headers.get("content-type") || "";
      let content = "";
      let extractedFormat = format;

      if (contentType.includes("application/json") || format === "json") {
        const json = await response.json();
        content = JSON.stringify(json, null, 2);
        extractedFormat = "json";
      } else {
        const html = await response.text();
        
        if (selector) {
          const extracted = extractSelector(html, selector);
          content = extracted;
        } else if (format === "html") {
          content = html;
        } else {
          content = htmlToMarkdown(html);
          extractedFormat = "markdown";
        }
      }

      return {
        ok: true,
        url,
        format: extractedFormat,
        content: content.slice(0, 100000),
        truncated: content.length > 100000,
        statusCode: response.status,
        contentType
      };
    } catch (error) {
      return {
        ok: false,
        error: error.name === "AbortError" ? "Request timed out" : error.message,
        url
      };
    }
  }
};

function extractSelector(html, selector) {
  const patterns = {
    title: /<title[^>]*>([^<]+)<\/title>/i,
    body: /<body[^>]*>([\s\S]*?)<\/body>/i,
    main: /<main[^>]*>([\s\S]*?)<\/main>/i,
    article: /<article[^>]*>([\s\S]*?)<\/article>/i
  };

  if (patterns[selector]) {
    const match = html.match(patterns[selector]);
    return match ? stripHtml(match[1]) : "";
  }

  const regex = new RegExp(`<${selector}[^>]*>([\\s\\S]*?)</${selector}>`, "gi");
  const matches = [...html.matchAll(regex)];
  return matches.map(m => stripHtml(m[1])).join("\n\n");
}

function stripHtml(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlToMarkdown(html) {
  let md = html;
  
  md = md.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  md = md.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  md = md.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "");
  md = md.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "");
  md = md.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "");
  md = md.replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, "");
  
  md = md.replace(/<!--[\s\S]*?-->/g, "");
  
  md = md.replace(/<h1[^>]*>([^<]+)<\/h1>/gi, "\n# $1\n\n");
  md = md.replace(/<h2[^>]*>([^<]+)<\/h2>/gi, "\n## $1\n\n");
  md = md.replace(/<h3[^>]*>([^<]+)<\/h3>/gi, "\n### $1\n\n");
  md = md.replace(/<h4[^>]*>([^<]+)<\/h4>/gi, "\n#### $1\n\n");
  md = md.replace(/<h5[^>]*>([^<]+)<\/h5>/gi, "\n##### $1\n\n");
  md = md.replace(/<h6[^>]*>([^<]+)<\/h6>/gi, "\n###### $1\n\n");
  
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "\n$1\n\n");
  md = md.replace(/<br\s*\/?>/gi, "\n");
  md = md.replace(/<hr\s*\/?>/gi, "\n---\n");
  
  md = md.replace(/<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi, "[$2]($1)");
  
  md = md.replace(/<strong[^>]*>([^<]+)<\/strong>/gi, "**$1**");
  md = md.replace(/<b[^>]*>([^<]+)<\/b>/gi, "**$1**");
  md = md.replace(/<em[^>]*>([^<]+)<\/em>/gi, "*$1*");
  md = md.replace(/<i[^>]*>([^<]+)<\/i>/gi, "*$1*");
  md = md.replace(/<code[^>]*>([^<]+)<\/code>/gi, "`$1`");
  md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, "\n```\n$1\n```\n");
  
  md = md.replace(/<li[^>]*>([^<]+)<\/li>/gi, "- $1\n");
  md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, "$1");
  md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, "$1");
  
  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, "\n> $1\n");
  
  md = md.replace(/<img[^>]*alt="([^"]*)"[^>]*src="([^"]+)"[^>]*\/?>/gi, "![ $1]($2)");
  
  md = md.replace(/<[^>]+>/g, "");
  
  md = md.replace(/&nbsp;/g, " ");
  md = md.replace(/&amp;/g, "&");
  md = md.replace(/&lt;/g, "<");
  md = md.replace(/&gt;/g, ">");
  md = md.replace(/&quot;/g, '"');
  
  md = md.replace(/\n{3,}/g, "\n\n");
  md = md.replace(/[ \t]+/g, " ");
  
  return md.trim();
}
