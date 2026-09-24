import Anthropic from "@anthropic-ai/sdk";
import { ApiError as GeminiApiError, FinishReason, GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { NextResponse } from "next/server";
import { DEFAULT_MODELS, PROVIDERS, type Provider } from "@/lib/apiConfig";

// Server-side access to the AI providers. Keys come from the user's browser
// per request; env vars are only a fallback. Demo mode never reaches here.

type ModelProvider = Exclude<Provider, "demo">;

export class LlmError extends Error {
  constructor(
    public code:
      | "MISSING_KEY"
      | "INVALID_KEY"
      | "MODEL_NOT_FOUND"
      | "RATE_LIMIT"
      | "UNAVAILABLE"
      | "UPSTREAM"
      | "REFUSAL"
      | "TRUNCATED",
    message: string,
    public status: number
  ) {
    super(message);
  }
}

// Models whose safety classifiers can decline a request; server-side
// fallbacks re-run a declined request on Anthropic's recommended model.
const FALLBACK_MODELS = new Set(["claude-opus-5", "claude-opus-5-5", "claude-fable-5-1"]);

// Gemini's SDK does not retry unless asked. Retry only temporary server
// errors ("model is overloaded"); quota errors (429) would just fail again.
function geminiClient(apiKey: string) {
  return new GoogleGenAI({
    apiKey,
    httpOptions: { retryOptions: { attempts: 4, initialDelay: 2, maxDelay: 10, httpStatusCodes: [500, 502, 503, 504] } },
  });
}

const ENV: Record<ModelProvider, { key?: string; model?: string }> = {
  anthropic: { key: process.env.ANTHROPIC_API_KEY, model: process.env.ANTHROPIC_MODEL },
  openai: { key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL },
  gemini: { key: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL },
};

export function resolveProvider(value: unknown): Provider {
  return typeof value === "string" && (PROVIDERS as string[]).includes(value) ? (value as Provider) : "openai";
}

function resolveKey(provider: ModelProvider, requestKey: unknown): string {
  const fromRequest = typeof requestKey === "string" ? requestKey.trim() : "";
  const key = fromRequest || ENV[provider].key?.trim() || "";
  if (!key) throw new LlmError("MISSING_KEY", `No ${provider} API key provided.`, 400);
  return key;
}

function resolveModel(provider: ModelProvider, requestModel: unknown): string {
  const fromRequest = typeof requestModel === "string" ? requestModel.trim() : "";
  return fromRequest || ENV[provider].model || DEFAULT_MODELS[provider];
}

function mapError(err: unknown): LlmError {
  if (err instanceof LlmError) return err;
  console.error("[LLM Error]", err);
  const message = err instanceof Error ? err.message : "Request to the AI provider failed.";

  if (err instanceof Anthropic.AuthenticationError || (err instanceof OpenAI.APIError && err.status === 401)) {
    return new LlmError("INVALID_KEY", message, 401);
  }
  if (err instanceof Anthropic.NotFoundError || (err instanceof OpenAI.APIError && err.status === 404)) {
    return new LlmError("MODEL_NOT_FOUND", message, 404);
  }
  if (err instanceof Anthropic.RateLimitError || (err instanceof OpenAI.APIError && err.status === 429)) {
    return new LlmError("RATE_LIMIT", message, 429);
  }
  if (err instanceof GeminiApiError) {
    // Gemini reports a bad key as 400 INVALID_ARGUMENT ("API key not valid")
    if (err.status === 401 || err.status === 403 || (err.status === 400 && /api key/i.test(message))) {
      return new LlmError("INVALID_KEY", message, 401);
    }
    if (err.status === 404) return new LlmError("MODEL_NOT_FOUND", message, 404);
    if (err.status === 429) return new LlmError("RATE_LIMIT", message, 429);
  }
  // Provider temporarily down or overloaded (Anthropic uses 529); SDKs have already retried
  const status = (err as { status?: unknown })?.status;
  if (typeof status === "number" && (status >= 500 || status === 529)) {
    return new LlmError("UNAVAILABLE", message, 503);
  }
  return new LlmError("UPSTREAM", message, 502);
}

/** Error details for any failure: { code, error } plus the HTTP status to use. */
export function errorInfo(err: unknown): { code: string; error: string; status: number } {
  const e = mapError(err);
  return { code: e.code, error: e.message, status: e.status };
}

export function errorResponse(err: unknown) {
  const { status, ...body } = errorInfo(err);
  return NextResponse.json(body, { status });
}

/** Sends one system + user prompt and returns the model's text output. */
export async function generateText(opts: {
  provider: ModelProvider;
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

    if (opts.provider === "gemini") {
      const client = geminiClient(apiKey);
      const response = await client.models.generateContent({
        model,
        contents: opts.input,
        config: {
          systemInstruction: opts.system,
          responseMimeType: "application/json",
          // Thinking tokens count toward this limit on 2.5 models
          maxOutputTokens: 32000,
        },
      });

      const finish = response.candidates?.[0]?.finishReason;
      if (response.promptFeedback?.blockReason || finish === FinishReason.SAFETY || finish === FinishReason.PROHIBITED_CONTENT) {
        throw new LlmError("REFUSAL", "The model declined this request.", 422);
      }
      if (finish === FinishReason.MAX_TOKENS) {
        throw new LlmError("TRUNCATED", "The response hit the output limit before finishing.", 422);
      }
      return response.text ?? "";
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
export async function testConnection(opts: {
  provider: ModelProvider;
  apiKey: unknown;
  model: unknown;
}): Promise<string> {
  const apiKey = resolveKey(opts.provider, opts.apiKey);
  const model = resolveModel(opts.provider, opts.model);
  try {
    if (opts.provider === "anthropic") {
      return (await new Anthropic({ apiKey }).models.retrieve(model)).id;
    }
    if (opts.provider === "gemini") {
      const info = await geminiClient(apiKey).models.get({ model });
      return info.name?.replace(/^models\//, "") ?? model;
    }
    return (await new OpenAI({ apiKey }).models.retrieve(model)).id;
  } catch (err) {
    throw mapError(err);
  }
}
