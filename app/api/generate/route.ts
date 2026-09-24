import { NextRequest, NextResponse } from "next/server";
import { sanitizeAnswers } from "@/lib/clarify";
import { demoWorkflow } from "@/lib/demoWorkflows";
import { errorResponse, resolveProvider } from "@/lib/llm";
import { generateWorkflow, validateOnly } from "@/lib/pipeline";
import { validatePrompt } from "@/lib/requestUtils";

// POST: request (+ answers to clarifying questions) → validated n8n workflow.
// The steps (plan, generate, check against the n8n catalog, repair) live in lib/pipeline.ts.
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  let request: string;
  try {
    body = await req.json();
    request = validatePrompt(body?.prompt);
  } catch (err: unknown) {
    return NextResponse.json(
      { code: "INVALID_PROMPT", error: err instanceof Error ? err.message : "Invalid request body." },
      { status: 400 }
    );
  }

  const provider = resolveProvider(body.provider);
  const lang = body.lang === "en" ? "en" : "tr";

  // Demo mode: no AI call, return a matching sample workflow (checked like any other)
  if (provider === "demo") {
    await new Promise((r) => setTimeout(r, 900)); // let the loading steps show briefly
    return NextResponse.json({ ...validateOnly(demoWorkflow(request, lang)), demo: true });
  }

  try {
    const result = await generateWorkflow({
      provider,
      apiKey: body.apiKey,
      model: body.model,
      request,
      answers: sanitizeAnswers(body.answers),
      lang,
    });
    return NextResponse.json(result);
  } catch (err: unknown) {
    return errorResponse(err);
  }
}
