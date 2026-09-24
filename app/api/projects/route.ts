import { NextRequest, NextResponse } from "next/server";
import { listProjects, saveProject } from "@/lib/projects";

// GET: saved projects (newest first). POST: save a project ({ id? , ...project }) → { id }.
export async function GET() {
  return NextResponse.json({ projects: await listProjects() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !Array.isArray(body.workflows) || !body.workflows.length) {
    return NextResponse.json({ code: "VALIDATION", error: "Nothing to save." }, { status: 400 });
  }
  try {
    const project = await saveProject(body, typeof body.id === "string" && body.id ? body.id : undefined);
    return NextResponse.json({ id: project.id, updatedAt: project.updatedAt });
  } catch (err) {
    return NextResponse.json({ code: "VALIDATION", error: err instanceof Error ? err.message : "Could not save." }, { status: 400 });
  }
}
