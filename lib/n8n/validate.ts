import { randomUUID } from "node:crypto";
import { NodeHelpers, type INode, type INodeParameters, type INodeProperties } from "n8n-workflow";
import { BASE_PREFIX, findNodeType, isTriggerNode, supportedVersions, type CatalogNode } from "@/lib/n8n/catalog";

// Checks a generated workflow against the official n8n node catalog, using
// n8n's own parameter logic (the same checks behind the editor's red
// warnings) plus checks n8n skips: unknown parameters, invalid option values,
// unsupported versions and broken connections.

export interface ValidationIssue {
  node?: string;
  message: string;
  /** Set on warnings the UI explains in the user's language */
  code?: "FILL_IN" | "PLACEHOLDER" | "NO_TRIGGER" | "DISCONNECTED" | "UNVERIFIED_TYPE";
  param?: string;
}

export interface ValidationResult {
  errors: ValidationIssue[];
  /** Expected leftovers the user completes in n8n (placeholders, pick-from-list fields) */
  warnings: ValidationIssue[];
}

interface WorkflowLike {
  name?: unknown;
  nodes?: unknown;
  connections?: unknown;
  settings?: unknown;
  active?: unknown;
  id?: unknown;
}

type RawNode = Partial<INode> & Record<string, unknown>;
type Connections = Record<string, Record<string, unknown>>;

const PLACEHOLDER = /YOUR_[A-Z0-9_]+/;

/** Fills in fields n8n needs but that carry no meaning (ids, positions, defaults). */
export function normalizeWorkflow(workflow: WorkflowLike): Record<string, unknown> {
  const nodes = (Array.isArray(workflow.nodes) ? workflow.nodes : []).map((n: RawNode, i: number) => ({
    ...n,
    id: typeof n.id === "string" && n.id ? n.id : randomUUID(),
    position:
      Array.isArray(n.position) && n.position.length === 2 && n.position.every((v) => typeof v === "number")
        ? n.position
        : [250 + i * 250, 300],
    parameters: n.parameters && typeof n.parameters === "object" ? n.parameters : {},
  }));
  return {
    ...workflow,
    name: typeof workflow.name === "string" && workflow.name ? workflow.name : "Generated workflow",
    nodes,
    connections: workflow.connections && typeof workflow.connections === "object" ? workflow.connections : {},
    active: false,
    settings: { executionOrder: "v1", ...(workflow.settings && typeof workflow.settings === "object" ? workflow.settings : {}) },
  };
}

function hasPlaceholder(value: unknown): boolean {
  return PLACEHOLDER.test(JSON.stringify(value ?? ""));
}

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (typeof value === "object" && "value" in (value as object)) return isEmptyValue((value as { value: unknown }).value);
  return false;
}

function optionValues(p: INodeProperties): string[] {
  return ((p.options ?? []) as { value?: unknown }[]).map((o) => String(o.value));
}

function checkNodeParameters(node: INode, type: CatalogNode, result: ValidationResult) {
  const raw = (node.parameters ?? {}) as INodeParameters;
  let resolved: INodeParameters | null;
  try {
    // Same call the n8n editor makes: applies defaults and drops parameters that are not shown
    resolved = NodeHelpers.getNodeParameters(type.properties, raw, true, false, node, type);
  } catch (err) {
    result.errors.push({ node: node.name, message: `Parameters could not be read: ${(err as Error).message}` });
    return;
  }
  if (!resolved) return;

  // Some parameters only appear once the user has picked a value (e.g. Google
  // Sheets columns after the sheet). Judge visibility as if those were filled.
  const filled: INodeParameters = { ...resolved };
  for (const p of type.properties) {
    if (p.type === "resourceLocator" && isEmptyValue(filled[p.name])) {
      filled[p.name] = { __rl: true, mode: "id", value: "picked-by-user" };
    }
  }
  const shownOnceFilled = (key: string) =>
    type.properties.some((p) => p.name === key && NodeHelpers.displayParameter(filled, p, node, type));

  // Parameters n8n would silently drop: misspelled, from another version, or for another operation
  for (const key of Object.keys(raw)) {
    if (!(key in resolved) && !shownOnceFilled(key)) {
      result.errors.push({
        node: node.name,
        message: `Parameter "${key}" does not exist for this node with these settings (typeVersion ${node.typeVersion}), so n8n ignores it. Use the parameter names from the node spec.`,
      });
    }
  }

  // Option values must be one of the allowed values (expressions are allowed)
  for (const p of type.properties) {
    if (p.type !== "options" && p.type !== "multiOptions") continue;
    if (!(p.name in raw) || !NodeHelpers.displayParameter(resolved, p, node, type)) continue;
    const allowed = optionValues(p);
    if (!allowed.length) continue; // loaded dynamically from the service
    const values = Array.isArray(raw[p.name]) ? (raw[p.name] as unknown[]) : [raw[p.name]];
    for (const v of values) {
      if (typeof v === "string" && v.startsWith("=")) continue;
      if (!allowed.includes(String(v))) {
        result.errors.push({
          node: node.name,
          message: `Parameter "${p.name}" has invalid value ${JSON.stringify(v)}. Allowed: ${allowed.slice(0, 20).map((a) => JSON.stringify(a)).join(", ")}.`,
        });
      }
    }
  }

  // n8n's own issue check (required fields, invalid formats)
  const issues = NodeHelpers.getNodeParametersIssues(type.properties, { ...node, parameters: resolved }, type);
  for (const [param, messages] of Object.entries(issues?.parameters ?? {})) {
    const value = resolved[param];
    const prop = type.properties.find((p) => p.name === param);
    const userMustFill = hasPlaceholder(value) || (prop?.type === "resourceLocator" && isEmptyValue(value));
    for (const message of messages) {
      const issue = { node: node.name, message: `${param}: ${message}` };
      if (userMustFill) {
        result.warnings.push({ node: node.name, code: "FILL_IN", param, message: `${param}: to be filled in by the user in n8n` });
      }
      else result.errors.push(issue);
    }
  }

  // Placeholders anywhere else are fine but worth listing
  for (const [key, value] of Object.entries(raw)) {
    if (hasPlaceholder(value) && !issues?.parameters?.[key]) {
      result.warnings.push({ node: node.name, code: "PLACEHOLDER", param: key, message: `${key}: contains a placeholder to replace` });
    }
  }
}

