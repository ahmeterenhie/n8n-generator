import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { INodeProperties, INodeTypeDescription } from "n8n-workflow";

// The official n8n node catalog (data/n8n-catalog.json.gz, built by
// scripts/update-n8n-catalog.mjs). Server-side only.

export const BASE_PREFIX = "n8n-nodes-base.";

export interface CatalogNode extends INodeTypeDescription {
  defaultVersion: number;
  alias: string[];
  categories: string[];
}

interface Catalog {
  version: string;
  nodes: CatalogNode[];
  byType: Map<string, CatalogNode>;
}

let cached: Catalog | null = null;

export function loadCatalog(): Catalog {
  if (!cached) {
    const raw = JSON.parse(gunzipSync(readFileSync(join(process.cwd(), "data", "n8n-catalog.json.gz"))).toString("utf8"));
    const nodes = raw.nodes as CatalogNode[];
    cached = { version: raw.version, nodes, byType: new Map(nodes.map((n) => [BASE_PREFIX + n.name, n])) };
  }
  return cached;
}

export function findNodeType(type: string): CatalogNode | undefined {
  return loadCatalog().byType.get(type);
}

export function supportedVersions(node: CatalogNode): number[] {
  return Array.isArray(node.version) ? node.version : [node.version];
}

export function isTriggerNode(node: CatalogNode): boolean {
  return node.group.includes("trigger") || /Trigger$/.test(node.name) || node.name === "webhook";
}

// ─── Picking relevant nodes ──────────────────────────────────────────────────

/** Always offered: triggers, flow control and data handling used by most workflows. */
export const CORE_NODES = [
  "manualTrigger",
  "scheduleTrigger",
  "webhook",
  "respondToWebhook",
  "formTrigger",
  "set",
  "code",
  "if",
  "switch",
  "filter",
  "merge",
  "splitInBatches",
  "aggregate",
  "httpRequest",
  "wait",
  "noOp",
  "errorTrigger",
  "stopAndError",
  "executeWorkflow",
  "executeWorkflowTrigger",
];

// Turkish (and common) words → English terms that appear in node names/aliases
const SYNONYMS: [RegExp, string][] = [
  [/e-?tablo|tablo|spreadsheet|excel/, "google sheets spreadsheet"],
  [/e-?posta|eposta|mail/, "gmail email send email"],
  [/takvim|randevu/, "google calendar calendar"],
  [/veritaban|database|sql/, "postgres mysql database"],
  [/dosya|klasör|drive/, "google drive file"],
  [/mesaj|bildirim|notification/, "message"],
  [/yapay zek|\bai\b|gpt|chatgpt|llm/, "openai"],
  [/whatsapp/, "whatsapp"],
  [/telegram/, "telegram"],
  [/sms/, "twilio sms"],
  [/rss|haber/, "rss feed"],
  [/ftp|sftp/, "ftp"],
  [/github|gitlab/, "github gitlab"],
  [/notion/, "notion"],
  [/trello|asana|jira|clickup/, "trello asana jira clickup"],
  [/stripe|ödeme|payment/, "stripe"],
  [/shopify|woocommerce|e-?ticaret/, "shopify woocommerce"],
  [/hubspot|crm|salesforce|pipedrive/, "hubspot salesforce pipedrive"],
  [/discord/, "discord"],
  [/teams/, "microsoft teams"],
  [/outlook/, "microsoft outlook"],
];

