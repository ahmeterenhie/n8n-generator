import type { ClarifyAnswer } from "@/lib/clarify";
import type { Lang } from "@/lib/dictionaries";
import type { ValidationIssue } from "@/lib/n8n/validate";
import type { WorkflowRole } from "@/lib/plan";
import { shortType, type WfNode } from "@/lib/workflowLayout";

// Builds a ready-to-paste prompt: the user uploads the workflow JSON file(s)
// to any AI assistant together with this text and gets guided through setup.

export interface SetupWorkflow {
  name: string;
  role: WorkflowRole;
  workflow: Record<string, unknown>;
  /** Problems the automatic check could not fix */
  openIssues?: ValidationIssue[];
}

/** Placeholder values like YOUR_SPREADSHEET_URL, with the nodes that use them. */
function findPlaceholders(nodes: WfNode[]): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();
  const walk = (value: unknown, nodeName: string) => {
    if (typeof value === "string") {
      for (const match of value.match(/YOUR_[A-Z0-9_]+/g) ?? []) {
        if (!found.has(match)) found.set(match, new Set());
        found.get(match)!.add(nodeName);
      }
    } else if (Array.isArray(value)) {
      value.forEach((v) => walk(v, nodeName));
    } else if (value && typeof value === "object") {
      Object.values(value).forEach((v) => walk(v, nodeName));
    }
  };
  nodes.forEach((n) => walk(n.parameters, n.name));
  return found;
}

const TEXT = {
  tr: {
    intro: (files: string) =>
      `Ekteki ${files} bir n8n otomasyonuna ait. Bunu kendi n8n hesabımda çalışır hâle getirmek istiyorum. n8n'i ilk kez kullanıyor olabilirim; lütfen beni adım adım yönlendir.`,
    oneFile: (name: string) => `JSON dosyası ("${name}")`,
    manyFiles: (n: number) => `${n} JSON dosyası`,
    goal: "Otomasyonun yapması gereken:",
    details: "Belirttiğim ayrıntılar:",
    workflow: (name: string, role: string) => `İş akışı "${name}" (${role}) — düğümler:`,
    roles: { main: "ana iş akışı", sub: "alt iş akışı", error: "hata iş akışı" },
    placeholders: "Doldurmam gereken yer tutucu değerler:",
    issues: "n8n düğüm kataloğuna göre yapılan otomatik kontrol şu sorunları çözemedi; bunları düzeltmeme de yardım et:",
    linking: [
      "Bu sistem birden fazla iş akışından oluşuyor. Önce alt iş akışlarını ve hata iş akışını, en son ana iş akışlarını içe aktarmamı söyle.",
      "Ana iş akışlarındaki \"Execute Sub-workflow\" düğümlerinde doğru alt iş akışını seçmemi ve alt iş akışlarını nasıl test edeceğimi göster.",
      "Hata iş akışı varsa, her ana iş akışının Settings → Error Workflow ayarında onu nasıl seçeceğimi anlat.",
    ],
    please: "Lütfen:",
    asks: [
      "Bu otomasyonun ne yaptığını 3–4 cümleyle özetle.",
      "n8n'e nasıl içe aktaracağımı anlat.",
      "Bağlantı bilgisi (credential) gereken her düğüm için: hangi servis olduğunu, bu bilgiyi tam olarak nereden ve nasıl alacağımı (hangi sayfaya gireceğimi, hangi izinleri seçeceğimi) ve n8n'de nereye gireceğimi söyle.",
      "Her yer tutucu değeri neyle değiştirmem gerektiğini ve bu bilgiyi nereden bulacağımı söyle.",
      "Webhook kullanıyorsa adresini nereden bulacağımı ve nasıl test edeceğimi göster.",
      "Otomasyonun tamamını nasıl test edeceğimi ve en sık karşılaşılan hataları nasıl çözeceğimi açıkla.",
      "Adım adım ilerle: bir adımı bitirdiğimi söylemeden sonrakine geçme ve takıldığım yerde sorularımı cevapla.",
    ],
    fix: "JSON'da bir hata veya eksik görürsen düzeltilmiş hâlini de ver.",
    reply: "Bana Türkçe cevap ver.",
  },
  en: {
    intro: (files: string) =>
      `The attached ${files} belong to an n8n automation. I want to get it running in my own n8n. I may be new to n8n, so please guide me step by step.`,
    oneFile: (name: string) => `JSON file ("${name}")`,
    manyFiles: (n: number) => `${n} JSON files`,
    goal: "What the automation should do:",
    details: "Details I specified:",
    workflow: (name: string, role: string) => `Workflow "${name}" (${role}) — nodes:`,
    roles: { main: "main workflow", sub: "sub-workflow", error: "error workflow" },
    placeholders: "Placeholder values I still need to replace:",
    issues: "An automatic check against the n8n node catalog found these unresolved issues; please help me fix them:",
    linking: [
      "This system has several workflows. Tell me to import the sub-workflows and the error workflow first and the main workflows last.",
      'Show me how to select the right sub-workflow in each "Execute Sub-workflow" node and how to test the sub-workflows.',
      "If there is an error workflow, explain how to select it under Settings → Error Workflow in each main workflow.",
    ],
    please: "Please:",
    asks: [
      "Summarise in 3–4 sentences what this automation does.",
      "Explain how to import it into n8n.",
      "For every node that needs credentials: which service it is, exactly where and how I get the credentials (which page, which permissions or scopes to choose), and where to enter them in n8n.",
      "Tell me what to replace each placeholder value with and where I can find that information.",
      "If it uses a webhook, show me where to find its URL and how to test it.",
      "Explain how to test the whole automation and how to fix the most common errors.",
      "Go one step at a time: wait for me to say I've finished a step before moving on, and answer my questions when I get stuck.",
    ],
    fix: "If you spot a mistake or something missing in the JSON, also give me a corrected version.",
    reply: "",
  },
};