export function validateWorkflow(workflow: Record<string, unknown>): ValidationResult {
  const result: ValidationResult = { errors: [], warnings: [] };
  const nodes = (Array.isArray(workflow.nodes) ? workflow.nodes : []) as INode[];
  const connections = (workflow.connections ?? {}) as Connections;

  if (!nodes.length) {
    result.errors.push({ message: "The workflow has no nodes." });
    return result;
  }

  // Node names are the keys of "connections", so they must be unique
  const names = new Map<string, INode>();
  for (const node of nodes) {
    if (typeof node.name !== "string" || !node.name) {
      result.errors.push({ message: "A node is missing its name." });
      continue;
    }
    if (names.has(node.name)) result.errors.push({ node: node.name, message: "Two nodes share this name; names must be unique." });
    names.set(node.name, node);
  }

  const typeOf = new Map<string, CatalogNode>();
  for (const node of names.values()) {
    if (typeof node.type !== "string") {
      result.errors.push({ node: node.name, message: "Missing node type." });
      continue;
    }
    if (!node.type.startsWith(BASE_PREFIX)) {
      result.warnings.push({
        node: node.name,
        code: "UNVERIFIED_TYPE",
        param: node.type,
        message: `Node type "${node.type}" is not in the n8n core catalog and was not verified.`,
      });
      continue;
    }
    const type = findNodeType(node.type);
    if (!type) {
      result.errors.push({ node: node.name, message: `Node type "${node.type}" does not exist in n8n. Use a node type from the catalog.` });
      continue;
    }
    typeOf.set(node.name, type);
    if (!supportedVersions(type).includes(node.typeVersion)) {
      result.errors.push({
        node: node.name,
        message: `typeVersion ${JSON.stringify(node.typeVersion)} is not available for ${node.type}; use typeVersion ${type.defaultVersion} and its parameters.`,
      });
      continue; // parameters depend on the version
    }
    checkNodeParameters(node, type, result);
  }

  // Connections: every source and target must exist; triggers have no inputs
  const connected = new Set<string>();
  for (const [source, byType] of Object.entries(connections)) {
    if (!names.has(source)) {
      result.errors.push({ message: `Connections refer to a node named "${source}" that does not exist.` });
      continue;
    }
    const main = (byType as { main?: unknown }).main;
    if (!Array.isArray(main)) {
      result.errors.push({ node: source, message: 'Connections must use the form { "main": [[{ "node": "...", "type": "main", "index": 0 }]] }.' });
      continue;
    }
    const outputs = typeOf.get(source)?.outputs;
    // "continueErrorOutput" adds an extra error output after the regular ones
    const outputCount = Array.isArray(outputs)
      ? outputs.length + (names.get(source)?.onError === "continueErrorOutput" ? 1 : 0)
      : Infinity; // dynamic outputs (e.g. Switch) are computed from parameters
    main.forEach((targets, outputIndex) => {
      if (outputIndex >= outputCount && (targets as unknown[])?.length) {
        result.errors.push({ node: source, message: `Uses output ${outputIndex}, but this node has only ${outputCount} output(s).` });
      }
      for (const t of Array.isArray(targets) ? targets : []) {
        const target = (t as { node?: unknown })?.node;
        if (typeof target !== "string" || !names.has(target)) {
          result.errors.push({ node: source, message: `Connects to a node named ${JSON.stringify(target)} that does not exist.` });
          continue;
        }
        const targetType = typeOf.get(target);
        if (targetType && isTriggerNode(targetType)) {
          result.errors.push({ node: target, message: "A trigger node cannot receive input from another node." });
        }
        connected.add(source).add(target);
      }
    });
  }

  // Cross-node rule n8n only reports at run time: a "Respond to Webhook" node
  // requires the webhook to wait for it
  const typeNames = [...names.values()].map((n) => n.type);
  if (typeNames.includes(`${BASE_PREFIX}respondToWebhook`)) {
    for (const node of names.values()) {
      if (node.type === `${BASE_PREFIX}webhook` && (node.parameters as INodeParameters)?.responseMode !== "responseNode") {
        result.errors.push({
          node: node.name,
          message: 'The workflow uses a "Respond to Webhook" node, so this webhook must set responseMode to "responseNode".',
        });
      }
    }
  }

  const triggers = [...names.keys()].filter((n) => {
    const t = typeOf.get(n);
    return t && isTriggerNode(t);
  });
  if (!triggers.length) {
    result.warnings.push({ code: "NO_TRIGGER", message: "The workflow has no trigger node, so it can only be started manually." });
  }
  if (names.size > 1) {
    for (const name of names.keys()) {
      if (!connected.has(name) && typeOf.get(name)?.name !== "stickyNote") {
        result.warnings.push({ node: name, code: "DISCONNECTED", message: "This node is not connected to anything." });
      }
    }
  }

  return result;
}

export function formatIssues(issues: ValidationIssue[]): string {
  return issues.map((i) => `- ${i.node ? `[${i.node}] ` : ""}${i.message}`).join("\n");
}
