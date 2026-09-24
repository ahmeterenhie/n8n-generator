import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { linkWorkflows, parseConnection, summarizeExecution, toN8nPayload, type PushItem } from "@/lib/n8n/remote";
import { deleteProject, getProject, listProjects, saveProject } from "@/lib/projects";

describe("n8n connection", () => {
  it("accepts the editor URL people paste", () => {
    expect(parseConnection({ baseUrl: "https://n8n.example.com/home/workflows", apiKey: "k" }).baseUrl).toBe("https://n8n.example.com");
    expect(parseConnection({ baseUrl: "http://localhost:5678/api/v1/", apiKey: "k" }).baseUrl).toBe("http://localhost:5678");
    expect(parseConnection({ baseUrl: "https://x.io/n8n/workflow/abc", apiKey: "k" }).baseUrl).toBe("https://x.io/n8n");
  });

  it("rejects bad addresses and missing keys", () => {
    expect(() => parseConnection({ baseUrl: "not a url", apiKey: "k" })).toThrow(expect.objectContaining({ code: "N8N_INVALID_URL" }));
    expect(() => parseConnection({ baseUrl: "ftp://x.io", apiKey: "k" })).toThrow(expect.objectContaining({ code: "N8N_INVALID_URL" }));
    expect(() => parseConnection({ baseUrl: "https://x.io", apiKey: " " })).toThrow(expect.objectContaining({ code: "N8N_UNAUTHORIZED" }));
  });
});

describe("toN8nPayload", () => {
  it("keeps only fields n8n accepts and gives webhooks a webhookId", () => {
    const payload = toN8nPayload({
      id: "local",
      name: "W",
      active: true,
      meta: { x: 1 },
      nodes: [
        { id: "1", name: "Hook", type: "n8n-nodes-base.webhook", typeVersion: 2.1, position: [0, 0], parameters: {}, extra: "drop" },
        { id: "2", name: "Code", type: "n8n-nodes-base.code", typeVersion: 2, position: [1, 0], parameters: {} },
      ],
      connections: {},
      settings: { executionOrder: "v1", saveManualExecutions: true, unknownSetting: 1 },
    });
    expect(Object.keys(payload).sort()).toEqual(["connections", "name", "nodes", "settings"]);
    const nodes = payload.nodes as Record<string, unknown>[];
    expect(nodes[0]).not.toHaveProperty("extra");
    expect(nodes[0].webhookId).toMatch(/^[0-9a-f-]{36}$/);
    expect(nodes[1]).not.toHaveProperty("webhookId");
    expect(payload.settings).toEqual({ executionOrder: "v1", saveManualExecutions: true });
  });
});

describe("linkWorkflows", () => {
  const callSub = (name: string) => ({
    name: "Call",
    type: "n8n-nodes-base.executeWorkflow",
    parameters: { source: "database", workflowId: { __rl: true, mode: "list", value: "", cachedResultName: name } },
  });
  const items: PushItem[] = [
    { key: "main", name: "Main", role: "main", workflow: { nodes: [callSub("Check")], settings: { executionOrder: "v1" } } },
    { key: "sub", name: "Check", role: "sub", workflow: { nodes: [], settings: {} } },
    { key: "err", name: "Errors", role: "error", workflow: { nodes: [], settings: {} } },
  ];

  it("fills sub-workflow ids by name and sets the error workflow", () => {
    const linked = linkWorkflows(items, { main: "M1", sub: "S1", err: "E1" });
    const node = (linked.main.nodes as { parameters: { workflowId: { value: string } } }[])[0];
    expect(node.parameters.workflowId.value).toBe("S1");
    expect(linked.main.settings).toMatchObject({ errorWorkflow: "E1", executionOrder: "v1" });
    expect(linked.sub.settings).toMatchObject({ errorWorkflow: "E1" });
    expect(linked.err.settings).not.toHaveProperty("errorWorkflow");
    // the input is not modified
    expect((items[0].workflow.nodes as { parameters: { workflowId: { value: string } } }[])[0].parameters.workflowId.value).toBe("");
  });

  it("leaves references to unknown sub-workflows alone when there are several", () => {
    const many: PushItem[] = [
      { key: "main", name: "Main", role: "main", workflow: { nodes: [callSub("Missing")] } },
      { key: "a", name: "A", role: "sub", workflow: { nodes: [] } },
      { key: "b", name: "B", role: "sub", workflow: { nodes: [] } },
    ];
    const linked = linkWorkflows(many, { main: "M", a: "A1", b: "B1" });
    expect((linked.main.nodes as { parameters: { workflowId: { value: string } } }[])[0].parameters.workflowId.value).toBe("");
  });
});

describe("summarizeExecution", () => {
  it("reads the run-level error with its node", () => {
    const s = summarizeExecution({
      id: 11,
      status: "error",
      mode: "webhook",
      data: { resultData: { error: { message: "total missing [line 2]", node: { name: "Calc" } }, lastNodeExecuted: "Calc" } },
    });
    expect(s).toMatchObject({ id: "11", status: "error", error: { message: "total missing [line 2]", node: "Calc" } });
  });

  it("falls back to the last node's error, and has none for successful runs", () => {
    const fallback = summarizeExecution({
      id: 2,
      status: "error",
      data: { resultData: { lastNodeExecuted: "Http", runData: { Http: [{ error: { message: "404", description: "Not found" } }] } } },
    });
    expect(fallback.error).toEqual({ message: "404", description: "Not found", node: "Http" });
    expect(summarizeExecution({ id: 3, status: "success", data: { resultData: {} } }).error).toBeUndefined();
  });
});

describe("project history", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "forge-projects-"));
    process.env.PROJECTS_DIR = dir;
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PROJECTS_DIR;
  });

  const sample = {
    request: "Test",
    answers: [{ question: "Q", answer: "A" }, { nope: 1 }],
    workflows: [
      {
        key: "main",
        name: "W",
        role: "main",
        workflow: { nodes: [] },
        validation: { errors: [{ message: "x" }] },
        remote: { id: "R1", url: "http://n8n/workflow/R1", pushedAt: "2026-01-01" },
      },
    ],
    apiKey: "must-not-be-saved",
  };

  it("saves, lists, updates and deletes without keeping unknown fields", async () => {
    const saved = await saveProject(sample);
    expect(saved.id).toMatch(/^\d{4}-\d{2}-\d{2}-[0-9a-f]{12}$/);
    expect(JSON.stringify(await getProject(saved.id))).not.toContain("must-not-be-saved");
    expect((await getProject(saved.id))?.answers).toEqual([{ question: "Q", answer: "A" }]);

    const updated = await saveProject({ ...sample, request: "Changed" }, saved.id);
    expect(updated.createdAt).toBe(saved.createdAt);

    const list = await listProjects();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ request: "Changed", workflows: [{ name: "W", errors: 1, pushed: true }] });

    await deleteProject(saved.id);
    expect(await listProjects()).toEqual([]);
  });

  it("refuses ids that could leave the projects folder", async () => {
    await expect(deleteProject("../secrets")).rejects.toThrow();
    expect(await getProject("../../etc/passwd")).toBeNull();
  });
});
