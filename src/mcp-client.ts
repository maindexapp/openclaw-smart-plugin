import { getValidToken } from "./oauth.js";
import type { MaindexPluginConfig } from "./config.js";

interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

interface McpToolResult {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
}

interface McpJsonRpcResponse<T> {
  jsonrpc: "2.0";
  id: number | string;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

async function mcpRequest<T>(
  baseUrl: string,
  method: string,
  params: Record<string, unknown>,
  headers: Record<string, string>
): Promise<T> {
  const res = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...headers,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MCP request ${method} failed: ${res.status} — ${text}`);
  }

  const json = (await res.json()) as McpJsonRpcResponse<T>;
  if (json.error) {
    throw new Error(
      `MCP error (${json.error.code}): ${json.error.message}`
    );
  }
  return json.result as T;
}

function buildAuthHeaders(
  config: MaindexPluginConfig,
  accessToken?: string,
  apiKey?: string
): Record<string, string> {
  if (config.authMode === "apiKey" && apiKey) {
    return { "X-API-Key": apiKey };
  }
  if (accessToken) {
    return { Authorization: `Bearer ${accessToken}` };
  }
  return {};
}

export async function discoverTools(
  config: MaindexPluginConfig,
  openBrowser: (url: string) => void,
  apiKey?: string
): Promise<McpToolDefinition[]> {
  let accessToken: string | undefined;
  if (config.authMode === "oauth") {
    accessToken = await getValidToken(config.baseUrl, openBrowser);
  }

  const headers = buildAuthHeaders(config, accessToken, apiKey);
  const result = await mcpRequest<{ tools: McpToolDefinition[] }>(
    config.baseUrl,
    "tools/list",
    {},
    headers
  );
  return result.tools;
}

export async function callTool(
  config: MaindexPluginConfig,
  toolName: string,
  args: Record<string, unknown>,
  openBrowser: (url: string) => void,
  apiKey?: string
): Promise<McpToolResult> {
  let accessToken: string | undefined;
  if (config.authMode === "oauth") {
    accessToken = await getValidToken(config.baseUrl, openBrowser);
  }

  const headers = buildAuthHeaders(config, accessToken, apiKey);
  return mcpRequest<McpToolResult>(
    config.baseUrl,
    "tools/call",
    { name: toolName, arguments: args },
    headers
  );
}
