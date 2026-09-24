import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { NextResponse } from "next/server";
import { DEFAULT_MODELS, type Provider } from "@/lib/apiConfig";

// Server-side access to the two supported providers. Keys come from the
// user's browser per request; env vars are only a fallback.

export class LlmError extends Error {
  constructor(
    public code: "MISSING_KEY" | "INVALID_KEY" | "MODEL_NOT_FOUND" | "UPSTREAM" | "REFUSAL" | "TRUNCATED",
    message: string,
    public status: number
  ) {
    super(message);
  }
}

// Models whose safety classifiers can decline a request; server-side
// fallbacks re-run a declined request on Anthropic's recommended model.
const FALLBACK_MODELS = new Set(["claude-opus-5", "claude-opus-5-5", "claude-fable-5-1"]);

export function resolveProvider(value: unknown): Provider {
  return value === "anthropic" ? "anthropic" : "openai";
}

function resolveKey(provider: Provider, requestKey: unknown): string {
  const fromRequest = typeof requestKey === "string" ? requestKey.trim() : "";
  const fromEnv = provider === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY;
  const key = fromRequest || fromEnv?.trim() || "";
  if (!key) throw new LlmError("MISSING_KEY", `No ${provider} API key provided.`, 400);
  return key;
}

function resolveModel(provider: Provider, requestModel: unknown): string {
  const fromRequest = typeof requestModel === "string" ? requestModel.trim() : "";
  const fromEnv = provider === "anthropic" ? process.env.ANTHROPIC_MODEL : process.env.OPENAI_MODEL;
  return fromRequest || fromEnv || DEFAULT_MODELS[provider];
}

function mapError(err: unknown): LlmError {
  if (err instanceof LlmError) return err;
  console.error("[LLM Error]", err);
  if (err instanceof Anthropic.AuthenticationError || (err instanceof OpenAI.APIError && err.status === 401)) {
    return new LlmError("INVALID_KEY", (err as Error).message, 401);
  }
  if (err instanceof Anthropic.NotFoundError || (err instanceof OpenAI.APIError && err.status === 404)) {
    return new LlmError("MODEL_NOT_FOUND", (err as Error).message, 404);
  }
  return new LlmError("UPSTREAM", err instanceof Error ? err.message : "Request to the AI provider failed.", 502);
}

export function errorResponse(err: unknown) {
  const e = mapError(err);
  return NextResponse.json({ code: e.code, error: e.message }, { status: e.status });
}

/** Sends one system + user prompt and returns the model's text output. */
export async function generateText(opts: {
  provider: Provider;
  apiKey: unknown;
  model: unknown;
  system: string;
  input: string;
}): Promise<string> {
  const apiKey = resolveKey(opts.provider, opts.apiKey);
  const model = resolveModel(opts.provider, opts.model);

  try {
    if (opts.provider === "anthropic") {
      const client = new Anthropic({ apiKey });
      // Streaming avoids HTTP timeouts on long generations
      const message = await client.beta.messages
        .stream({
          model,
          max_tokens: 32000,
          system: opts.system,
          messages: [{ role: "user", content: opts.input }],
          ...(FALLBACK_MODELS.has(model) && {
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default" as const,
          }),
        })
        .finalMessage();

      if (message.stop_reason === "refusal") {
        throw new LlmError("REFUSAL", message.stop_details?.explanation ?? "The model declined this request.", 422);
      }
      if (message.stop_reason === "max_tokens") {
        throw new LlmError("TRUNCATED", "The response hit the output limit before finishing.", 422);
      }
      return message.content.map((block) => (block.type === "text" ? block.text : "")).join("");
    }

    // OpenAI Responses API: serves Codex models as well as GPT models
    const client = new OpenAI({ apiKey });
    const response = await client.responses.create({
      model,
      instructions: opts.system,
      input: opts.input,
      // Generous budget: reasoning models spend part of it before writing output
      max_output_tokens: 16000,
    });
    return response.output_text ?? "";
  } catch (err) {
    throw mapError(err);
  }
}

/** Checks the key and model access with a cheap metadata call (no tokens spent). */
export async function testConnection(opts: { provider: Provider; apiKey: unknown; model: unknown }): Promise<string> {
  const apiKey = resolveKey(opts.provider, opts.apiKey);
  const model = resolveModel(opts.provider, opts.model);
  try {
    if (opts.provider === "anthropic") {
      const info = await new Anthropic({ apiKey }).models.retrieve(model);
      return info.id;
    }
    const info = await new OpenAI({ apiKey }).models.retrieve(model);
    return info.id;
  } catch (err) {
    throw mapError(err);
  }
}
