import { describe, expect, it } from "vitest";
import { LlmError } from "@/lib/llm";
import { generateDirect, generateProject, planProject, refineWorkflow } from "@/lib/pipeline";
import { parsePlan } from "@/lib/plan";

// A scripted model: returns the given replies in order and records its inputs
function scripted(replies: (string | Error)[]) {
  const inputs: string[] = [];
  const complete = async (_system: string, input: string) => {
    inputs.push(input);
    const next = replies.shift();
    if (next === undefined) throw new Error("No more scripted replies");
    if (next instanceof Error) throw next;
    return next;
  };
  return { inputs, complete };
}

const PLAN = JSON.stringify({
  summary: "Post incoming data to Slack",
  workflows: [
    {
      key: "main",
      name: "Webhook → Slack",
      role: "main",
      trigger: "Webhook",
      steps: [
        { description: "Receive data", node: "n8n-nodes-base.webhook" },
        { description: "Post to Slack", node: "n8n-nodes-base.slack", resource: "message", operation: "post" },
      ],
    },
  ],
  credentials: ["Slack"],
  assumptions: ["Channel #general"],
});

const workflowWith = (slackParameters: object) =>
  JSON.stringify({
    name: "Anything",
    nodes: [
      { name: "Webhook", type: "n8n-nodes-base.webhook", typeVersion: 2.1, position: [250, 300], parameters: { httpMethod: "POST", path: "in" } },
      { name: "Slack", type: "n8n-nodes-base.slack", typeVersion: 2.4, position: [500, 300], parameters: slackParameters },
    ],
    connections: { Webhook: { main: [[{ node: "Slack", type: "main", index: 0 }]] } },
  });

const BROKEN = workflowWith({ operation: "post", channel: "#general", text: "hi" });
const FIXED = workflowWith({
  resource: "message",
  operation: "post",
  select: "channel",
  channelId: { __rl: true, mode: "name", value: "#general" },
  text: "={{ $json.body.text }}",
});

const base = {
  provider: "gemini" as const,
  apiKey: "x",
  model: "x",
  request: "Webhook gelince Slack'e yaz",
  answers: [{ question: "Hangi kanal?", answer: "#alerts" }],
  lang: "tr" as const,
};

describe("planProject", () => {
  it("offers node overviews and returns a checked plan", async () => {
    const model = scripted([PLAN]);
    const plan = await planProject({ ...base, complete: model.complete });
    expect(model.inputs[0]).toContain("## Available nodes");
    expect(model.inputs[0]).toContain("#alerts");
    expect(plan.workflows[0].steps[1]).toMatchObject({ node: "n8n-nodes-base.slack", operation: "post" });
  });

  it("retries once when the plan cannot be read, then fails", async () => {
    const ok = scripted(["nonsense", PLAN]);
    await expect(planProject({ ...base, complete: ok.complete })).resolves.toBeTruthy();
    const bad = scripted(["nonsense", "{}"]);
    await expect(planProject({ ...base, complete: bad.complete })).rejects.toMatchObject({ code: "UPSTREAM" });
  });

  it("sends the current plan and the feedback when revising", async () => {
    const model = scripted([PLAN]);
    await planProject({ ...base, complete: model.complete }, { plan: parsePlan(JSON.parse(PLAN)), feedback: "Telegram kullan" });
    expect(model.inputs[0]).toContain("## Requested changes");
    expect(model.inputs[0]).toContain("Telegram kullan");
    expect(model.inputs[0]).toContain("telegram"); // search picked the node the feedback mentions
  });
});

describe("generateProject", () => {
  const plan = parsePlan(JSON.parse(PLAN));

  it("generates with narrowed specs and repairs what the check finds", async () => {
    const model = scripted([BROKEN, FIXED]);
    const progress: string[] = [];
    const result = await generateProject({ ...base, complete: model.complete }, plan, (p) => progress.push(p.stage));

    expect(model.inputs[0]).toContain('Showing parameters for resource "message", operation "post"');
    expect(model.inputs[0]).toContain("#alerts");
    expect(model.inputs[1]).toContain('Parameter "channel" does not exist');
    const [built] = result.workflows;
    expect(built.validation.errors).toEqual([]);
    expect(built.validation.repairRounds).toBe(1);
    expect(built.workflow.name).toBe("Webhook → Slack"); // planned name wins
    expect(progress).toEqual(["generate", "repair"]);
  });

  it("stops after two repair rounds and keeps the best draft", async () => {
    const model = scripted([BROKEN, BROKEN, BROKEN]);
    const result = await generateProject({ ...base, complete: model.complete }, plan);
    expect(result.workflows[0].validation.repairRounds).toBe(2);
    expect(result.workflows[0].validation.errors.length).toBeGreaterThan(0);
  });

  it("builds every workflow of a split plan with the linking nodes", async () => {
    const split = parsePlan({
      summary: "System",
      workflows: [
        { key: "main", name: "Ana", role: "main", trigger: "Webhook", steps: [{ description: "Receive", node: "n8n-nodes-base.webhook" }] },
        {
          key: "check",
          name: "E-posta Kontrol",
          role: "sub",
          trigger: "Called",
          inputs: "email",
          outputs: "valid",
          steps: [{ description: "Validate", node: "n8n-nodes-base.if" }],
        },
        { key: "err", name: "Hata Bildirimi", role: "error", trigger: "Error", steps: [{ description: "Notify", node: "n8n-nodes-base.slack", resource: "message", operation: "post" }] },
      ],
    });
    const model = scripted([FIXED, FIXED, FIXED]);
    const result = await generateProject({ ...base, complete: model.complete }, split);

    expect(result.workflows.map((w) => w.role)).toEqual(["main", "sub", "error"]);
    expect(model.inputs[0]).toContain('"n8n-nodes-base.executeWorkflow"'); // main may call the sub
    expect(model.inputs[0]).toContain('"E-posta Kontrol": receives email; returns valid');
    expect(model.inputs[1]).toContain("executeWorkflowTrigger");
    expect(model.inputs[2]).toContain("errorTrigger");
    expect(model.inputs[2]).not.toContain('"n8n-nodes-base.executeWorkflow" with source');
  });

  it("passes provider errors through", async () => {
    const model = scripted([new LlmError("INVALID_KEY", "bad key", 401)]);
    await expect(generateProject({ ...base, complete: model.complete }, plan)).rejects.toMatchObject({ code: "INVALID_KEY" });
  });
});

describe("generateDirect", () => {
  it("plans and generates in one go", async () => {
    const model = scripted([PLAN, FIXED]);
    const stages: string[] = [];
    const result = await generateDirect({ ...base, complete: model.complete }, (p) => stages.push(p.stage));
    expect(stages[0]).toBe("plan");
    expect(result.workflows).toHaveLength(1);
    expect(result.workflows[0].validation.errors).toEqual([]);
  });
});

describe("refineWorkflow", () => {
  it("applies a change, keeps the name and re-checks", async () => {
    const model = scripted([FIXED]);
    const current = { ...JSON.parse(BROKEN), name: "Mevcut" };
    const result = await refineWorkflow({ ...base, complete: model.complete, workflow: current, instruction: "Mesajı Telegram'a da gönder" });
    expect(model.inputs[0]).toContain("## Requested change");
    expect(model.inputs[0]).toContain("Mesajı Telegram'a da gönder");
    expect(model.inputs[0]).toContain('type "n8n-nodes-base.telegram"');
    expect(result.workflow.name).toBe("Mevcut");
    expect(result.validation.errors).toEqual([]);
  });
});
