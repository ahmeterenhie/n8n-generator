import { describe, expect, it } from "vitest";
import { coreNodes, findNodeType, renderNodeOverview, renderNodeSpec, searchNodes } from "@/lib/n8n/catalog";

const names = (text: string) => searchNodes(text).map((n) => n.name);

describe("node catalog", () => {
  it("loads the official catalog with its core nodes", () => {
    expect(findNodeType("n8n-nodes-base.slack")?.defaultVersion).toBeGreaterThanOrEqual(2);
    expect(coreNodes().length).toBeGreaterThanOrEqual(18);
  });

  it("finds services from Turkish and English requests", () => {
    expect(names("Her gün Reddit'ten çek ve Google E-Tablolar'a kaydet")).toEqual(expect.arrayContaining(["reddit", "googleSheets"]));
    expect(names("Form gelince Airtable'a ekle ve Gmail ile e-posta gönder")).toEqual(expect.arrayContaining(["airtable", "gmail"]));
    expect(names("Send a Slack message")).toContain("slack");
    expect(names("Yeni siparişte Telegram'a bildirim")).toContain("telegram");
  });

  it("does not return core nodes as search results", () => {
    expect(names("webhook schedule http request code")).not.toEqual(expect.arrayContaining(["webhook", "code"]));
  });

  it("summarises resources and operations", () => {
    const overview = renderNodeOverview(findNodeType("n8n-nodes-base.slack")!);
    expect(overview).toContain('resource "message": operations');
    expect(overview).toContain("post");
  });

  it("narrows a spec to the chosen resource and operation", () => {
    const slack = findNodeType("n8n-nodes-base.slack")!;
    const full = renderNodeSpec(slack);
    const narrowed = renderNodeSpec(slack, { resource: "message", operation: "post" });
    expect(narrowed.length).toBeLessThan(full.length);
    expect(narrowed).toContain("- select (options, required)");
    expect(narrowed).toContain(`typeVersion ${slack.defaultVersion}`);
    expect(narrowed).not.toContain("channelVisibility");
  });
});
