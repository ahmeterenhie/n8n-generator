import { describe, expect, it } from "vitest";
import { parseQuestions, sanitizeAnswers } from "@/lib/clarify";
import { buildSetupPrompt } from "@/lib/setupPrompt";
import { layoutWorkflow } from "@/lib/workflowLayout";

describe("clarifying questions", () => {
  it("keeps well-formed questions and caps options", () => {
    const questions = parseQuestions({
      questions: [
        { id: "a", question: "Ne zaman?", options: ["1", "2", "3", "4", "5", 6] },
        { question: "  Nereye?  " },
        { question: "" },
        { nope: true },
      ],
    });
    expect(questions).toEqual([
      { id: "a", question: "Ne zaman?", options: ["1", "2", "3", "4"] },
      { id: "q2", question: "Nereye?", options: [] },
    ]);
  });

  it("rejects responses without questions", () => {
    expect(() => parseQuestions({})).toThrow();
    expect(() => parseQuestions({ questions: [] })).toThrow();
  });

  it("drops empty answers and limits size", () => {
    const answers = sanitizeAnswers([
      { question: "A", answer: "yes" },
      { question: "B", answer: "   " },
      { question: "C", answer: "x".repeat(900) },
      "junk",
    ]);
    expect(answers.map((a) => a.question)).toEqual(["A", "C"]);
    expect(answers[1].answer).toHaveLength(500);
  });
});

describe("setup prompt", () => {
  const workflow = {
    name: "Demo",
    nodes: [
      { name: "Sheet", type: "n8n-nodes-base.googleSheets", parameters: { documentId: { value: "YOUR_SPREADSHEET_URL" } } },
    ],
  };

  it("lists nodes, placeholders, answers and open issues", () => {
    const prompt = buildSetupPrompt({
      workflow,
      request: "Tabloya yaz",
      answers: [{ question: "Hangi sayfa?", answer: "Sayfa1" }],
      lang: "tr",
      openIssues: [{ node: "Sheet", message: "Something is off" }],
    });
    expect(prompt).toContain("- Sheet (googleSheets)");
    expect(prompt).toContain("YOUR_SPREADSHEET_URL → Sheet");
    expect(prompt).toContain("Hangi sayfa? → Sayfa1");
    expect(prompt).toContain("Sheet: Something is off");
    expect(prompt).toContain("Bana Türkçe cevap ver.");
  });

  it("writes the English version", () => {
    const prompt = buildSetupPrompt({ workflow, request: "Write to a sheet", answers: [], lang: "en" });
    expect(prompt).toContain("The attached JSON file is an n8n workflow");
    expect(prompt).not.toContain("unresolved issues");
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