export function buildSetupPrompt(opts: {
  workflows: SetupWorkflow[];
  request: string;
  answers: ClarifyAnswer[];
  lang: Lang;
}): string {
  const t = TEXT[opts.lang];
  const many = opts.workflows.length > 1;
  const files = many ? t.manyFiles(opts.workflows.length) : t.oneFile(opts.workflows[0]?.name ?? "workflow");
  const answered = opts.answers.filter((a) => a.answer.trim());

  const lines = [t.intro(files), "", `${t.goal} ${opts.request}`];
  if (answered.length) lines.push("", t.details, ...answered.map((a) => `- ${a.question} → ${a.answer}`));

  const placeholders: string[] = [];
  const issues: string[] = [];
  for (const w of opts.workflows) {
    const nodes = (Array.isArray(w.workflow.nodes) ? w.workflow.nodes : []) as WfNode[];
    lines.push("", t.workflow(w.name, t.roles[w.role]), ...nodes.map((n) => `- ${n.name} (${shortType(n.type)})`));
    for (const [ph, users] of findPlaceholders(nodes)) {
      placeholders.push(`- ${ph} → ${many ? `${w.name}: ` : ""}${Array.from(users).join(", ")}`);
    }
    for (const i of w.openIssues ?? []) {
      issues.push(`- ${many ? `${w.name} / ` : ""}${i.node ? `${i.node}: ` : ""}${i.message}`);
    }
  }
  if (placeholders.length) lines.push("", t.placeholders, ...placeholders);
  if (issues.length) lines.push("", t.issues, ...issues);

  const asks = [...t.asks];
  if (many) asks.splice(2, 0, ...t.linking);
  lines.push("", t.please, ...asks.map((a, i) => `${i + 1}. ${a}`), "", t.fix);
  if (t.reply) lines.push("", t.reply);
  return lines.join("\n");
}
