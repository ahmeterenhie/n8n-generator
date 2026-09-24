import { NextRequest, NextResponse } from "next/server";
import {
  MAX_CLARIFY_ROUNDS,
  clarifyInput,
  clarifySystemPrompt,
  demoQuestions,
  parseClarify,
  sanitizeHistory,
} from "@/lib/clarify";
import { errorResponse, generateText, resolveProvider } from "@/lib/llm";
import { extractJson, validatePrompt } from "@/lib/requestUtils";

// POST: request + earlier Q&A → the next round of clarifying questions, or done.
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  let userPrompt: string;
  try {
    body = await req.json();
    userPrompt = validatePrompt(body?.prompt);
  } catch (err: unknown) {
    return NextResponse.json(
      { code: "INVALID_PROMPT", error: err instanceof Error ? err.message : "Invalid request body." },
      { status: 400 }
    );
  }

  const provider = resolveProvider(body.provider);
  const lang = body.lang === "en" ? "en" : "tr";
  const round = Math.max(1, Math.floor(Number(body.round) || 1));
  const history = sanitizeHistory(body.history);

  if (round > MAX_CLARIFY_ROUNDS) return NextResponse.json({ done: true, questions: [], round });

  if (provider === "demo") {
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ ...demoQuestions(lang, round), round });
  }

  let rawContent: string;
  try {
    rawContent = await generateText({
      provider,
      apiKey: body.apiKey,
      model: body.model,
      system: clarifySystemPrompt(lang),
      input: clarifyInput(userPrompt, history, round),
    });
  } catch (err: unknown) {
    return errorResponse(err);
  }

  try {
    return NextResponse.json({ ...parseClarify(extractJson(rawContent)), round });
  } catch (err: unknown) {
    console.error("[Clarify Error] Raw content:", rawContent);
    return NextResponse.json(
      { code: "VALIDATION", error: err instanceof Error ? err.message : "Invalid questions." },
      { status: 422 }
    );
  }
}
