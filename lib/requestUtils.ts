// Helpers shared by the API routes (route files may only export handlers).

export function validatePrompt(prompt: unknown): string {
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    throw new Error("Prompt must be a non-empty string.");
  }
  if (prompt.length > 1000) {
    throw new Error("Prompt must be 1000 characters or fewer.");
  }
  return prompt.trim();
}

// Codex/reasoning models may wrap JSON in fences or add text; take the outermost object.
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Response does not contain a JSON object.");
  }
  return JSON.parse(text.slice(start, end + 1));
}
