export interface MaindexPluginConfig {
  baseUrl: string;
  authMode: "oauth" | "apiKey";
}

export const DEFAULT_CONFIG: MaindexPluginConfig = {
  baseUrl: "https://maindex.io/mcp",
  authMode: "oauth",
};

export function resolveConfig(
  raw: Partial<MaindexPluginConfig> | undefined
): MaindexPluginConfig {
  return {
    baseUrl: raw?.baseUrl ?? DEFAULT_CONFIG.baseUrl,
    authMode: raw?.authMode ?? DEFAULT_CONFIG.authMode,
  };
}
