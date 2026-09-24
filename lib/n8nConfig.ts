// Browser-side storage for the n8n connection (address + API key). Never stored on the server.

export interface N8nSettings {
  baseUrl: string;
  apiKey: string;
}

const STORAGE_KEY = "n8nforge_n8n_connection";

export function loadN8n(): N8nSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<N8nSettings>;
    return parsed.baseUrl && parsed.apiKey ? { baseUrl: parsed.baseUrl, apiKey: parsed.apiKey } : null;
  } catch {
    return null;
  }
}

export function saveN8n(settings: N8nSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore: works for this visit only
  }
}

export function clearN8n(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}
