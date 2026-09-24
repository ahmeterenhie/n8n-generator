// Browser-side calls to the app's API routes.

export class ApiRequestError extends Error {
  constructor(
    public data: { code?: string; error?: string },
    public status: number
  ) {
    super(data.error ?? `HTTP ${status}`);
  }
}

export async function postJson<T = Record<string, unknown>>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // Non-JSON responses (e.g. an HTML error page) would otherwise surface as a cryptic parse error
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiRequestError(data, res.status);
  return data as T;
}

/**
 * Calls a streaming route (NDJSON, see lib/stream.ts): reports each progress
 * line and resolves with the final result line.
 */
export async function postStream<T = Record<string, unknown>>(
  url: string,
  body: unknown,
  onProgress: (event: Record<string, unknown>) => void
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // Validation and auth errors come back as plain JSON before streaming starts
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new ApiRequestError(data, res.status);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const lines = buffer.split("\n");
    buffer = done ? "" : lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as Record<string, unknown> & { type?: string };
      if (event.type === "progress") onProgress(event);
      else if (event.type === "result") return event as T;
      else if (event.type === "error") {
        throw new ApiRequestError(event as { code?: string; error?: string }, (event.status as number) ?? 500);
      }
    }
    if (done) break;
  }
  throw new ApiRequestError({ error: "The response ended without a result." }, 502);
}
