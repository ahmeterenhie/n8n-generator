import { describe, expect, it } from "vitest";
import { clarifyInput, demoQuestions, parseClarify, sanitizeAnswers, sanitizeHistory } from "@/lib/clarify";
import { demoPlan } from "@/lib/demoWorkflows";
import { formatPlan, parsePlan } from "@/lib/plan";
import { buildSetupPrompt } from "@/lib/setupPrompt";
import { layoutWorkflow } from "@/lib/workflowLayout";

describe("clarifying questions", () => {
  it("keeps well-formed questions and caps options", () => {
    const result = parseClarify({
      questions: [
        { id: "a", question: "Ne zaman?", options: ["1", "2", "3", "4", "5", 6] },
        { question: "  Nereye?  " },
        { question: "" },
        { nope: true },
      ],
    });
    expect(result).toEqual({
      done: false,
      questions: [
        { id: "a", question: "Ne zaman?", options: ["1", "2", "3", "4"] },
        { id: "q2", question: "Nereye?", options: [] },
      ],
    });
  });

  it("treats done or an empty list as finished", () => {
    expect(parseClarify({ done: true, questions: [{ question: "x" }] })).toEqual({ done: true, questions: [] });
    expect(parseClarify({ questions: [] }).done).toBe(true);
    expect(() => parseClarify({})).toThrow();
  });

  it("shows earlier answers, marks skipped ones and flags the last round", () => {
    const input = clarifyInput("İstek", [{ question: "A?", answer: "" }, { question: "B?", answer: "evet" }], 3);
    expect(input).toContain("A: (skipped)");
    expect(input).toContain("A: evet");
    expect(input).toContain("This is the last round");
  });

  it("keeps skipped questions in history but not in answers", () => {
    const raw = [
      { question: "A", answer: "yes" },
      { question: "B", answer: "   " },
      { question: "C", answer: "x".repeat(900) },
      "junk",
    ];
    expect(sanitizeAnswers(raw).map((a) => a.question)).toEqual(["A", "C"]);
    expect(sanitizeAnswers(raw)[1].answer).toHaveLength(500);
    expect(sanitizeHistory(raw).map((a) => a.question)).toEqual(["A", "B", "C"]);
  });

  it("demo asks one round", () => {
    expect(demoQuestions("tr", 1).questions.length).toBeGreaterThan(0);
    expect(demoQuestions("tr", 2)).toEqual({ done: true, questions: [] });
  });
});

describe("plan", () => {
  it("drops unknown node types but keeps the step, and fixes keys and roles", () => {
    const plan = parsePlan({
      summary: "S",
      workflows: [
        { key: "a", name: "A", role: "main", steps: [{ description: "Real", node: "n8n-nodes-base.slack", operation: "post" }, { description: "Made up", node: "n8n-nodes-base.nope", operation: "x" }] },
        { key: "a", name: "B", role: "weird", steps: [{ description: "Step" }] },
        { key: "c", name: "Empty", role: "sub", steps: [] },
      ],
      credentials: ["Slack", 3],
    });
    expect(plan.workflows.map((w) => w.key)).toEqual(["a", "a_2"]);
    expect(plan.workflows[1].role).toBe("main");
    expect(plan.workflows[0].steps[1]).toMatchObject({ description: "Made up", node: undefined, operation: undefined });
    expect(plan.credentials).toEqual(["Slack"]);
  });

  it("requires a main workflow with steps", () => {
    expect(() => parsePlan({ workflows: [{ role: "sub", steps: [{ description: "x" }] }] })).toThrow();
    expect(() => parsePlan({})).toThrow();
  });

  it("formats a readable plan", () => {
    const text = formatPlan(parsePlan({ summary: "S", workflows: [{ name: "A", steps: [{ description: "Go", node: "n8n-nodes-base.slack", resource: "message", operation: "post" }] }], assumptions: ["x"] }));
    expect(text).toContain('Workflow "A"');
    expect(text).toContain("1. Go [n8n-nodes-base.slack resource=message operation=post]");
    expect(text).toContain("- x");
  });

  it("demo plans match the demo workflows and pass the plan check", () => {
    const plan = parsePlan(demoPlan("form airtable gmail", "tr"));
    expect(plan.workflows[0].steps.some((s) => s.node === "n8n-nodes-base.airtable")).toBe(true);
    expect(plan.credentials).toEqual(expect.arrayContaining(["Airtable", "Gmail"]));
  });
});

describe("setup prompt", () => {
  const sheetWorkflow = {
    name: "Demo",
    nodes: [
      { name: "Sheet", type: "n8n-nodes-base.googleSheets", parameters: { documentId: { value: "YOUR_SPREADSHEET_URL" } } },
    ],
  };

  it("lists nodes, placeholders, answers and open issues", () => {
    const prompt = buildSetupPrompt({
      workflows: [{ name: "Demo", role: "main", workflow: sheetWorkflow, openIssues: [{ node: "Sheet", message: "Something is off" }] }],
      request: "Tabloya yaz",
      answers: [{ question: "Hangi sayfa?", answer: "Sayfa1" }, { question: "Atlandı mı?", answer: "" }],
      lang: "tr",
    });
    expect(prompt).toContain("- Sheet (googleSheets)");
    expect(prompt).toContain("YOUR_SPREADSHEET_URL → Sheet");
    expect(prompt).toContain("Hangi sayfa? → Sayfa1");
    expect(prompt).not.toContain("Atlandı mı?");
    expect(prompt).toContain("Sheet: Something is off");
    expect(prompt).toContain("Bana Türkçe cevap ver.");
    expect(prompt).not.toContain("Execute Sub-workflow");
  });

  it("explains import order and linking for several workflows", () => {
    const prompt = buildSetupPrompt({
      workflows: [
        { name: "Ana", role: "main", workflow: sheetWorkflow },
        { name: "Alt", role: "sub", workflow: { nodes: [] } },
      ],
      request: "Sistem",
      answers: [],
      lang: "en",
    });
    expect(prompt).toContain("2 JSON files");
    expect(prompt).toContain('Workflow "Alt" (sub-workflow)');
    expect(prompt).toContain("Execute Sub-workflow");
    expect(prompt).toContain("YOUR_SPREADSHEET_URL → Ana: Sheet");
  });
});

describe("diagram layout", () => {
  it("places nodes in columns by connection depth and marks loops", () => {
    const layout = layoutWorkflow({
      nodes: [
        { name: "Start", type: "n8n-nodes-base.manualTrigger" },
        { name: "Loop", type: "n8n-nodes-base.splitInBatches" },
        { name: "Work", type: "n8n-nodes-base.code" },
      ],
      connections: {
        Start: { main: [[{ node: "Loop" }]] },
        Loop: { main: [[], [{ node: "Work" }]] },
        Work: { main: [[{ node: "Loop" }]] },
      },
    });
    const x = Object.fromEntries(layout.nodes.map((n) => [n.node.name, n.x]));
    expect(x.Start).toBeLessThan(x.Loop);
    expect(x.Loop).toBeLessThan(x.Work);
    expect(layout.edges.find((e) => e.from === "Work")?.back).toBe(true);
    expect(layout.nodes.find((n) => n.node.name === "Loop")?.outputs).toBe(2);
  });

  it("reports connections to missing nodes", () => {
    const layout = layoutWorkflow({
      nodes: [{ name: "A", type: "n8n-nodes-base.noOp" }],
      connections: { A: { main: [[{ node: "Ghost" }]] } },
    });
    expect(layout.missing).toEqual(["Ghost"]);
  });
});
