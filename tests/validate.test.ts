import { describe, expect, it } from "vitest";
import { demoWorkflow } from "@/lib/demoWorkflows";
import { normalizeWorkflow, validateWorkflow } from "@/lib/n8n/validate";

type Node = { name: string; type: string; typeVersion: number; parameters?: Record<string, unknown>; onError?: string };

function workflow(nodes: Node[], connections: Record<string, unknown> = {}) {
  return normalizeWorkflow({ name: "Test", nodes, connections });
}

const link = (to: string, output = 0) => {
  const main: { node: string; type: string; index: number }[][] = [];
  for (let i = 0; i <= output; i++) main.push([]);
  main[output].push({ node: to, type: "main", index: 0 });
  return { main };
};

const manual: Node = { name: "Start", type: "n8n-nodes-base.manualTrigger", typeVersion: 1, parameters: {} };

const slackPost = (parameters: Record<string, unknown>): Node => ({
  name: "Slack",
  type: "n8n-nodes-base.slack",
  typeVersion: 2.4,
  parameters,
});

const validSlack = slackPost({
  resource: "message",
  operation: "post",
  select: "channel",
  channelId: { __rl: true, mode: "name", value: "#general" },
  text: "hello",
});

describe("validateWorkflow", () => {
  it.each(["webhook slack", "reddit sheets her gün", "form airtable gmail"])("demo workflow '%s' has no errors", (prompt) => {
    for (const lang of ["tr", "en"] as const) {
      expect(validateWorkflow(normalizeWorkflow(demoWorkflow(prompt, lang))).errors).toEqual([]);
    }
  });

  it("accepts a correct Slack message node", () => {
    const result = validateWorkflow(workflow([manual, validSlack], { Start: link("Slack") }));
    expect(result.errors).toEqual([]);
  });

  it("flags parameters n8n would silently drop and missing required ones (old recipe)", () => {
    const result = validateWorkflow(
      workflow([manual, slackPost({ operation: "post", channel: "#general", text: "hi" })], { Start: link("Slack") })
    );
    const messages = result.errors.map((e) => e.message).join("\n");
    expect(messages).toContain('Parameter "channel" does not exist');
    expect(messages).toContain("select");
  });

  it("flags invalid option values", () => {
    const result = validateWorkflow(
      workflow([manual, { ...validSlack, parameters: { ...validSlack.parameters, operation: "send" } }], { Start: link("Slack") })
    );
    expect(result.errors.some((e) => e.message.includes('invalid value "send"'))).toBe(true);
  });

  it("allows expressions in option parameters", () => {
    const result = validateWorkflow(
      workflow([manual, { ...validSlack, parameters: { ...validSlack.parameters, select: "={{ 'channel' }}" } }], {
        Start: link("Slack"),
      })
    );
    expect(result.errors.filter((e) => e.message.includes("invalid value"))).toEqual([]);
  });

  it("flags unknown node types and unsupported versions", () => {
    const result = validateWorkflow(
      workflow([
        manual,
        { name: "Ghost", type: "n8n-nodes-base.doesNotExist", typeVersion: 1 },
        { ...validSlack, typeVersion: 9 },
      ])
    );
    const messages = result.errors.map((e) => e.message).join("\n");
    expect(messages).toContain('"n8n-nodes-base.doesNotExist" does not exist');
    expect(messages).toContain("typeVersion 9 is not available");
  });

  it("only warns about node types outside the core catalog", () => {
    const result = validateWorkflow(
      workflow([manual, { name: "Agent", type: "@n8n/n8n-nodes-langchain.agent", typeVersion: 1 }], { Start: link("Agent") })
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((w) => w.code === "UNVERIFIED_TYPE")).toBe(true);
  });

  it("flags broken connections and triggers used as targets", () => {
    const result = validateWorkflow(
      workflow([manual, validSlack], { Start: link("Nowhere"), Slack: link("Start"), Missing: link("Slack") })
    );
    const messages = result.errors.map((e) => e.message).join("\n");
    expect(messages).toContain('named "Nowhere" that does not exist');
    expect(messages).toContain("trigger node cannot receive input");
    expect(messages).toContain('node named "Missing" that does not exist');
  });

  it("requires responseNode mode when Respond to Webhook is used", () => {
    const hook: Node = {
      name: "Hook",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2.1,
      parameters: { httpMethod: "POST", path: "x", responseMode: "onReceived" },
    };
    const respond: Node = { name: "Reply", type: "n8n-nodes-base.respondToWebhook", typeVersion: 1.5, parameters: {} };
    const result = validateWorkflow(workflow([hook, respond], { Hook: link("Reply") }));
    expect(result.errors.some((e) => e.message.includes('"responseNode"'))).toBe(true);
  });

  it("counts the extra error output of continueErrorOutput nodes", () => {
    const risky = { ...validSlack, onError: "continueErrorOutput" };
    const notify: Node = { name: "Notify", type: "n8n-nodes-base.noOp", typeVersion: 1, parameters: {} };
    const ok = validateWorkflow(workflow([manual, risky, notify], { Start: link("Slack"), Slack: link("Notify", 1) }));
    expect(ok.errors).toEqual([]);
    const bad = validateWorkflow(workflow([manual, validSlack, notify], { Start: link("Slack"), Slack: link("Notify", 1) }));
    expect(bad.errors.some((e) => e.message.includes("only 1 output"))).toBe(true);
  });

  it("treats placeholders and pick-from-list fields as things for the user, not errors", () => {
    const sheet: Node = {
      name: "Sheet",
      type: "n8n-nodes-base.googleSheets",
      typeVersion: 4.7,
      parameters: {
        resource: "sheet",
        operation: "append",
        documentId: { __rl: true, mode: "url", value: "YOUR_SPREADSHEET_URL" },
        sheetName: { __rl: true, mode: "list", value: "" },
        columns: { mappingMode: "autoMapInputData", value: {}, matchingColumns: [], schema: [] },
      },
    };
    const result = validateWorkflow(workflow([manual, sheet], { Start: link("Sheet") }));
    expect(result.errors).toEqual([]);
    expect(result.warnings.filter((w) => w.code === "FILL_IN").map((w) => w.param)).toEqual(
      expect.arrayContaining(["documentId", "sheetName"])
    );
  });

  it("warns about missing triggers and disconnected nodes", () => {
    const result = validateWorkflow(workflow([validSlack, { name: "Idle", type: "n8n-nodes-base.noOp", typeVersion: 1 }]));
    expect(result.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(["NO_TRIGGER", "DISCONNECTED"]));
  });

  it("flags duplicate node names", () => {
    const result = validateWorkflow(workflow([manual, validSlack, { ...validSlack }]));
    expect(result.errors.some((e) => e.message.includes("share this name"))).toBe(true);
  });
});

describe("normalizeWorkflow", () => {
  it("fills ids, positions, parameters and settings", () => {
    const wf = normalizeWorkflow({ nodes: [{ name: "A", type: "n8n-nodes-base.noOp", typeVersion: 1 }] }) as {
      name: string;
      nodes: { id: string; position: number[]; parameters: object }[];
      settings: { executionOrder: string };
      active: boolean;
    };
    expect(wf.nodes[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(wf.nodes[0].position).toEqual([250, 300]);
    expect(wf.nodes[0].parameters).toEqual({});
    expect(wf.settings.executionOrder).toBe("v1");
    expect(wf.active).toBe(false);
    expect(wf.name).toBe("Generated workflow");
  });
});
