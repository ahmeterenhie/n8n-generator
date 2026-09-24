import type { Lang } from "@/lib/dictionaries";
import type { Plan } from "@/lib/plan";

// Sample workflows for demo mode (no API key). One per example prompt on the
// generator page; the prompt's keywords pick which one is shown.

type Names = Record<Lang, string>;

const SETTINGS = {
  executionOrder: "v1",
  saveManualExecutions: true,
  callerPolicy: "workflowsFromSameOwner",
  errorWorkflow: "",
};

function wire(pairs: [string, string, number?][]) {
  const connections: Record<string, { main: { node: string; type: "main"; index: 0 }[][] }> = {};
  for (const [from, to, output = 0] of pairs) {
    const main = (connections[from] ??= { main: [] }).main;
    while (main.length <= output) main.push([]);
    main[output].push({ node: to, type: "main", index: 0 });
  }
  return connections;
}

function webhookToSlack(lang: Lang) {
  const n = {
    trigger: { tr: "Webhook Tetikleyici", en: "Webhook Trigger" },
    parse: { tr: "Veriyi Ayrıştır", en: "Parse Body" },
    slack: { tr: "Slack'e Gönder", en: "Send to Slack" },
    respond: { tr: "Yanıt Döndür", en: "Respond to Webhook" },
  } satisfies Record<string, Names>;
  const name = (k: keyof typeof n) => n[k][lang];
  return {
    id: "8f2b6c1e-4a7d-4b8e-9c3f-1d2e3f4a5b6c",
    name: lang === "tr" ? "Webhook → Slack mesajı" : "Webhook → Slack message",
    active: false,
    settings: SETTINGS,
    nodes: [
      {
        id: "webhook-1",
        name: name("trigger"),
        type: "n8n-nodes-base.webhook",
        typeVersion: 2.1,
        position: [250, 300],
        parameters: { httpMethod: "POST", path: "incoming-data", responseMode: "responseNode", options: {} },
      },
      {
        id: "set-1",
        name: name("parse"),
        type: "n8n-nodes-base.set",
        typeVersion: 3.4,
        position: [500, 300],
        parameters: {
          mode: "manual",
          assignments: {
            assignments: [
              { id: "1", name: "title", value: "={{ $json.body.title }}", type: "string" },
              { id: "2", name: "message", value: "={{ $json.body.message }}", type: "string" },
            ],
          },
          options: {},
        },
      },
      {
        id: "slack-1",
        name: name("slack"),
        type: "n8n-nodes-base.slack",
        typeVersion: 2.4,
        position: [750, 300],
        parameters: {
          resource: "message",
          operation: "post",
          select: "channel",
          channelId: { __rl: true, mode: "name", value: "#general" },
          messageType: "text",
          text: "=*{{ $json.title }}*\n{{ $json.message }}",
          otherOptions: {},
        },
      },
      {
        id: "respond-1",
        name: name("respond"),
        type: "n8n-nodes-base.respondToWebhook",
        typeVersion: 1.5,
        position: [1000, 300],
        parameters: { respondWith: "json", responseBody: '={{ JSON.stringify({ ok: true }) }}' },
      },
    ],
    connections: wire([
      [name("trigger"), name("parse")],
      [name("parse"), name("slack")],
      [name("slack"), name("respond")],
    ]),
  };
}

