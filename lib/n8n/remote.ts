import { randomUUID } from "node:crypto";
import { BASE_PREFIX } from "@/lib/n8n/catalog";
import type { WorkflowRole } from "@/lib/plan";

// Talks to the user's n8n through its Public API (/api/v1, X-N8N-API-KEY).
// Request bodies follow n8n's OpenAPI schema, which rejects unknown fields.
// Note: the Public API cannot start a workflow; runs start in n8n (manual
// test or the trigger), and failed runs can be retried from here.

export interface N8nConnection {
  baseUrl: string;
  apiKey: string;
}

export class N8nError extends Error {
  constructor(
    public code: "N8N_INVALID_URL" | "N8N_UNAUTHORIZED" | "N8N_NOT_FOUND" | "N8N_UNREACHABLE" | "N8N_ERROR",
    message: string,
    public status: number
  ) {
    super(message);
  }
}

// Allowed fields per n8n's Public API schema (workflow, node, workflowSettings)
const NODE_FIELDS = [
  "id",
  "name",
  "webhookId",
  "disabled",
  "notesInFlow",
  "notes",
  "type",
  "typeVersion",
  "executeOnce",
  "alwaysOutputData",
  "retryOnFail",
  "maxTries",
  "waitBetweenTries",
  "continueOnFail",
  "onError",
  "position",
  "parameters",
  "credentials",
];
const SETTINGS_FIELDS = [
  "saveExecutionProgress",
  "saveManualExecutions",
  "saveDataErrorExecution",
  "saveDataSuccessExecution",
  "executionTimeout",
  "errorWorkflow",
  "timezone",
  "executionOrder",
  "callerPolicy",
  "callerIds",
];
// Nodes that receive HTTP calls need a stable webhookId for their production URL
const WEBHOOK_TYPES = new Set(["webhook", "formTrigger", "form"].map((n) => BASE_PREFIX + n));

const pick = (obj: Record<string, unknown>, keys: string[]) =>
  Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));

export function parseConnection(value: unknown): N8nConnection {
  const raw = (value ?? {}) as Record<string, unknown>;
  const apiKey = typeof raw.apiKey === "string" ? raw.apiKey.trim() : "";
  let baseUrl = typeof raw.baseUrl === "string" ? raw.baseUrl.trim() : "";
  // Accept what people paste: the editor URL, with or without /api/v1
  baseUrl = baseUrl.replace(/\/+$/, "").replace(/\/api\/v1$/, "").replace(/\/(home|workflow)(\/.*)?$/, "");
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new N8nError("N8N_INVALID_URL", "Enter the n8n address, e.g. https://n8n.company.com", 400);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new N8nError("N8N_INVALID_URL", "The n8n address must start with http:// or https://", 400);
  }
  if (!apiKey) throw new N8nError("N8N_UNAUTHORIZED", "No n8n API key provided.", 400);
  return { baseUrl: url.toString().replace(/\/+$/, ""), apiKey };
}

