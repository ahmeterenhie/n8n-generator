import { NextResponse } from "next/server";
import { deleteProject, getProject } from "@/lib/projects";

// GET: one saved project. DELETE: remove it.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const project = await getProject(params.id).catch(() => null);
  if (!project) return NextResponse.json({ code: "NOT_FOUND", error: "Project not found." }, { status: 404 });
  return NextResponse.json({ project });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await deleteProject(params.id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ code: "NOT_FOUND", error: "Project not found." }, { status: 404 });
  }
}
