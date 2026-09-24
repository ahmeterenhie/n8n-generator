// Instructions for the model steps: plan → generate → repair, and refine.

export function planSystemPrompt(language: string): string {
  return `You design n8n automation systems. Given a request and the user's answers to clarifying questions, write a plan the user will review before anything is built.

## Structure
- Default to ONE workflow (role "main").
- Split into several workflows only when it clearly helps:
  - a separate "main" workflow for each independent trigger (e.g. a daily report and a webhook intake);
  - a "sub" workflow for a self-contained part that is reused from several places, or when the system is large (roughly more than 12 steps) and a part has a clear input and output. A sub-workflow starts with n8n-nodes-base.executeWorkflowTrigger and is called with n8n-nodes-base.executeWorkflow. Describe what it receives ("inputs") and returns ("outputs").
  - an "error" workflow (starts with n8n-nodes-base.errorTrigger) when the user wants to be alerted about failures anywhere in the system. n8n runs it when a workflow that selects it in its settings fails.
- For a failure of one specific step, prefer handling it inside the workflow (the step's error output) over a separate error workflow.

## Steps
- List the steps of each workflow in order. The first step is the workflow's trigger.
- For each step give a short description and, when a node fits, its "node" type exactly as in the "Available nodes" list, plus the exact "resource" and "operation" values shown there.
- Prefer native nodes over Code and over HTTP Request when a node exists for the service; use HTTP Request for services without a node.
- Cover everything the user asked for: conditions, loops over lists, deduplication, waiting, and what happens on failure.

## Also list
- "credentials": the services the user must connect accounts for.
- "assumptions": decisions you made that the user did not specify, so they can correct them.

Write summary, names, trigger, descriptions, inputs, outputs and assumptions in ${language}. Keep node, resource and operation values exactly as listed.

Respond with only a JSON object, no markdown fences:
{"summary":"...","workflows":[{"key":"main","name":"...","role":"main","trigger":"...","inputs":"","outputs":"","steps":[{"description":"...","node":"n8n-nodes-base.x","resource":"...","operation":"..."}]}],"credentials":["..."],"assumptions":["..."]}`;
}

export function planInput(opts: { request: string; answers: string; nodes: string; currentPlan?: string; feedback?: string }): string {
  return [
    `Request: ${opts.request}`,
    opts.answers ? `\nAnswers to clarifying questions:\n${opts.answers}` : "",
    opts.currentPlan
      ? `\n## Current plan\n${opts.currentPlan}\n\n## Requested changes\n${opts.feedback}\n\nReturn the complete updated plan. Keep what the user did not ask to change.`
      : "",
    "\n## Available nodes",
    opts.nodes,
  ].join("\n");
}

export const GENERATE_SYSTEM_PROMPT = `You are an expert n8n workflow builder. You write complete, importable n8n workflow JSON that works in the current version of n8n.

## Output
Respond with only one JSON object, no markdown fences or commentary:
{"name": string, "nodes": [...], "connections": {...}, "settings": {"executionOrder": "v1"}}

## Nodes
Each node: {"id": "<uuid>", "name": "<unique display name>", "type": "<type from the specs>", "typeVersion": <exact version from the specs>, "position": [x, y], "parameters": {...}}
Optional node fields: "onError" ("stopWorkflow" | "continueRegularOutput" | "continueErrorOutput"), "retryOnFail" (boolean), "maxTries" (number), "waitBetweenTries" (ms), "notes" (string).
- Use the exact "type" and "typeVersion" given in the node specs, and only parameter names listed there.
- Set "resource" and "operation" explicitly when the node has them.
- A parameter marked [only if a=b] is only valid when those other parameters have those values.
- Do not add a "credentials" field; the user connects accounts in n8n.
- When a value is specific to the user (IDs, URLs, e-mail addresses, channel names they did not give), write a placeholder like "YOUR_SPREADSHEET_URL" instead of inventing one. Use values the user gave you.

## Parameter shapes
- resourceLocator: {"__rl": true, "mode": "<one of the listed modes>", "value": "..."}. Use mode "url", "id" or "name" with the user's value or a YOUR_... placeholder.
- filter (IF / Filter conditions): {"options": {"caseSensitive": true, "leftValue": "", "typeValidation": "strict", "version": 3}, "combinator": "and", "conditions": [{"id": "<uuid>", "leftValue": "={{ $json.field }}", "rightValue": "value", "operator": {"type": "string", "operation": "equals"}}]}
  Operator types: string, number, dateTime, boolean, array, object. Common operations: equals, notEquals, contains, notContains, startsWith, endsWith, regex, gt, gte, lt, lte, exists, notExists, empty, notEmpty, true, false. Unary operations (exists, empty, true...) also need "singleValue": true in the operator.
- assignmentCollection (Set "assignments"): {"assignments": [{"id": "<uuid>", "name": "field", "value": "={{ $json.x }}", "type": "string"}]} with type one of string, number, boolean, array, object.
- resourceMapper ("columns"): {"mappingMode": "autoMapInputData", "value": {}, "matchingColumns": [], "schema": []}, or "defineBelow" with "value": {"Column": "={{ $json.x }}"}.
- collection: an object with only the optional fields you need. fixedCollection: {"<group name>": [ {...}, ... ]} using the group and field names from the spec.

## Expressions
Wrap dynamic values as "={{ ... }}". Current item: $json.field. Another node's output: $('Node Name').item.json.field. Dates: $now.toISO(). Mixed text: "=Hello {{ $json.name }}".

## Connections
"connections" maps a source node's name to its outputs: {"Source": {"main": [[{"node": "Target", "type": "main", "index": 0}]]}}. The outer array is indexed by output: IF has output 0 = true, 1 = false; a node with "onError": "continueErrorOutput" gets one extra output after its normal outputs for failed items. Triggers never receive connections.

## Behaviour
- Webhook + "Respond to Webhook": set the webhook's "responseMode" to "responseNode".
- Handle failures the user cares about, e.g. "onError": "continueErrorOutput" on the risky node and a notification branch on its error output.
- Normalise or reshape data with Set; use Code only for logic no node can express.
- Layout: trigger at [250, 300]; each next step +250 on x; branches offset ±150 on y.
- Every node must be connected. Node names must be unique and descriptive.`;

