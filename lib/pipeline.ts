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
import { GENERATE_SYSTEM_PROMPT, PLAN_SYSTEM_PROMPT, generateInput, repairInput } from "@/lib/n8n/prompts";
import { formatIssues, normalizeWorkflow, validateWorkflow, type ValidationResult } from "@/lib/n8n/validate";
import { extractJson } from "@/lib/requestUtils";

// Workflow generation: plan the nodes → generate with the exact specs of
// those nodes → validate against the n8n catalog → let the model repair
// what the check finds (a limited number of rounds).

const MAX_REPAIR_ROUNDS = 2;

export interface GenerateOptions {
  provider: "anthropic" | "openai" | "gemini";
  apiKey: unknown;
  model: unknown;
  request: string;
  answers: ClarifyAnswer[];
  lang: Lang;
  /** Replaces the provider call (tests and evaluation use a scripted model) */
  complete?: (system: string, input: string) => Promise<string>;
}

type Complete = (system: string, input: string) => Promise<string>;

export interface Validation extends ValidationResult {
  catalogVersion: string;
  repairRounds: number;
}

export interface GenerateResult {
  workflow: Record<string, unknown>;
  validation: Validation;
  plan: string;
}

interface PlannedNode extends NodeChoice {
  type: string;
  purpose?: string;
}

function choiceKey(type: string, choice: NodeChoice): string {
  return `${type}|${choice.resource ?? ""}|${choice.operation ?? ""}`;
}

/** Specs for a set of (type, resource, operation) choices, one per distinct choice. */
function renderSpecs(choices: PlannedNode[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const c of choices) {
    const node = findNodeType(c.type);
    if (!node) continue;
    const key = choiceKey(c.type, c);
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(renderNodeSpec(node, c));
  }
  return parts.join("\n\n");
}

/** What the draft actually uses, so repair rounds get the matching specs. */
function choicesInWorkflow(workflow: Record<string, unknown>): PlannedNode[] {
  const nodes = (Array.isArray(workflow.nodes) ? workflow.nodes : []) as {
    type?: string;
    parameters?: Record<string, unknown>;
  }[];
  return nodes
    .filter((n) => typeof n.type === "string" && n.type.startsWith(BASE_PREFIX))
    .map((n) => ({
      type: n.type as string,
      resource: typeof n.parameters?.resource === "string" ? n.parameters.resource : undefined,
      operation: typeof n.parameters?.operation === "string" ? n.parameters.operation : undefined,
    }));
}

function parseWorkflow(text: string): Record<string, unknown> {
  const obj = extractJson(text) as Record<string, unknown>;
  if (!obj || typeof obj !== "object" || !Array.isArray(obj.nodes) || obj.nodes.length === 0) {
    throw new LlmError("UPSTREAM", "The model did not return a workflow with nodes.", 422);
  }
  return normalizeWorkflow(obj);
}

async function planNodes(
  opts: GenerateOptions,
  answersText: string,
  call: Complete
): Promise<{ summary: string; nodes: PlannedNode[] }> {
  const candidates = [...coreNodes(), ...searchNodes(`${opts.request}\n${answersText}`, 10)];
  const input = [
    `Request: ${opts.request}`,
    answersText ? `\nAnswers to clarifying questions:\n${answersText}` : "",
    "\n## Available nodes",
    candidates.map(renderNodeOverview).join("\n"),
  ].join("\n");

  try {
    const raw = await call(PLAN_SYSTEM_PROMPT, input);
    const parsed = extractJson(raw) as { summary?: unknown; nodes?: unknown };
    const nodes = (Array.isArray(parsed.nodes) ? parsed.nodes : [])
      .filter((n): n is PlannedNode => typeof n?.type === "string" && !!findNodeType(n.type))
      .map((n) => ({
        type: n.type,
        resource: typeof n.resource === "string" && n.resource ? n.resource : undefined,
        operation: typeof n.operation === "string" && n.operation ? n.operation : undefined,
        purpose: typeof n.purpose === "string" ? n.purpose : undefined,
      }));
    if (nodes.length) return { summary: typeof parsed.summary === "string" ? parsed.summary : "", nodes };
  } catch (err) {
    // Provider errors (bad key, quota) must reach the user; a malformed plan is not fatal
    if (err instanceof LlmError) throw err;
  }
  // Fallback: offer the candidate nodes without narrowing to an operation
  return { summary: "", nodes: candidates.map((n) => ({ type: BASE_PREFIX + n.name })) };
}

export async function generateWorkflow(opts: GenerateOptions): Promise<GenerateResult> {
  const answersText = formatAnswers(opts.answers);
  const nameLanguage = opts.lang === "tr" ? "Turkish" : "English";
  const call: Complete = opts.complete ?? ((system, input) => generateText({ ...opts, system, input }));

  // 1. Plan
  const plan = await planNodes(opts, answersText, call);
  const planText = [
    plan.summary,
    ...plan.nodes.map(
      (n) => `- ${n.type}${n.resource ? ` resource=${n.resource}` : ""}${n.operation ? ` operation=${n.operation}` : ""}${n.purpose ? `: ${n.purpose}` : ""}`
    ),
  ]
    .filter(Boolean)
    .join("\n");

  // 2. Generate with the exact specs of the planned nodes
  let workflow = parseWorkflow(
    await call(
      GENERATE_SYSTEM_PROMPT,
      generateInput({ request: opts.request, answers: answersText, plan: planText, specs: renderSpecs(plan.nodes), nameLanguage })
    )
  );
  let validation = validateWorkflow(workflow);

  // 3. Repair what the check finds
  let rounds = 0;
  while (validation.errors.length && rounds < MAX_REPAIR_ROUNDS) {
    rounds++;
    let repaired: Record<string, unknown>;
    try {
      repaired = parseWorkflow(
        await call(
          GENERATE_SYSTEM_PROMPT,
          repairInput({
            workflowJson: JSON.stringify(workflow),
            errors: formatIssues(validation.errors),
            specs: renderSpecs([...choicesInWorkflow(workflow), ...plan.nodes]),
          })
        )
      );
    } catch (err) {
      if (err instanceof LlmError && err.code !== "UPSTREAM") throw err;
      break; // keep the last valid draft
    }
    const check = validateWorkflow(repaired);
    // Only accept a repair that does not make things worse
    if (check.errors.length <= validation.errors.length) {
      workflow = repaired;
      validation = check;
    }
  }

  return {
    workflow,
    validation: { ...validation, catalogVersion: catalogVersion(), repairRounds: rounds },
    plan: planText,
  };
}

/** Validation for workflows that did not come from a model (demo mode). */
export function validateOnly(workflow: Record<string, unknown>): { workflow: Record<string, unknown>; validation: Validation } {
  const normalized = normalizeWorkflow(workflow);
  return {
    workflow: normalized,
    validation: { ...validateWorkflow(normalized), catalogVersion: catalogVersion(), repairRounds: 0 },
  };
}
