import { formatAnswers, type ClarifyAnswer } from "@/lib/clarify";
import type { Lang } from "@/lib/dictionaries";
import { generateText, LlmError } from "@/lib/llm";
import {
  BASE_PREFIX,
  catalogVersion,
  coreNodes,
  findNodeType,
  renderNodeOverview,
  renderNodeSpec,
  searchNodes,
  type NodeChoice,
} from "@/lib/n8n/catalog";
import {
  GENERATE_SYSTEM_PROMPT,
  generateInput,
  planInput,
  planSystemPrompt,
  refineInput,
  repairInput,
  type WorkflowBrief,
} from "@/lib/n8n/prompts";
import { formatIssues, normalizeWorkflow, validateWorkflow, type ValidationResult } from "@/lib/n8n/validate";
import { formatPlan, parsePlan, type Plan, type PlanWorkflow, type WorkflowRole } from "@/lib/plan";
import { extractJson } from "@/lib/requestUtils";

// Generation in steps against the official n8n catalog:
//   plan (reviewed by the user) → per workflow: generate with the exact specs
//   of the planned operations → validate → repair (limited rounds).
// Also: change an existing workflow by instruction ("refine").

const MAX_REPAIR_ROUNDS = 2;

type Complete = (system: string, input: string) => Promise<string>;

export interface ModelOptions {
  provider: "anthropic" | "openai" | "gemini";
  apiKey: unknown;
  model: unknown;
  lang: Lang;
  /** Replaces the provider call (tests and evaluation use a scripted model) */
  complete?: Complete;
}

export interface ProjectRequest extends ModelOptions {
  request: string;
  answers: ClarifyAnswer[];
}

export interface Validation extends ValidationResult {
  catalogVersion: string;
  repairRounds: number;
}

export interface BuiltWorkflow {
  key: string;
  name: string;
  role: WorkflowRole;
  workflow: Record<string, unknown>;
  validation: Validation;
}

export interface ProjectResult {
  plan: Plan;
  workflows: BuiltWorkflow[];
}

export type Progress =
  | { stage: "plan" }
  | { stage: "generate"; workflow: string; index: number; total: number }
  | { stage: "repair"; workflow: string; round: number };

type OnProgress = (p: Progress) => void;

interface Choice extends NodeChoice {
  type: string;
}

const callFor = (opts: ModelOptions): Complete =>
  opts.complete ?? ((system, input) => generateText({ ...opts, system, input }));

const languageName = (lang: Lang) => (lang === "tr" ? "Turkish" : "English");

/** Specs for (type, resource, operation) choices, one per distinct choice. */
function renderSpecs(choices: Choice[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const c of choices) {
    const node = findNodeType(c.type);
    const key = `${c.type}|${c.resource ?? ""}|${c.operation ?? ""}`;
    if (!node || seen.has(key)) continue;
    seen.add(key);
    parts.push(renderNodeSpec(node, c));
  }
  return parts.join("\n\n");
}

/** What a workflow actually uses, so repair rounds get the matching specs. */
function choicesInWorkflow(workflow: Record<string, unknown>): Choice[] {
  const nodes = (Array.isArray(workflow.nodes) ? workflow.nodes : []) as { type?: string; parameters?: Record<string, unknown> }[];
  return nodes
    .filter((n) => typeof n.type === "string" && n.type.startsWith(BASE_PREFIX))
    .map((n) => ({
      type: n.type as string,
      resource: typeof n.parameters?.resource === "string" ? n.parameters.resource : undefined,
      operation: typeof n.parameters?.operation === "string" ? n.parameters.operation : undefined,
    }));
}

function parseWorkflow(text: string): Record<string, unknown> {
  let obj: Record<string, unknown>;
  try {
    obj = extractJson(text) as Record<string, unknown>;
  } catch {
    throw new LlmError("UPSTREAM", "The model did not return valid JSON.", 422);
  }
  if (!obj || typeof obj !== "object" || !Array.isArray(obj.nodes) || obj.nodes.length === 0) {
    throw new LlmError("UPSTREAM", "The model did not return a workflow with nodes.", 422);
  }
  return normalizeWorkflow(obj);
}

function withValidation(validation: ValidationResult, repairRounds: number): Validation {
  return { ...validation, catalogVersion: catalogVersion(), repairRounds };
}

/** Sends check errors back to the model until clean or out of rounds; never accepts a worse draft. */
async function repairUntilValid(
  call: Complete,
  workflow: Record<string, unknown>,
  extraChoices: Choice[],
  onProgress: OnProgress | undefined,
  label: string
): Promise<{ workflow: Record<string, unknown>; validation: Validation }> {
  let validation = validateWorkflow(workflow);
  let rounds = 0;
  while (validation.errors.length && rounds < MAX_REPAIR_ROUNDS) {
    rounds++;
    onProgress?.({ stage: "repair", workflow: label, round: rounds });
    let repaired: Record<string, unknown>;
    try {
      repaired = parseWorkflow(
        await call(
          GENERATE_SYSTEM_PROMPT,
          repairInput({
            workflowJson: JSON.stringify(workflow),
            errors: formatIssues(validation.errors),
            specs: renderSpecs([...choicesInWorkflow(workflow), ...extraChoices]),
          })
        )
      );
    } catch (err) {
      if (err instanceof LlmError && err.code !== "UPSTREAM") throw err;
      break; // keep the last good draft
    }
    repaired.name = workflow.name;
    const check = validateWorkflow(repaired);
    if (check.errors.length <= validation.errors.length) {
      workflow = repaired;
      validation = check;
    }
  }
  return { workflow, validation: withValidation(validation, rounds) };
}

// ─── Plan ────────────────────────────────────────────────────────────────────

