import { NextRequest, NextResponse } from "next/server";
import { clarifySystemPrompt, demoQuestions, parseQuestions } from "@/lib/clarify";
import { errorResponse, generateText, resolveProvider } from "@/lib/llm";
import { extractJson, validatePrompt } from "@/lib/requestUtils";

// POST: request description → a few clarifying questions to answer before generating.
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

  if (provider === "demo") {
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ questions: demoQuestions(lang) });
  }

  let rawContent: string;
  try {
    rawContent = await generateText({
      provider,
      apiKey: body.apiKey,
      model: body.model,
      system: clarifySystemPrompt(lang),
      input: userPrompt,
    });
  } catch (err: unknown) {
    return errorResponse(err);
  }

  try {
    return NextResponse.json({ questions: parseQuestions(extractJson(rawContent)) });
  } catch (err: unknown) {
    console.error("[Clarify Error] Raw content:", rawContent);
    return NextResponse.json(
      { code: "VALIDATION", error: err instanceof Error ? err.message : "Invalid questions." },
      { status: 422 }
    );
  }
}
