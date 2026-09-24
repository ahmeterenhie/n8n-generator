import { NextRequest, NextResponse } from "next/server";
import { resolveProvider } from "@/lib/llm";
import { refineWorkflow } from "@/lib/pipeline";
import { streamResponse } from "@/lib/stream";

// POST: { workflow, instruction } → the changed workflow, validated and repaired. Streams progress.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
  const workflow = body.workflow as Record<string, unknown> | undefined;

  if (!instruction || instruction.length > 2000) {
    return NextResponse.json({ code: "INVALID_PROMPT", error: "Describe the change (max 2000 characters)." }, { status: 400 });
  }
  if (!workflow || typeof workflow !== "object" || !Array.isArray(workflow.nodes)) {
    return NextResponse.json({ code: "VALIDATION", error: "No workflow to change." }, { status: 400 });
  }

  const provider = resolveProvider(body.provider);
  if (provider === "demo") {
    return NextResponse.json({ code: "DEMO_UNSUPPORTED", error: "Changes need an AI provider." }, { status: 400 });
  }

  const lang = body.lang === "en" ? "en" : "tr";
  return streamResponse(async (progress) =>
    refineWorkflow({ provider, apiKey: body.apiKey, model: body.model, lang, workflow, instruction }, progress)
  );
}