export async function planProject(
  req: ProjectRequest,
  revision?: { plan: Plan; feedback: string }
): Promise<Plan> {
  const call = callFor(req);
  const answersText = formatAnswers(req.answers);
  const searchText = [req.request, answersText, revision?.feedback ?? ""].join("\n");
  const nodes = [...coreNodes(), ...searchNodes(searchText, 12)].map(renderNodeOverview).join("\n");
  const input = planInput({
    request: req.request,
    answers: answersText,
    nodes,
    currentPlan: revision ? JSON.stringify(revision.plan) : undefined,
    feedback: revision?.feedback,
  });

  // One retry: a plan the user reviews must be readable
  let lastError = "The plan could not be read.";
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await call(planSystemPrompt(languageName(req.lang)), input);
    try {
      return parsePlan(extractJson(raw));
    } catch (err) {
      lastError = err instanceof Error ? err.message : lastError;
    }
  }
  throw new LlmError("UPSTREAM", lastError, 422);
}

// ─── Generate ────────────────────────────────────────────────────────────────

function brief(w: PlanWorkflow): WorkflowBrief {
  return {
    name: w.name,
    role: w.role,
    trigger: w.trigger,
    inputs: w.inputs,
    outputs: w.outputs,
    steps: w.steps.map((s) =>
      s.node
        ? `${s.description} [${s.node}${s.resource ? ` resource=${s.resource}` : ""}${s.operation ? ` operation=${s.operation}` : ""}]`
        : s.description
    ),
  };
}

/** Node choices for one planned workflow, including the nodes that link workflows together. */
function choicesForWorkflow(w: PlanWorkflow, plan: Plan): Choice[] {
  const choices: Choice[] = [];
  for (const s of w.steps) {
    if (s.node) choices.push({ type: s.node, resource: s.resource, operation: s.operation });
    // Steps the user added without a node: offer the best matches
    else for (const n of searchNodes(s.description, 2)) choices.push({ type: BASE_PREFIX + n.name });
  }
  if (w.role === "sub") choices.push({ type: `${BASE_PREFIX}executeWorkflowTrigger` });
  if (w.role === "error") choices.push({ type: `${BASE_PREFIX}errorTrigger` });
  if (w.role !== "error" && plan.workflows.some((o) => o.role === "sub" && o.key !== w.key)) {
    choices.push({ type: `${BASE_PREFIX}executeWorkflow` });
  }
  return choices;
}

async function buildWorkflow(
  req: ProjectRequest,
  plan: Plan,
  w: PlanWorkflow,
  onProgress?: OnProgress
): Promise<BuiltWorkflow> {
  const call = callFor(req);
  const choices = choicesForWorkflow(w, plan);
  const draft = parseWorkflow(
    await call(
      GENERATE_SYSTEM_PROMPT,
      generateInput({
        request: req.request,
        answers: formatAnswers(req.answers),
        planSummary: plan.summary,
        workflow: brief(w),
        others: plan.workflows.filter((o) => o.key !== w.key).map(brief),
        specs: renderSpecs(choices),
        nameLanguage: languageName(req.lang),
      })
    )
  );
  // Sub-workflows are selected by name in n8n, so keep the planned names
  draft.name = w.name;
  const { workflow, validation } = await repairUntilValid(call, draft, choices, onProgress, w.name);
  return { key: w.key, name: w.name, role: w.role, workflow, validation };
}

export async function generateProject(req: ProjectRequest, plan: Plan, onProgress?: OnProgress): Promise<ProjectResult> {
  const workflows: BuiltWorkflow[] = [];
  // Sequential: free tiers limit requests per minute
  for (const [index, w] of plan.workflows.entries()) {
    onProgress?.({ stage: "generate", workflow: w.name, index: index + 1, total: plan.workflows.length });
    workflows.push(await buildWorkflow(req, plan, w, onProgress));
  }
  return { plan, workflows };
}

/** Plan and generate without a review step ("skip questions"). */
export async function generateDirect(req: ProjectRequest, onProgress?: OnProgress): Promise<ProjectResult> {
  onProgress?.({ stage: "plan" });
  return generateProject(req, await planProject(req), onProgress);
}

// ─── Refine ──────────────────────────────────────────────────────────────────

export async function refineWorkflow(
  opts: ModelOptions & { workflow: Record<string, unknown>; instruction: string },
  onProgress?: OnProgress
): Promise<{ workflow: Record<string, unknown>; validation: Validation }> {
  const call = callFor(opts);
  const current = normalizeWorkflow(opts.workflow);
  const choices: Choice[] = [
    ...choicesInWorkflow(current),
    ...searchNodes(opts.instruction, 3).map((n) => ({ type: BASE_PREFIX + n.name })),
  ];
  const label = String(current.name);
  onProgress?.({ stage: "generate", workflow: label, index: 1, total: 1 });
  const changed = parseWorkflow(
    await call(
      GENERATE_SYSTEM_PROMPT,
      refineInput({
        workflowJson: JSON.stringify(current),
        instruction: opts.instruction,
        specs: renderSpecs(choices),
        nameLanguage: languageName(opts.lang),
      })
    )
  );
  changed.name = current.name;
  return repairUntilValid(call, changed, choices, onProgress, label);
}

// ─── Validation only ─────────────────────────────────────────────────────────

/** For workflows that did not come from a model (demo mode, uploaded JSON). */
export function validateOnly(workflow: Record<string, unknown>): { workflow: Record<string, unknown>; validation: Validation } {
  const normalized = normalizeWorkflow(workflow);
  return { workflow: normalized, validation: withValidation(validateWorkflow(normalized), 0) };
}

export { formatPlan };