async function request<T>(conn: N8nConnection, method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${conn.baseUrl}/api/v1${path}`, {
      method,
      headers: {
        "X-N8N-API-KEY": conn.apiKey,
        Accept: "application/json",
        ...(body !== undefined && { "Content-Type": "application/json" }),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    const cause = (err as { cause?: { code?: string } }).cause?.code ?? (err as Error).name;
    throw new N8nError("N8N_UNREACHABLE", `Could not reach ${conn.baseUrl} (${cause}).`, 502);
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // e.g. an HTML page when the address is not an n8n instance
  }
  if (!res.ok) {
    const message = (data as { message?: string })?.message ?? `HTTP ${res.status}`;
    if (res.status === 401 || res.status === 403) throw new N8nError("N8N_UNAUTHORIZED", message, 401);
    if (res.status === 404) throw new N8nError("N8N_NOT_FOUND", message, 404);
    throw new N8nError("N8N_ERROR", message, 502);
  }
  if (data === null && text) {
    throw new N8nError("N8N_ERROR", "The address answered, but not like an n8n API. Check the URL.", 502);
  }
  return data as T;
}

/** Checks the address and key with a cheap read. */
export async function testN8n(conn: N8nConnection): Promise<void> {
  await request(conn, "GET", "/workflows?limit=1&excludePinnedData=true");
}

/** Body for create/update: only the fields n8n accepts. */
export function toN8nPayload(workflow: Record<string, unknown>): Record<string, unknown> {
  const nodes = (Array.isArray(workflow.nodes) ? workflow.nodes : []).map((n: Record<string, unknown>) => {
    const node = pick(n, NODE_FIELDS);
    if (WEBHOOK_TYPES.has(String(node.type)) && !node.webhookId) node.webhookId = randomUUID();
    return node;
  });
  const settings = pick((workflow.settings ?? {}) as Record<string, unknown>, SETTINGS_FIELDS);
  return {
    name: String(workflow.name ?? "Workflow"),
    nodes,
    connections: workflow.connections ?? {},
    settings: { executionOrder: "v1", ...settings },
  };
}

export interface PushItem {
  key: string;
  name: string;
  role: WorkflowRole;
  workflow: Record<string, unknown>;
  /** Id in n8n from an earlier push: update instead of create */
  remoteId?: string;
}

export interface PushedItem {
  key: string;
  id: string;
  url: string;
  created: boolean;
  /** The workflow as sent, with sub-workflow and error-workflow links filled in */
  workflow: Record<string, unknown>;
  /** Was active in n8n and was published again so the update takes effect */
  republished?: boolean;
  /** Why publishing the update failed (e.g. missing credentials) */
  publishError?: string;
}

/**
 * Links workflows of one system: Execute Sub-workflow nodes get the id of the
 * sub-workflow they name, and main/sub workflows use the error workflow.
 */
export function linkWorkflows(items: PushItem[], ids: Record<string, string>): Record<string, Record<string, unknown>> {
  const subs = items.filter((i) => i.role === "sub");
  const errorItem = items.find((i) => i.role === "error");
  const linked: Record<string, Record<string, unknown>> = {};

  for (const item of items) {
    const wf = structuredClone(item.workflow);
    const nodes = (Array.isArray(wf.nodes) ? wf.nodes : []) as { type?: string; parameters?: Record<string, unknown> }[];
    for (const node of nodes) {
      if (node.type !== `${BASE_PREFIX}executeWorkflow` || !node.parameters) continue;
      const current = node.parameters.workflowId as { value?: unknown; cachedResultName?: unknown } | undefined;
      const wanted = typeof current?.cachedResultName === "string" ? current.cachedResultName : "";
      // Match by name; with a single sub-workflow any unset reference means that one
      const target = subs.find((s) => s.name === wanted) ?? (subs.length === 1 && !current?.value ? subs[0] : undefined);
      if (target && ids[target.key]) {
        node.parameters.source = "database";
        node.parameters.workflowId = { __rl: true, mode: "list", value: ids[target.key], cachedResultName: target.name };
      }
    }
    if (errorItem && item.role !== "error" && ids[errorItem.key]) {
      wf.settings = { ...((wf.settings as object) ?? {}), errorWorkflow: ids[errorItem.key] };
    }
    linked[item.key] = wf;
  }
  return linked;
}

/**
 * Creates or updates every workflow of a system in n8n, then fills in the
 * links (which need the new ids) with a second update where needed.
 * In n8n 2.x an active workflow keeps running its published version, so
 * workflows that were active are published again (sub-workflows before the
 * workflows that call them, as n8n requires).
 */
export async function pushWorkflows(conn: N8nConnection, items: PushItem[]): Promise<PushedItem[]> {
  const ids: Record<string, string> = {};
  const created: Record<string, boolean> = {};
  const wasActive: Record<string, boolean> = {};
  // Error and sub-workflows first, so their ids exist when mains are linked
  const order = [...items].sort((a, b) => ["error", "sub", "main"].indexOf(a.role) - ["error", "sub", "main"].indexOf(b.role));

  for (const item of order) {
    const payload = toN8nPayload(item.workflow);
    if (item.remoteId) {
      try {
        const updated = await request<{ active?: boolean }>(conn, "PUT", `/workflows/${encodeURIComponent(item.remoteId)}`, payload);
        wasActive[item.key] = updated?.active === true;
        ids[item.key] = item.remoteId;
        created[item.key] = false;
        continue;
      } catch (err) {
        // Deleted in n8n since the last push: create it again
        if (!(err instanceof N8nError && err.code === "N8N_NOT_FOUND")) throw err;
      }
    }
    const result = await request<{ id: string }>(conn, "POST", "/workflows", payload);
    ids[item.key] = result.id;
    created[item.key] = true;
  }

  const linked = linkWorkflows(items, ids);
  for (const item of items) {
    if (JSON.stringify(linked[item.key]) !== JSON.stringify(item.workflow)) {
      await request(conn, "PUT", `/workflows/${encodeURIComponent(ids[item.key])}`, toN8nPayload(linked[item.key]));
    }
  }

  const publish: Record<string, { republished?: boolean; publishError?: string }> = {};
  for (const item of order) {
    if (!wasActive[item.key]) continue;
    try {
      await request(conn, "POST", `/workflows/${encodeURIComponent(ids[item.key])}/activate`);
      publish[item.key] = { republished: true };
    } catch (err) {
      publish[item.key] = { publishError: err instanceof Error ? err.message : String(err) };
    }
  }

  return items.map((item) => ({
    key: item.key,
    id: ids[item.key],
    url: `${conn.baseUrl}/workflow/${ids[item.key]}`,
    created: created[item.key],
    workflow: linked[item.key],
    ...publish[item.key],
  }));
}

// ─── Executions ──────────────────────────────────────────────────────────────

export interface ExecutionSummary {
  id: string;
  status: string;
  mode?: string;
  startedAt?: string;
  stoppedAt?: string;
  error?: { message: string; description?: string; node?: string };
}

interface RawExecution {
  id: number | string;
  status?: string;
  mode?: string;
  startedAt?: string;
  stoppedAt?: string;
  data?: {
    resultData?: {
      error?: { message?: string; description?: string; node?: { name?: string } };
      lastNodeExecuted?: string;
      runData?: Record<string, { error?: { message?: string; description?: string } }[]>;
    };
  };
}

/** The failure of an execution: the run-level error, else the error of the last node that ran. */
export function summarizeExecution(e: RawExecution): ExecutionSummary {
  const result = e.data?.resultData;
  let error: ExecutionSummary["error"];
  if (result?.error?.message) {
    error = {
      message: result.error.message,
      description: result.error.description ?? undefined,
      node: result.error.node?.name ?? result.lastNodeExecuted,
    };
  } else if (result?.lastNodeExecuted) {
    const nodeError = result.runData?.[result.lastNodeExecuted]?.at(-1)?.error;
    if (nodeError?.message) {
      error = { message: nodeError.message, description: nodeError.description, node: result.lastNodeExecuted };
    }
  }
  return {
    id: String(e.id),
    status: e.status ?? "unknown",
    mode: e.mode,
    startedAt: e.startedAt,
    stoppedAt: e.stoppedAt ?? undefined,
    error,
  };
}

export async function listExecutions(conn: N8nConnection, workflowId: string, limit = 5): Promise<ExecutionSummary[]> {
  const res = await request<{ data: RawExecution[] }>(
    conn,
    "GET",
    `/executions?workflowId=${encodeURIComponent(workflowId)}&limit=${limit}&includeData=true`
  );
  return (res.data ?? []).map(summarizeExecution);
}

/** Runs a failed execution again with the workflow's current (fixed) version. */
export async function retryExecution(conn: N8nConnection, executionId: string): Promise<ExecutionSummary> {
  const res = await request<RawExecution>(conn, "POST", `/executions/${encodeURIComponent(executionId)}/retry`, {
    loadWorkflow: true,
  });
  return summarizeExecution(res);
}
