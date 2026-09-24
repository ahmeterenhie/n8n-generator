import { NextRequest, NextResponse } from "next/server";
import { validateOnly } from "@/lib/pipeline";

// POST: { workflow } → the workflow checked against the n8n catalog (no AI call).
// Used for workflows the user uploads.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { workflow?: unknown };
  const workflow = body.workflow as Record<string, unknown> | undefined;
  if (!workflow || typeof workflow !== "object" || !Array.isArray(workflow.nodes) || workflow.nodes.length === 0) {
    return NextResponse.json({ code: "INVALID_WORKFLOW", error: "This is not an n8n workflow (no nodes found)." }, { status: 400 });
  }
  return NextResponse.json(validateOnly(workflow));
}
