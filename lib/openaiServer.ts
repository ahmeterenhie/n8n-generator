import OpenAI from "openai";
import { NextResponse } from "next/server";
import { DEFAULT_MODEL } from "@/lib/apiConfig";

/** Key from the request (user's browser) wins; falls back to the server's OPENAI_API_KEY. */
export function createClient(requestKey: unknown): OpenAI | null {
  const apiKey = (typeof requestKey === "string" && requestKey.trim()) || process.env.OPENAI_API_KEY?.trim();
  return apiKey ? new OpenAI({ apiKey }) : null;
}

export function resolveModel(requestModel: unknown): string {
  return (typeof requestModel === "string" && requestModel.trim()) || process.env.OPENAI_MODEL || DEFAULT_MODEL;
}

export function missingKeyResponse() {
  return NextResponse.json(
    { code: "MISSING_KEY", error: "No OpenAI API key provided. Connect one on the API page or set OPENAI_API_KEY." },
    { status: 400 }
  );
}

/** Maps OpenAI SDK errors to a stable `{ code, error }` payload the UI can translate. */
export function openAIErrorResponse(err: unknown) {
  console.error("[OpenAI Error]", err);
  if (err instanceof OpenAI.APIError) {
    if (err.status === 401) {
      return NextResponse.json({ code: "INVALID_KEY", error: err.message }, { status: 401 });
    }
    if (err.status === 404) {
      return NextResponse.json({ code: "MODEL_NOT_FOUND", error: err.message }, { status: 404 });
    }
  }
  const message = err instanceof Error ? err.message : "Failed to call OpenAI API.";
  return NextResponse.json({ code: "UPSTREAM", error: message }, { status: 502 });
}
