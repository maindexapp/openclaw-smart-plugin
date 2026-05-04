import { resolveConfig, type MaindexPluginConfig } from "./config.js";
import { discoverTools, callTool } from "./mcp-client.js";
import { exec } from "node:child_process";

interface PluginApi {
  registerTool(def: {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    execute: (params: Record<string, unknown>) => Promise<unknown>;
  }): void;
}

interface PluginContext {
  config?: Partial<MaindexPluginConfig>;
  apiKey?: string;
}

function openBrowserDefault(url: string): void {
  const cmd =
    process.platform === "darwin"
      ? `open "${url}"`
      : process.platform === "win32"
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) {
      console.error(
        `[maindex] Could not open browser. Visit this URL manually:\n${url}`
      );
    }
  });
}

export default {
  id: "maindex",
  name: "Maindex",

  async register(api: PluginApi, context: PluginContext) {
    const config = resolveConfig(context.config);

    let tools: Awaited<ReturnType<typeof discoverTools>>;
    try {
      tools = await discoverTools(
        config,
        openBrowserDefault,
        context.apiKey
      );
    } catch (err) {
      console.error(
        `[maindex] Failed to discover tools from ${config.baseUrl}: ${err}`
      );
      return;
    }

    for (const tool of tools) {
      api.registerTool({
        name: `maindex_${tool.name}`,
        description: tool.description ?? tool.name,
        inputSchema: tool.inputSchema,
        async execute(params: Record<string, unknown>) {
          const result = await callTool(
            config,
            tool.name,
            params,
            openBrowserDefault,
            context.apiKey
          );

          const text = result.content
            .filter((c) => c.type === "text" && c.text)
            .map((c) => c.text)
            .join("\n");

          if (result.isError) {
            throw new Error(text || "Maindex tool call failed");
          }
          return text;
        },
      });
    }

    console.log(
      `[maindex] Registered ${tools.length} tools from ${config.baseUrl}`
    );
  },
};
