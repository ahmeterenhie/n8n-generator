import { findNodeType } from "@/lib/n8n/catalog";

// A plan the user reviews before anything is generated. Large systems can be
// split into several workflows: "main" ones started by their own trigger,
// "sub" ones called from others (Execute Workflow Trigger), and an "error"
// workflow n8n runs when another workflow fails (Error Trigger).

export type WorkflowRole = "main" | "sub" | "error";

export interface PlanStep {
  id: string;
  description: string;
  /** Full node type, e.g. "n8n-nodes-base.slack"; empty lets generation choose */
  node?: string;
  resource?: string;
  operation?: string;
}

export interface PlanWorkflow {
  key: string;
  name: string;
  role: WorkflowRole;
  trigger: string;
  /** For sub-workflows: the data they receive and return */
  inputs?: string;
  outputs?: string;
  steps: PlanStep[];
}

export interface Plan {
  summary: string;
  workflows: PlanWorkflow[];
  credentials: string[];
  assumptions: string[];
}

const ROLES: WorkflowRole[] = ["main", "sub", "error"];

const str = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const strList = (v: unknown, maxItems = 20) =>
  (Array.isArray(v) ? v : []).map((x) => str(x, 300)).filter(Boolean).slice(0, maxItems);

/**
 * Checks a plan from the model or from the browser (after the user edited it):
 * drops unknown node types (the step stays, generation picks a node), fixes
 * keys and roles, and requires at least one main workflow with steps.
 */
export function parsePlan(obj: unknown): Plan {
  const raw = (obj ?? {}) as Record<string, unknown>;
  const usedKeys = new Set<string>();
  const workflows = (Array.isArray(raw.workflows) ? raw.workflows : [])
    .slice(0, 8)
    .map((w: Record<string, unknown>, wi: number): PlanWorkflow => {
      let key = str(w?.key, 40).replace(/[^a-zA-Z0-9_-]/g, "") || `w${wi + 1}`;
      while (usedKeys.has(key)) key = `${key}_${wi + 1}`;
      usedKeys.add(key);
      const steps = (Array.isArray(w?.steps) ? w.steps : [])
        .slice(0, 40)
        .map((s: Record<string, unknown>, si: number): PlanStep => {
          const node = str(s?.node, 120);
          const known = node && findNodeType(node) ? node : undefined;
          return {
            id: str(s?.id, 40) || `${key}-s${si + 1}`,
            description: str(s?.description) || node,
            node: known,
            resource: known ? str(s?.resource, 60) || undefined : undefined,
            operation: known ? str(s?.operation, 60) || undefined : undefined,
          };
        })
        .filter((s) => s.description);
      return {
        key,
        name: str(w?.name, 120) || `Workflow ${wi + 1}`,
        role: ROLES.includes(w?.role as WorkflowRole) ? (w.role as WorkflowRole) : "main",
        trigger: str(w?.trigger),
        inputs: str(w?.inputs) || undefined,
        outputs: str(w?.outputs) || undefined,
        steps,
      };
    })
    .filter((w) => w.steps.length > 0);

  if (!workflows.some((w) => w.role === "main")) {
    throw new Error("The plan has no main workflow with steps.");
  }
  return {
    summary: str(raw.summary, 1000),
    workflows,
    credentials: strList(raw.credentials),
    assumptions: strList(raw.assumptions),
  };
}

/** Plain-text version for prompts. */
export function formatPlan(plan: Plan): string {
  const lines = [plan.summary];
  for (const w of plan.workflows) {
    lines.push("", `Workflow "${w.name}" (key ${w.key}, role ${w.role}) — trigger: ${w.trigger || "-"}`);
    if (w.inputs) lines.push(`  Receives: ${w.inputs}`);
    if (w.outputs) lines.push(`  Returns: ${w.outputs}`);
    w.steps.forEach((s, i) => {
      const node = s.node
        ? ` [${s.node}${s.resource ? ` resource=${s.resource}` : ""}${s.operation ? ` operation=${s.operation}` : ""}]`
        : "";
      lines.push(`  ${i + 1}. ${s.description}${node}`);
    });
  }
  if (plan.credentials.length) lines.push("", `Accounts needed: ${plan.credentials.join(", ")}`);
  if (plan.assumptions.length) lines.push("", "Assumptions:", ...plan.assumptions.map((a) => `- ${a}`));
  return lines.join("\n").trim();
}
