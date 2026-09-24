import { randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Project history, saved as one JSON file per project on the machine running
// the app (PROJECTS_DIR, default .data/projects). API keys are never saved.

export interface SavedWorkflow {
  key: string;
  name: string;
  role: "main" | "sub" | "error";
  workflow: Record<string, unknown>;
  validation: Record<string, unknown>;
  /** Set once pushed to n8n */
  remote?: { id: string; url: string; pushedAt: string };
}

export interface Project {
  id: string;
  createdAt: string;
  updatedAt: string;
  request: string;
  answers: { question: string; answer: string }[];
  plan?: Record<string, unknown> | null;
  workflows: SavedWorkflow[];
  demo?: boolean;
}

export interface ProjectSummary {
  id: string;
  createdAt: string;
  updatedAt: string;
  request: string;
  workflows: { name: string; role: string; errors: number; pushed: boolean }[];
  demo?: boolean;
}

const ID = /^[a-z0-9-]{8,64}$/;
const MAX_BYTES = 5_000_000;

function dir(): string {
  return process.env.PROJECTS_DIR || join(process.cwd(), ".data", "projects");
}

function fileFor(id: string): string {
  // Ids are generated here; anything else could escape the folder
  if (!ID.test(id)) throw new Error("Invalid project id.");
  return join(dir(), `${id}.json`);
}

export function newProjectId(): string {
  return `${new Date().toISOString().slice(0, 10)}-${randomBytes(6).toString("hex")}`;
}

/** Keeps only the fields a project has, with sane types. */
export function sanitizeProject(value: unknown, id: string, createdAt?: string): Project {
  const raw = (value ?? {}) as Record<string, unknown>;
  const workflows = (Array.isArray(raw.workflows) ? raw.workflows : []).slice(0, 20).map((w: Record<string, unknown>, i) => {
    const remote = w?.remote as Record<string, unknown> | undefined;
    return {
      key: typeof w?.key === "string" ? w.key : `w${i + 1}`,
      name: typeof w?.name === "string" ? w.name : `Workflow ${i + 1}`,
      role: (["main", "sub", "error"].includes(w?.role as string) ? w.role : "main") as SavedWorkflow["role"],
      workflow: (w?.workflow && typeof w.workflow === "object" ? w.workflow : { nodes: [] }) as Record<string, unknown>,
      validation: (w?.validation && typeof w.validation === "object" ? w.validation : {}) as Record<string, unknown>,
      ...(remote && typeof remote.id === "string" && typeof remote.url === "string"
        ? { remote: { id: remote.id, url: remote.url, pushedAt: String(remote.pushedAt ?? new Date().toISOString()) } }
        : {}),
    };
  });
  const now = new Date().toISOString();
  return {
    id,
    createdAt: createdAt ?? now,
    updatedAt: now,
    request: typeof raw.request === "string" ? raw.request.slice(0, 2000) : "",
    answers: (Array.isArray(raw.answers) ? raw.answers : [])
      .filter((a): a is { question: string; answer: string } => typeof a?.question === "string" && typeof a?.answer === "string")
      .slice(0, 30),
    plan: raw.plan && typeof raw.plan === "object" ? (raw.plan as Record<string, unknown>) : null,
    workflows,
    demo: raw.demo === true,
  };
}

export async function saveProject(value: unknown, id?: string): Promise<Project> {
  let createdAt: string | undefined;
  if (id) createdAt = (await getProject(id))?.createdAt;
  const project = sanitizeProject(value, id ?? newProjectId(), createdAt);
  const text = JSON.stringify(project);
  if (text.length > MAX_BYTES) throw new Error("Project is too large to save.");
  await mkdir(dir(), { recursive: true });
  await writeFile(fileFor(project.id), text, "utf8");
  return project;
}

export async function getProject(id: string): Promise<Project | null> {
  try {
    return JSON.parse(await readFile(fileFor(id), "utf8")) as Project;
  } catch {
    return null;
  }
}

export async function deleteProject(id: string): Promise<void> {
  await rm(fileFor(id), { force: true });
}

export async function listProjects(): Promise<ProjectSummary[]> {
  let files: string[];
  try {
    files = (await readdir(dir())).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const projects = await Promise.all(files.map((f) => getProject(f.replace(/\.json$/, "")).catch(() => null)));
  return projects
    .filter((p): p is Project => !!p)
    .map((p) => ({
      id: p.id,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      request: p.request,
      demo: p.demo,
      workflows: p.workflows.map((w) => ({
        name: w.name,
        role: w.role,
        errors: Array.isArray((w.validation as { errors?: unknown[] }).errors) ? (w.validation as { errors: unknown[] }).errors.length : 0,
        pushed: !!w.remote,
      })),
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
