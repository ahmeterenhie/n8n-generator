// Browser-side storage for the user's AI provider connections. Never stored on the server.

export type Provider = "openai" | "anthropic";

export const PROVIDERS: Provider[] = ["anthropic", "openai"];

export const MODEL_OPTIONS: Record<Provider, readonly string[]> = {
  openai: ["gpt-5-codex", "codex-mini-latest", "gpt-4.1", "gpt-4o"],
  anthropic: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"],
};

export const DEFAULT_MODELS: Record<Provider, string> = {
  openai: MODEL_OPTIONS.openai[0],
  anthropic: MODEL_OPTIONS.anthropic[0],
};

export interface Connection {
  apiKey: string;
  model: string;
}

export interface ApiConfig {
  provider: Provider;
  connections: Record<Provider, Connection>;
}

const STORAGE_KEY = "n8nforge_api_config";

function emptyConfig(): ApiConfig {
  return {
    provider: "openai",
    connections: {
      openai: { apiKey: "", model: DEFAULT_MODELS.openai },
      anthropic: { apiKey: "", model: DEFAULT_MODELS.anthropic },
    },
  };
}

export function loadApiConfig(): ApiConfig {
  const config = emptyConfig();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return config;
    const parsed = JSON.parse(raw);
    // Older versions stored a single OpenAI connection: { apiKey, model }
    if (typeof parsed?.apiKey === "string") {
      config.connections.openai = { apiKey: parsed.apiKey, model: parsed.model || DEFAULT_MODELS.openai };
      return config;
    }
    if (parsed?.provider === "anthropic" || parsed?.provider === "openai") config.provider = parsed.provider;
    for (const p of PROVIDERS) {
      const c = parsed?.connections?.[p];
      if (c) config.connections[p] = { apiKey: c.apiKey ?? "", model: c.model || DEFAULT_MODELS[p] };
    }
  } catch {
    // Storage blocked or corrupted: fall back to defaults
  }
  return config;
}

export function saveApiConfig(config: ApiConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Ignore: the page still works for this visit
  }
}

/** The connection used for generating: the selected provider's key and model. */
export function activeConnection(config: ApiConfig): Connection & { provider: Provider } {
  return { provider: config.provider, ...config.connections[config.provider] };
}

export function maskKey(key: string): string {
  return key.length > 10 ? `${key.slice(0, 5)}…${key.slice(-4)}` : "••••";
}