function redditToSheets(lang: Lang) {
  const n = {
    schedule: { tr: "Her Gün 09:00", en: "Every Day 09:00" },
    fetch: { tr: "Reddit'ten Çek", en: "Fetch Reddit Posts" },
    titles: { tr: "Başlıkları Ayıkla", en: "Extract Titles" },
    sheets: { tr: "Google Sheets'e Kaydet", en: "Save to Google Sheets" },
  } satisfies Record<string, Names>;
  const name = (k: keyof typeof n) => n[k][lang];
  return {
    id: "3c9d2e7f-1b4a-4c6d-8e2f-7a8b9c0d1e2f",
    name: lang === "tr" ? "Reddit popüler gönderiler → Google Sheets" : "Reddit top posts → Google Sheets",
    active: false,
    settings: SETTINGS,
    nodes: [
      {
        id: "schedule-1",
        name: name("schedule"),
        type: "n8n-nodes-base.scheduleTrigger",
        typeVersion: 1.3,
        position: [250, 300],
        parameters: { rule: { interval: [{ field: "cronExpression", expression: "0 9 * * *" }] } },
      },
      {
        id: "http-1",
        name: name("fetch"),
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.4,
        position: [500, 300],
        parameters: {
          method: "GET",
          url: "https://www.reddit.com/r/n8n/top.json?limit=10&t=day",
          authentication: "none",
          sendHeaders: true,
          headerParameters: { parameters: [{ name: "User-Agent", value: "n8n-forge-demo" }] },
          sendBody: false,
        },
      },
      {
        id: "code-1",
        name: name("titles"),
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [750, 300],
        parameters: {
          jsCode:
            "const posts = $input.first().json.data.children;\nreturn posts.map(p => ({ json: { title: p.data.title, score: p.data.score, url: 'https://reddit.com' + p.data.permalink, date: $now.toISODate() } }));",
        },
      },
      {
        id: "sheets-1",
        name: name("sheets"),
        type: "n8n-nodes-base.googleSheets",
        typeVersion: 4.7,
        position: [1000, 300],
        parameters: {
          resource: "sheet",
          operation: "append",
          documentId: { __rl: true, mode: "url", value: "YOUR_SPREADSHEET_URL" },
          sheetName: { __rl: true, mode: "name", value: "Sheet1" },
          columns: { mappingMode: "autoMapInputData", value: {}, matchingColumns: [], schema: [] },
          options: {},
        },
      },
    ],
    connections: wire([
      [name("schedule"), name("fetch")],
      [name("fetch"), name("titles")],
      [name("titles"), name("sheets")],
    ]),
  };
}

function formToAirtable(lang: Lang) {
  const n = {
    trigger: { tr: "Form Webhook", en: "Form Webhook" },
    normalize: { tr: "Alanları Düzenle", en: "Normalize Fields" },
    check: { tr: "E-posta Geçerli mi?", en: "Email Valid?" },
    airtable: { tr: "Airtable'a Ekle", en: "Add to Airtable" },
    gmail: { tr: "Onay E-postası Gönder", en: "Send Confirmation" },
    ok: { tr: "Başarılı Yanıt", en: "Respond OK" },
    fail: { tr: "Hata Yanıtı", en: "Respond Error" },
  } satisfies Record<string, Names>;
  const name = (k: keyof typeof n) => n[k][lang];
  const subject = lang === "tr" ? "Kaydınız alındı" : "We received your submission";
  const body =
    lang === "tr"
      ? "=Merhaba {{ $json.name }},\n\nFormunuz bize ulaştı. Teşekkürler!"
      : "=Hi {{ $json.name }},\n\nWe received your form. Thank you!";
  return {
    id: "5e1f3a2b-6c7d-4e8f-9a0b-2c3d4e5f6a7b",
    name: lang === "tr" ? "Form → Airtable + Gmail onayı" : "Form → Airtable + Gmail confirmation",
    active: false,
    settings: SETTINGS,
    nodes: [
      {
        id: "webhook-1",
        name: name("trigger"),
        type: "n8n-nodes-base.webhook",
        typeVersion: 2.1,
        position: [250, 300],
        parameters: { httpMethod: "POST", path: "contact-form", responseMode: "responseNode", options: {} },
      },
      {
        id: "set-1",
        name: name("normalize"),
        type: "n8n-nodes-base.set",
        typeVersion: 3.4,
        position: [500, 300],
        parameters: {
          mode: "manual",
          assignments: {
            assignments: [
              { id: "1", name: "name", value: "={{ $json.body.name }}", type: "string" },
              { id: "2", name: "email", value: "={{ $json.body.email.trim().toLowerCase() }}", type: "string" },
            ],
          },
          options: {},
        },
      },
      {
        id: "if-1",
        name: name("check"),
        type: "n8n-nodes-base.if",
        typeVersion: 2.3,
        position: [750, 300],
        parameters: {
          conditions: {
            options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 3 },
            combinator: "and",
            conditions: [
              {
                id: "1",
                leftValue: "={{ $json.email }}",
                rightValue: "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$",
                operator: { type: "string", operation: "regex" },
              },
            ],
          },
          options: {},
        },
      },
      {
        id: "airtable-1",
        name: name("airtable"),
        type: "n8n-nodes-base.airtable",
        typeVersion: 2.2,
        position: [1000, 150],
        parameters: {
          resource: "record",
          operation: "create",
          base: { __rl: true, mode: "url", value: "YOUR_AIRTABLE_BASE_URL" },
          table: { __rl: true, mode: "url", value: "YOUR_AIRTABLE_TABLE_URL" },
          columns: { mappingMode: "autoMapInputData", value: {}, matchingColumns: [], schema: [] },
          options: {},
        },
      },
      {
        id: "gmail-1",
        name: name("gmail"),
        type: "n8n-nodes-base.gmail",
        typeVersion: 2.2,
        position: [1250, 150],
        parameters: {
          resource: "message",
          operation: "send",
          emailType: "text",
          sendTo: `={{ $node["${name("normalize")}"].json.email }}`,
          subject,
          message: body,
          options: {},
        },
      },
      {
        id: "respond-ok",
        name: name("ok"),
        type: "n8n-nodes-base.respondToWebhook",
        typeVersion: 1.5,
        position: [1500, 150],
        parameters: { respondWith: "json", responseBody: '={{ JSON.stringify({ ok: true }) }}' },
      },
      {
        id: "respond-fail",
        name: name("fail"),
        type: "n8n-nodes-base.respondToWebhook",
        typeVersion: 1.5,
        position: [1000, 450],
        parameters: {
          respondWith: "json",
          responseBody: '={{ JSON.stringify({ ok: false, error: "invalid email" }) }}',
        },
      },
    ],
    connections: wire([
      [name("trigger"), name("normalize")],
      [name("normalize"), name("check")],
      [name("check"), name("airtable"), 0],
      [name("check"), name("fail"), 1],
      [name("airtable"), name("gmail")],
      [name("gmail"), name("ok")],
    ]),
  };
}

