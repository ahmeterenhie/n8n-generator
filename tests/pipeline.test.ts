import { describe, expect, it } from "vitest";
import { LlmError } from "@/lib/llm";
import { generateWorkflow } from "@/lib/pipeline";

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
  nodes: [
    { type: "n8n-nodes-base.webhook" },
    { type: "n8n-nodes-base.slack", resource: "message", operation: "post" },
  ],
});

const workflowWith = (slackParameters: object) =>
  JSON.stringify({
    name: "Webhook → Slack",
    nodes: [
      {
        name: "Webhook",
        type: "n8n-nodes-base.webhook",
        typeVersion: 2.1,
        position: [250, 300],
        parameters: { httpMethod: "POST", path: "in" },
      },
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

const base = { provider: "gemini" as const, apiKey: "x", model: "x", request: "Webhook gelince Slack'e yaz", answers: [], lang: "tr" as const };

describe("generateWorkflow", () => {
  it("plans, generates with narrowed specs and repairs what the check finds", async () => {
    const model = scripted([PLAN, BROKEN, FIXED]);
    const result = await generateWorkflow({ ...base, complete: model.complete });

    expect(model.inputs).toHaveLength(3);
    expect(model.inputs[0]).toContain("## Available nodes");
    expect(model.inputs[1]).toContain('Showing parameters for resource "message", operation "post"');
    expect(model.inputs[2]).toContain('Parameter "channel" does not exist');
    expect(result.validation.errors).toEqual([]);
    expect(result.validation.repairRounds).toBe(1);
  });

  it("skips repair when the first draft is valid", async () => {
    const model = scripted([PLAN, FIXED]);
    const result = await generateWorkflow({ ...base, complete: model.complete });
    expect(model.inputs).toHaveLength(2);
    expect(result.validation.repairRounds).toBe(0);
  });

  it("stops after two repair rounds and keeps the best draft", async () => {
    const model = scripted([PLAN, BROKEN, BROKEN, BROKEN]);
    const result = await generateWorkflow({ ...base, complete: model.complete });
    expect(result.validation.repairRounds).toBe(2);
    expect(result.validation.errors.length).toBeGreaterThan(0);
  });

  it("falls back to candidate nodes when the plan is not usable", async () => {
    const model = scripted(["not json", FIXED]);
    const result = await generateWorkflow({ ...base, complete: model.complete });
    expect(model.inputs[1]).toContain('type "n8n-nodes-base.slack"');
    expect(result.validation.errors).toEqual([]);
  });

  it("passes provider errors through", async () => {
    const model = scripted([new LlmError("INVALID_KEY", "bad key", 401)]);
    await expect(generateWorkflow({ ...base, complete: model.complete })).rejects.toMatchObject({ code: "INVALID_KEY" });
  });

  it("includes the user's answers in plan and generation", async () => {
    const model = scripted([PLAN, FIXED]);
    await generateWorkflow({
      ...base,
      answers: [{ question: "Hangi kanal?", answer: "#alerts" }],
      complete: model.complete,
    });
    expect(model.inputs[0]).toContain("#alerts");
    expect(model.inputs[1]).toContain("#alerts");
  });
});
