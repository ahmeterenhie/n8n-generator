import { NextRequest, NextResponse } from "next/server";
import { sanitizeAnswers } from "@/lib/clarify";
import { demoPlan, demoWorkflow } from "@/lib/demoWorkflows";
import { resolveProvider } from "@/lib/llm";
import { generateDirect, generateProject, validateOnly } from "@/lib/pipeline";
import { parsePlan } from "@/lib/plan";
import { validatePrompt } from "@/lib/requestUtils";
import { streamResponse } from "@/lib/stream";

// POST: request + answers (+ the approved plan) → validated n8n workflows.
// Streams progress as NDJSON (see lib/stream.ts). Without a plan, one is made first.
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

  // Demo mode: no AI call; a matching sample workflow, checked like any other
  if (provider === "demo") {
    return streamResponse(async (progress) => {
      const plan = demoPlan(request, lang);
      progress({ stage: "generate", workflow: plan.workflows[0].name, index: 1, total: 1 });
      await new Promise((r) => setTimeout(r, 900));
      const { workflow, validation } = validateOnly(demoWorkflow(request, lang));
      return { plan, workflows: [{ key: "main", name: plan.workflows[0].name, role: "main", workflow, validation }], demo: true };
    });
  }

  let approvedPlan: ReturnType<typeof parsePlan> | undefined;
  if (body.plan) {
    try {
      approvedPlan = parsePlan(body.plan);
    } catch (err: unknown) {
      return NextResponse.json(
        { code: "VALIDATION", error: err instanceof Error ? err.message : "Invalid plan." },
        { status: 400 }
      );
    }
  }

  const project = { provider, apiKey: body.apiKey, model: body.model, lang, request, answers: sanitizeAnswers(body.answers) } as const;
  return streamResponse(async (progress) => {
    const result = approvedPlan ? await generateProject(project, approvedPlan, progress) : await generateDirect(project, progress);
    return { ...result };
  });
}