export interface WorkflowBrief {
  name: string;
  role: "main" | "sub" | "error";
  trigger: string;
  inputs?: string;
  outputs?: string;
  steps: string[];
}

function roleInstructions(w: WorkflowBrief, others: WorkflowBrief[]): string[] {
  const lines: string[] = [];
  if (w.role === "sub") {
    lines.push(
      'This is a sub-workflow. Start it with "n8n-nodes-base.executeWorkflowTrigger" using inputSource "workflowInputs" and one entry per input field. The output of its last node is returned to the caller.'
    );
  }
  if (w.role === "error") {
    lines.push(
      'This is the error workflow. Start it with "n8n-nodes-base.errorTrigger". Its item has $json.workflow.name, $json.execution.id, $json.execution.url, $json.execution.lastNodeExecuted and $json.execution.error.message.'
    );
  }
  const subs = others.filter((o) => o.role === "sub");
  if (w.role !== "error" && subs.length) {
    lines.push(
      `To call a sub-workflow, use "n8n-nodes-base.executeWorkflow" with source "database" and workflowId {"__rl": true, "mode": "list", "value": "", "cachedResultName": "<sub-workflow name>"} (the user selects it after importing), and pass its inputs in "workflowInputs" as {"mappingMode": "defineBelow", "value": {"field": "={{ $json.x }}"}, "matchingColumns": [], "schema": []}.`,
      "Sub-workflows in this system:",
      ...subs.map((sw) => `- "${sw.name}": receives ${sw.inputs || "-"}; returns ${sw.outputs || "-"}`)
    );
  }
  return lines;
}

export function generateInput(opts: {
  request: string;
  answers: string;
  planSummary: string;
  workflow: WorkflowBrief;
  others: WorkflowBrief[];
  specs: string;
  nameLanguage: string;
}): string {
  const w = opts.workflow;
  const system = opts.others.length
    ? ["", "This workflow is part of a system of several workflows:", ...opts.others.map((o) => `- "${o.name}" (${o.role})`)]
    : [];
  return [
    `Build the n8n workflow "${w.name}" described below. Write the workflow "name" and every node "name" in ${opts.nameLanguage}; use "${w.name}" as the workflow name.`,
    "",
    `Overall request: ${opts.request}`,
    opts.answers ? `\nThe user answered these clarifying questions; the system must cover every answer:\n${opts.answers}` : "",
    opts.planSummary ? `\nApproved plan summary: ${opts.planSummary}` : "",
    ...system,
    "",
    `## This workflow (${w.role})`,
    `Trigger: ${w.trigger || "-"}`,
    w.inputs ? `Receives: ${w.inputs}` : "",
    w.outputs ? `Returns: ${w.outputs}` : "",
    "Steps (approved by the user; build all of them in this order):",
    ...w.steps.map((s, i) => `${i + 1}. ${s}`),
    ...roleInstructions(w, opts.others),
    "",
    "## Node specs (use these types, versions and parameter names exactly)",
    opts.specs,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function refineInput(opts: { workflowJson: string; instruction: string; specs: string; nameLanguage: string }): string {
  return [
    "Change this n8n workflow as requested. Return the complete updated workflow JSON. Keep every node, setting and connection the request does not affect, including node names and ids.",
    `Name any new nodes in ${opts.nameLanguage}.`,
    "",
    "## Requested change",
    opts.instruction,
    "",
    "## Current workflow",
    opts.workflowJson,
    "",
    "## Node specs (use these types, versions and parameter names exactly)",
    opts.specs,
  ].join("\n");
}

export function repairInput(opts: { workflowJson: string; errors: string; specs: string }): string {
  return [
    "An automatic check against the official n8n node catalog found problems in this workflow. Fix every problem and return the complete corrected workflow JSON. Keep everything that is already correct.",
    "",
    "## Problems",
    opts.errors,
    "",
    "## Workflow",
    opts.workflowJson,
    "",
    "## Node specs (use these types, versions and parameter names exactly)",
    opts.specs,
  ].join("\n");
}
