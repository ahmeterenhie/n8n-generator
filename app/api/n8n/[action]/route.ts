import { NextRequest, NextResponse } from "next/server";
import {
  N8nError,
  listExecutions,
  parseConnection,
  pushWorkflows,
  retryExecution,
  testN8n,
  type PushItem,
} from "@/lib/n8n/remote";

// Proxy to the user's n8n (browser → this server → n8n), so the n8n API key
// and CORS stay out of the browser-to-n8n path. The key comes with each
// request and is never stored here.
//
//   POST /api/n8n/test        { n8n }
//   POST /api/n8n/push        { n8n, workflows: PushItem[] }  → { pushed }
//   POST /api/n8n/executions  { n8n, workflowId }             → { executions }
//   POST /api/n8n/retry       { n8n, executionId }            → { execution }

const ROLES = ["main", "sub", "error"];

function parsePushItems(value: unknown): PushItem[] {
  if (!Array.isArray(value) || !value.length || value.length > 20) {
    throw new N8nError("N8N_ERROR", "Nothing to send.", 400);
  }
  return value.map((v: Record<string, unknown>, i) => {
    const workflow = v?.workflow as Record<string, unknown> | undefined;
    if (!workflow || !Array.isArray(workflow.nodes)) throw new N8nError("N8N_ERROR", "A workflow has no nodes.", 400);
    return {
      key: typeof v.key === "string" && v.key ? v.key : `w${i + 1}`,
      name: typeof v.name === "string" && v.name ? v.name : String(workflow.name ?? `Workflow ${i + 1}`),
      role: (ROLES.includes(v.role as string) ? v.role : "main") as PushItem["role"],
      workflow,
      remoteId: typeof v.remoteId === "string" && v.remoteId ? v.remoteId : undefined,
    };
  });
}

const idParam = (value: unknown) => (typeof value === "string" || typeof value === "number" ? String(value) : "");

export async function POST(req: NextRequest, { params }: { params: { action: string } }) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const conn = parseConnection(body.n8n);
    switch (params.action) {
      case "test":
        await testN8n(conn);
        return NextResponse.json({ ok: true });
      case "push":
        return NextResponse.json({ pushed: await pushWorkflows(conn, parsePushItems(body.workflows)) });
      case "executions": {
        const workflowId = idParam(body.workflowId);
        if (!workflowId) throw new N8nError("N8N_ERROR", "Missing workflow id.", 400);
        return NextResponse.json({ executions: await listExecutions(conn, workflowId) });
      }
      case "retry": {
        const executionId = idParam(body.executionId);
        if (!executionId) throw new N8nError("N8N_ERROR", "Missing execution id.", 400);
        return NextResponse.json({ execution: await retryExecution(conn, executionId) });
      }
      default:
        return NextResponse.json({ code: "NOT_FOUND", error: "Unknown action." }, { status: 404 });
    }
  } catch (err) {
    if (err instanceof N8nError) return NextResponse.json({ code: err.code, error: err.message }, { status: err.status });
    console.error("[n8n Error]", err);
    return NextResponse.json({ code: "N8N_ERROR", error: err instanceof Error ? err.message : "n8n request failed." }, { status: 502 });
  }
}
