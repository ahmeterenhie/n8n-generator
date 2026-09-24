// Browser-side storage for the user's OpenAI connection. Never stored on the server.

export const MODEL_OPTIONS = ["gpt-5-codex", "codex-mini-latest", "gpt-4.1", "gpt-4o"] as const;
export const DEFAULT_MODEL = MODEL_OPTIONS[0];

export interface ApiConfig {
  apiKey: string;
  model: string;
}

const STORAGE_KEY = "n8nforge_api_config";

export function loadApiConfig(): ApiConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ApiConfig>;
      return { apiKey: parsed.apiKey ?? "", model: parsed.model || DEFAULT_MODEL };
    }
  } catch {
    // Storage blocked or corrupted: fall through to defaults
  }
  return { apiKey: "", model: DEFAULT_MODEL };
}

export function saveApiConfig(config: ApiConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Ignore: the page still works for this visit
  }
}

export function clearApiConfig(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export function maskKey(key: string): string {
  return key.length > 10 ? `${key.slice(0, 5)}…${key.slice(-4)}` : "••••";
}