/** Picks the sample that best matches the prompt's keywords. */
export function demoWorkflow(prompt: string, lang: Lang) {
  const p = prompt.toLocaleLowerCase(lang === "tr" ? "tr" : "en");
  if (/airtable|form|gmail|e-?posta|email|mail/.test(p)) return formToAirtable(lang);
  if (/reddit|sheets|tablo|her gün|every day|daily|günlük|schedule|zamanla|cron|\b9/.test(p)) return redditToSheets(lang);
  return webhookToSlack(lang);
}

const DEMO_SERVICES: Record<string, string> = {
  slack: "Slack",
  googleSheets: "Google Sheets",
  airtable: "Airtable",
  gmail: "Gmail",
};

/** A reviewable plan for demo mode, built from the matching sample workflow. */
export function demoPlan(prompt: string, lang: Lang): Plan {
  const wf = demoWorkflow(prompt, lang);
  const types = wf.nodes.map((n) => n.type.replace("n8n-nodes-base.", ""));
  return {
    summary:
      lang === "tr"
        ? `Demo planı: "${wf.name}". Gerçek bir planda adımlar isteğine ve cevaplarına göre hazırlanır.`
        : `Demo plan: "${wf.name}". A real plan is built from your request and answers.`,
    workflows: [
      {
        key: "main",
        name: wf.name,
        role: "main",
        trigger: wf.nodes[0].name,
        steps: wf.nodes.map((n, i) => {
          const params = n.parameters as Record<string, unknown>;
          return {
            id: `main-s${i + 1}`,
            description: n.name,
            node: n.type,
            resource: typeof params.resource === "string" ? params.resource : undefined,
            operation: typeof params.operation === "string" ? params.operation : undefined,
          };
        }),
      },
    ],
    credentials: [...new Set(types.map((t) => DEMO_SERVICES[t]).filter(Boolean))],
    assumptions: [lang === "tr" ? "Demo modunda plan değişiklikleri uygulanmaz; örnek iş akışı gösterilir." : "Demo mode does not apply plan changes; a sample workflow is shown."],
  };
}
