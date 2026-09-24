import { NextRequest, NextResponse } from "next/server";
import { sanitizeAnswers } from "@/lib/clarify";
import { demoPlan } from "@/lib/demoWorkflows";
import { errorResponse, resolveProvider } from "@/lib/llm";
import { planProject } from "@/lib/pipeline";
import { parsePlan } from "@/lib/plan";
import { validatePrompt } from "@/lib/requestUtils";

// POST: request + answers → a plan for review; with { plan, feedback } → the revised plan.
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
  const feedback = typeof body.feedback === "string" ? body.feedback.trim().slice(0, 2000) : "";

  if (provider === "demo") {
    await new Promise((r) => setTimeout(r, 700));
    return NextResponse.json({ plan: demoPlan(request, lang) });
  }

  try {
    const revision = feedback && body.plan ? { plan: parsePlan(body.plan), feedback } : undefined;
    const plan = await planProject(
      { provider, apiKey: body.apiKey, model: body.model, lang, request, answers: sanitizeAnswers(body.answers) },
      revision
    );
    return NextResponse.json({ plan });
  } catch (err: unknown) {
    return errorResponse(err);
  }
}
