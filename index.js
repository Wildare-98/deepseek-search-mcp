#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_KEY = process.env.DEEPSEEK_API_KEY;
const BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";

if (!API_KEY) {
  console.error("[deepseek-mcp] DEEPSEEK_API_KEY environment variable is required.");
  process.exit(1);
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

async function callDeepSeek(path, body) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res;
    try {
      res = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err) {
      lastError = new Error(`Network error calling DeepSeek: ${err.message}`);
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        continue;
      }
      throw lastError;
    }

    const data = await res.json().catch(() => null);
    if (res.ok) return data;

    const apiMessage = data?.error?.message || res.statusText;
    lastError = new Error(`DeepSeek API error (HTTP ${res.status}): ${apiMessage}`);
    if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      continue;
    }
    throw lastError;
  }
  throw lastError;
}

function textResult(text) {
  return { content: [{ type: "text", text }] };
}

function errorResult(err) {
  return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
}

function formatResults(results) {
  if (!results || results.length === 0) {
    return "No results found.";
  }
  return results
    .map((r, i) => {
      const lines = [
        `## ${i + 1}. ${r.title}`,
        `URL: ${r.url}`,
        `Score: ${r.rerank_score}/3 | Authority: ${r.authority}/4 | Date: ${r.date ?? "unknown"}${r.site_name ? ` | Site: ${r.site_name}` : ""}`,
        `Summary: ${r.summary || r.snippet}`,
      ];
      if (r.content) lines.push(`Content:\n${r.content}`);
      return lines.join("\n");
    })
    .join("\n\n---\n\n");
}

const server = new McpServer({
  name: "deepseek-search-mcp",
  version: "1.0.0",
});

server.registerTool(
  "deepseek_search",
  {
    title: "DeepSeek Web Search",
    description:
      "Search the web using DeepSeek's search engine. Returns structured results with title, URL, summary, date, relevance score (0-3, >=1.5 is good) and authority (0-4, >=3 is highly authoritative). Supports search operators: site:, -site:, \"exact phrase\", lang:zh,en, after:2025-01-01, before:2026. Keep need_content=false for an overview, then use deepseek_fetch on the best URLs to read full pages.",
    inputSchema: {
      query: z
        .string()
        .min(1)
        .max(128)
        .describe("Search query, 1-128 characters. Supports site:, lang:, after:, before:, quoted phrases."),
      count: z.number().int().min(1).max(50).default(10).describe("Number of results, 1-50. Default 10."),
      need_content: z
        .boolean()
        .default(false)
        .describe("If true, include full page content in each result. Prefer false, then fetch selected URLs."),
      ori_question: z
        .string()
        .max(128)
        .optional()
        .describe("The user's original question that triggered the search; helps the engine understand intent."),
      localization: z.string().optional().describe("IP address used to prioritize localized results."),
    },
  },
  async ({ query, count, need_content, ori_question, localization }) => {
    try {
      const data = await callDeepSeek("/v1/tools/search", {
        query,
        count,
        need_content,
        ...(ori_question !== undefined && { ori_question }),
        ...(localization !== undefined && { localization }),
      });
      return textResult(formatResults(data.results));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "deepseek_fetch",
  {
    title: "DeepSeek Web Fetch",
    description:
      "Fetch a single web page and return its content as Markdown. Use after deepseek_search to read a specific URL in full. Subject to the target site's availability and access policy.",
    inputSchema: {
      url: z
        .string()
        .url()
        .max(8192)
        .describe("HTTP/HTTPS URL of the page to fetch. Must not contain username or password."),
    },
  },
  async ({ url }) => {
    try {
      const data = await callDeepSeek("/v1/tools/fetch", { url });
      const title = data.title ? `# ${data.title}\n\n` : "";
      return textResult(`${title}${data.content || "(no extractable content)"}`);
    } catch (err) {
      return errorResult(err);
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[deepseek-mcp] Server running on stdio.");