function normalize(text: string): string {
  return text.toLocaleLowerCase("tr").replace(/ı/g, "i").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Scores catalog nodes against the request text and returns the best app nodes (core nodes excluded). */
export function searchNodes(text: string, limit = 8): CatalogNode[] {
  const lower = text.toLocaleLowerCase("tr");
  const expanded = normalize(
    lower + " " + SYNONYMS.filter(([re]) => re.test(lower)).map(([, terms]) => terms).join(" ")
  );
  const words = new Set(expanded.split(/[^a-z0-9]+/).filter((w) => w.length > 2));

  const scored = loadCatalog()
    .nodes.filter((n) => !CORE_NODES.includes(n.name) && !n.hidden)
    .map((n) => {
      const display = normalize(n.displayName.replace(/\s*trigger$/i, ""));
      let score = 0;
      if (display.length > 2 && expanded.includes(display)) score += 10 + display.length / 10;
      for (const w of display.split(/\s+/)) if (w.length > 2 && words.has(w)) score += 2;
      for (const a of n.alias ?? []) if (words.has(normalize(a))) score += 1;
      // Prefer the action node over its trigger unless the text talks about events
      if (/Trigger$/.test(n.name) && !/(when|gelince|geldiğinde|olduğunda|trigger|tetikle)/.test(lower)) score -= 1;
      return { n, score };
    })
    .filter((s) => s.score >= 3)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((s) => s.n);
}

export function coreNodes(): CatalogNode[] {
  return CORE_NODES.map((name) => findNodeType(BASE_PREFIX + name)).filter((n): n is CatalogNode => !!n);
}

// ─── Rendering specs for the model ───────────────────────────────────────────

const MAX_SPEC_CHARS = 9000;

function formatValue(value: unknown): string {
  return JSON.stringify(value)?.slice(0, 80) ?? "";
}

function formatConditions(display: INodeProperties["displayOptions"]): string {
  if (!display) return "";
  const part = (conds: Record<string, unknown[]> | undefined, label: string) =>
    Object.entries(conds ?? {})
      .filter(([key]) => !key.startsWith("@")) // version conditions are handled by using the default version
      .map(([key, values]) => `${label}${key}=${(values ?? []).map((v) => (typeof v === "object" ? "…" : String(v))).join("|")}`);
  const all = [
    ...part(display.show as Record<string, unknown[]>, ""),
    ...part(display.hide as Record<string, unknown[]>, "not "),
  ];
  return all.length ? ` [only if ${all.join(", ")}]` : "";
}

function formatProperty(p: INodeProperties, indent: string): string[] {
  if (p.type === "notice" || p.type === "hidden" || p.type === "button") return [];
  const hint = (p as { builderHint?: { message?: string } }).builderHint?.message;
  let line = `${indent}- ${p.name} (${p.type}${p.required ? ", required" : ""})${formatConditions(p.displayOptions)}`;

  if ((p.type === "options" || p.type === "multiOptions") && Array.isArray(p.options)) {
    const values = (p.options as { value?: unknown }[]).map((o) => formatValue(o.value)).slice(0, 40);
    line += ` values: ${values.join(", ")}`;
  }
  if (p.type === "resourceLocator" && Array.isArray(p.modes)) {
    line += ` modes: ${p.modes.map((m) => m.name).join("|")}`;
  }
  const def = p.default;
  if (def !== undefined && def !== "" && !(typeof def === "object" && def !== null && Object.keys(def).length === 0)) {
    line += ` default: ${formatValue(def)}`;
  }
  if (hint) line += ` — hint: ${hint}`;

  const lines = [line];
  // One level of children for collections, so the model knows the field names
  if (p.type === "collection" && Array.isArray(p.options)) {
    const names = (p.options as INodeProperties[]).map((c) => `${c.name} (${c.type})`);
    lines.push(`${indent}  fields: ${names.join(", ")}`);
  }
  if (p.type === "fixedCollection" && Array.isArray(p.options)) {
    for (const group of p.options as { name: string; values?: INodeProperties[] }[]) {
      const names = (group.values ?? []).map((c) => `${c.name} (${c.type})`);
      lines.push(`${indent}  ${group.name}: [{ ${names.join(", ")} }]`);
    }
  }
  return lines;
}

export interface NodeChoice {
  resource?: string;
  operation?: string;
}

function valuesOf(p: INodeProperties | undefined): string[] {
  return ((p?.options ?? []) as { value?: unknown }[]).map((o) => String(o.value));
}

/** Resources and the operations each offers, e.g. "message: post, update, delete". */
function operationMap(node: CatalogNode): string[] {
  const resource = node.properties.find((p) => p.name === "resource" && p.type === "options");
  const operations = node.properties.filter((p) => p.name === "operation" && p.type === "options");
  if (!resource) return operations.length ? [`operations: ${valuesOf(operations[0]).join(", ")}`] : [];
  return valuesOf(resource).map((r) => {
    const ops = operations.find((o) => (o.displayOptions?.show?.resource as unknown[] | undefined)?.includes(r));
    return `resource "${r}": operations ${ops ? valuesOf(ops).join(", ") : "(none)"}`;
  });
}

/** Short summary for choosing nodes: what the node is and which operations it has. */
export function renderNodeOverview(node: CatalogNode): string {
  const trigger = isTriggerNode(node) ? " (trigger)" : "";
  return [`- ${BASE_PREFIX}${node.name}${trigger}: ${node.displayName} — ${node.description}`, ...operationMap(node).map((l) => `    ${l}`)].join(
    "\n"
  );
}

// Keep a property unless it is tied to a different resource/operation than the one chosen
function matchesChoice(p: INodeProperties, choice: NodeChoice): boolean {
  const show = (p.displayOptions?.show ?? {}) as Record<string, unknown[] | undefined>;
  if (choice.resource && show.resource && !show.resource.includes(choice.resource)) return false;
  if (choice.operation && show.operation && !show.operation.includes(choice.operation)) return false;
  return true;
}

/** Model-readable spec of a node type at its default version, narrowed to the chosen resource/operation. */
export function renderNodeSpec(node: CatalogNode, choice: NodeChoice = {}): string {
  const header = [
    `### ${node.displayName} — type "${BASE_PREFIX}${node.name}", typeVersion ${node.defaultVersion}`,
    node.description,
  ];
  const nodeHint = (node as { builderHint?: { message?: string } }).builderHint?.message;
  if (nodeHint) header.push(`Hint: ${nodeHint}`);
  if (node.credentials?.length) header.push(`Credentials: ${node.credentials.map((c) => c.name).join(", ")}`);
  if (isTriggerNode(node)) header.push("This is a trigger node: it starts the workflow and has no input.");
  const outputs = Array.isArray(node.outputs) ? node.outputs.length : 1;
  if (outputs > 1) header.push(`Outputs: ${outputs} (output index 0 = first)`);
  if (choice.resource || choice.operation) {
    header.push(`Showing parameters for resource "${choice.resource ?? "-"}", operation "${choice.operation ?? "-"}".`);
  }

  const props = node.properties.filter((p) => matchesChoice(p, choice));
  const body = ["Parameters:", ...props.flatMap((p) => formatProperty(p, ""))];
  let text = [...header, ...body].join("\n");
  if (text.length > MAX_SPEC_CHARS) text = text.slice(0, MAX_SPEC_CHARS) + "\n… (more optional parameters omitted)";
  return text;
}

export function catalogVersion(): string {
  return loadCatalog().version;
}
