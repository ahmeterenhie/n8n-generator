import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// ─── OpenAI client ────────────────────────────────────────────────────────────
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ─── System Prompt ────────────────────────────────────────────────────────────
const N8N_SYSTEM_PROMPT = `You are an expert n8n workflow architect. Your sole job is to convert a natural language description into a valid, importable n8n workflow JSON object.

## OUTPUT CONTRACT
You MUST respond with ONLY a single raw JSON object — no markdown fences, no commentary, no preamble.
The root object must have exactly these top-level keys:
  - "name"        (string)   — a short, descriptive workflow name
  - "nodes"       (array)    — all workflow nodes
  - "connections" (object)   — all wiring between nodes
  - "active"      (boolean)  — always false for generated workflows
  - "settings"    (object)   — workflow-level settings
  - "id"          (string)   — a UUIDv4 string

## NODE SCHEMA
Each element of "nodes" must conform to:
{
  "id":          string,          // short UUID or unique slug, e.g. "webhook-1"
  "name":        string,          // human-readable display name
  "type":        string,          // exact n8n node type (see catalog below)
  "typeVersion": number,          // use the version listed in the catalog
  "position":    [number, number],// [x, y] canvas position; space nodes ~250px apart horizontally
  "parameters":  object           // node-specific parameters (see catalog)
}

## CONNECTIONS SCHEMA
"connections" is a map from a SOURCE node's "name" to its outgoing edges:
{
  "<SourceNodeName>": {
    "main": [
      [
        { "node": "<TargetNodeName>", "type": "main", "index": 0 }
      ]
    ]
  }
}
Rules:
- Keys must match the node "name" field exactly (case-sensitive).
- "main" is an array-of-arrays. Index 0 = first output branch.
- For nodes with multiple outputs (e.g. IF), use index 0 for TRUE branch, index 1 for FALSE branch.
- Trigger nodes (Webhook, Cron, Manual) are always the first node; do NOT add them as targets.

## NODE CATALOG

### Triggers
1. Webhook Trigger
   type: "n8n-nodes-base.webhook"
   typeVersion: 1
   parameters: { "httpMethod": "POST"|"GET", "path": string, "responseMode": "onReceived"|"lastNode" }

2. Cron / Schedule Trigger
   type: "n8n-nodes-base.scheduleTrigger"
   typeVersion: 1
   parameters: { "rule": { "interval": [{ "field": "cronExpression", "expression": "0 9 * * *" }] } }

3. Manual Trigger
   type: "n8n-nodes-base.manualTrigger"
   typeVersion: 1
   parameters: {}

### Data Manipulation
4. Set (Set/assign fields)
   type: "n8n-nodes-base.set"
   typeVersion: 3
   parameters: {
     "mode": "manual",
     "assignments": {
       "assignments": [
         { "id": "1", "name": "fieldName", "value": "={{ $json.someField }}", "type": "string" }
       ]
     }
   }

5. Code (Run JavaScript)
   type: "n8n-nodes-base.code"
   typeVersion: 2
   parameters: { "jsCode": "// your JS here\nreturn items;" }

6. IF (Conditional branch)
   type: "n8n-nodes-base.if"
   typeVersion: 2
   parameters: {
     "conditions": {
       "options": { "caseSensitive": true },
       "conditions": [
         { "id": "1", "leftValue": "={{ $json.status }}", "rightValue": "active", "operator": { "type": "string", "operation": "equals" } }
       ]
     }
   }

7. Merge
   type: "n8n-nodes-base.merge"
   typeVersion: 2
   parameters: { "mode": "append" }

8. Split In Batches
   type: "n8n-nodes-base.splitInBatches"
   typeVersion: 3
   parameters: { "batchSize": 10 }

### HTTP / API
9. HTTP Request
   type: "n8n-nodes-base.httpRequest"
   typeVersion: 4
   parameters: {
     "method": "GET"|"POST"|"PUT"|"DELETE"|"PATCH",
     "url": "https://api.example.com/endpoint",
     "authentication": "none"|"genericCredentialType",
     "sendHeaders": boolean,
     "headerParameters": { "parameters": [{ "name": "Content-Type", "value": "application/json" }] },
     "sendBody": boolean,
     "bodyParameters": { "parameters": [{ "name": "key", "value": "={{ $json.value }}" }] }
   }

### Google Services (require credentials set by user post-import)
10. Google Sheets
    type: "n8n-nodes-base.googleSheets"
    typeVersion: 4
    parameters: {
      "operation": "append"|"read"|"update"|"delete",
      "documentId": { "mode": "url", "value": "YOUR_SPREADSHEET_URL" },
      "sheetName": { "mode": "name", "value": "Sheet1" },
      "columns": {
        "mappingMode": "autoMapInputData",
        "value": {}
      }
    }

11. Gmail
    type: "n8n-nodes-base.gmail"
    typeVersion: 2
    parameters: {
      "operation": "send",
      "sendTo": "={{ $json.email }}",
      "subject": "Your subject here",
      "message": "Your message body",
      "options": {}
    }

12. Google Drive
    type: "n8n-nodes-base.googleDrive"
    typeVersion: 3
    parameters: { "operation": "upload"|"download"|"list", "name": "={{ $json.filename }}" }

### Communication
13. Slack
    type: "n8n-nodes-base.slack"
    typeVersion: 2
    parameters: {
      "operation": "post",
      "channel": "#general",
      "text": "={{ $json.message }}",
      "otherOptions": {}
    }

14. Send Email (SMTP)
    type: "n8n-nodes-base.emailSend"
    typeVersion: 2
    parameters: {
      "toEmail": "={{ $json.email }}",
      "subject": "Subject here",
      "emailType": "text",
      "message": "Email body here"
    }

### Database / Storage
15. Airtable
    type: "n8n-nodes-base.airtable"
    typeVersion: 2
    parameters: {
      "operation": "create"|"read"|"update"|"delete"|"list",
      "base": { "mode": "url", "value": "YOUR_AIRTABLE_BASE_URL" },
      "table": { "mode": "name", "value": "TableName" }
    }

16. Postgres
    type: "n8n-nodes-base.postgres"
    typeVersion: 2
    parameters: {
      "operation": "executeQuery"|"insert"|"update"|"delete",
      "query": "SELECT * FROM table WHERE id = $1"
    }

17. MySQL
    type: "n8n-nodes-base.mySql"
    typeVersion: 2
    parameters: { "operation": "executeQuery", "query": "SELECT * FROM table" }

18. Redis
    type: "n8n-nodes-base.redis"
    typeVersion: 1
    parameters: { "operation": "get"|"set"|"delete", "key": "={{ $json.id }}" }

### Utilities
19. Wait
    type: "n8n-nodes-base.wait"
    typeVersion: 1
    parameters: { "unit": "seconds", "amount": 5 }

20. Respond to Webhook
    type: "n8n-nodes-base.respondToWebhook"
    typeVersion: 1
    parameters: { "respondWith": "json", "responseBody": "={{ JSON.stringify($json) }}" }

21. No Operation (placeholder / debug)
    type: "n8n-nodes-base.noOp"
    typeVersion: 1
    parameters: {}

## EXPRESSION SYNTAX
Use n8n expressions wrapped in ={{ ... }}:
- Current item data:    ={{ $json.fieldName }}
- Node output:         ={{ $node["NodeName"].json.field }}
- Date/time:           ={{ $now.toISO() }}
- Input all items:     ={{ $input.all() }}

## LAYOUT RULES
- Start trigger node at position [250, 300].
- Increment x by 250 for each subsequent node in the main flow.
- Branch nodes (IF true/false) should offset y by ±150.

## SETTINGS OBJECT (always include)
"settings": {
  "executionOrder": "v1",
  "saveManualExecutions": true,
  "callerPolicy": "workflowsFromSameOwner",
  "errorWorkflow": ""
}

## QUALITY RULES
1. Every node referenced in "connections" must exist in "nodes".
2. Trigger nodes must never appear as a connection target.
3. Always end a webhook-triggered workflow with a "Respond to Webhook" node OR a "No Operation" node if no response is needed.
4. Use realistic placeholder values (e.g., actual cron expressions, sensible field names).
5. Include at least a Set node to normalize/map data when the input structure might vary.
6. If the user mentions "format" or "transform", always include a Set or Code node.
7. Generate a valid UUIDv4 for the workflow "id" field.

Now produce the JSON.`;

// ─── Request validation ───────────────────────────────────────────────────────
function validatePrompt(prompt: unknown): string {
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    throw new Error("Prompt must be a non-empty string.");
  }
  if (prompt.length > 1000) {
    throw new Error("Prompt must be 1000 characters or fewer.");
  }
  return prompt.trim();
}

// ─── n8n JSON validation ─────────────────────────────────────────────────────
function validateN8nWorkflow(obj: unknown): void {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    throw new Error("LLM did not return a valid JSON object.");
  }

  const workflow = obj as Record<string, unknown>;
  const requiredKeys = ["name", "nodes", "connections", "active", "settings"];

  for (const key of requiredKeys) {
    if (!(key in workflow)) {
      throw new Error(`Generated workflow is missing required key: "${key}".`);
    }
  }

  if (!Array.isArray(workflow.nodes)) {
    throw new Error("Workflow 'nodes' must be an array.");
  }

  if (workflow.nodes.length === 0) {
    throw new Error("Workflow must contain at least one node.");
  }

  if (typeof workflow.connections !== "object" || workflow.connections === null) {
    throw new Error("Workflow 'connections' must be an object.");
  }
}

// ─── Route Handler ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // 1. Parse and validate request body
  let userPrompt: string;
  try {
    const body = await req.json();
    userPrompt = validatePrompt(body?.prompt);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request body." },
      { status: 400 }
    );
  }

  // 2. Call OpenAI
  let rawContent: string;
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      temperature: 0.2, // Low temperature = more deterministic, schema-faithful output
      max_tokens: 4096,
      messages: [
        {
          role: "system",
          content: N8N_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `Generate an n8n workflow for the following requirement:\n\n${userPrompt}`,
        },
      ],
    });

    rawContent = completion.choices[0]?.message?.content ?? "";

    if (!rawContent) {
      throw new Error("OpenAI returned an empty response.");
    }
  } catch (err: unknown) {
    console.error("[OpenAI Error]", err);
    const message =
      err instanceof Error ? err.message : "Failed to call OpenAI API.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // 3. Parse and validate the generated JSON
  let workflow: unknown;
  try {
    workflow = JSON.parse(rawContent);
    validateN8nWorkflow(workflow);
  } catch (err: unknown) {
    console.error("[Validation Error] Raw content:", rawContent);
    const message =
      err instanceof Error
        ? err.message
        : "Generated output is not valid n8n JSON.";
    return NextResponse.json({ error: `Validation failed: ${message}` }, { status: 422 });
  }

  // 4. Return the validated workflow
  return NextResponse.json({ workflow }, { status: 200 });
}
