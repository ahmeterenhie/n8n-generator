import type { ClarifyAnswer } from "@/lib/clarify";
import type { Lang } from "@/lib/dictionaries";
import type { ValidationIssue } from "@/lib/n8n/validate";
import { shortType, type WfNode } from "@/lib/workflowLayout";

// Builds a ready-to-paste prompt: the user uploads the workflow JSON to any
// AI assistant together with this text and gets guided through the setup.

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

export function buildSetupPrompt(opts: {
  workflow: Record<string, unknown>;
  request: string;
  answers: ClarifyAnswer[];
  lang: Lang;
  openIssues?: ValidationIssue[];
}): string {
  const nodes = (Array.isArray(opts.workflow.nodes) ? opts.workflow.nodes : []) as WfNode[];
  const name = typeof opts.workflow.name === "string" ? opts.workflow.name : "n8n workflow";
  const nodeList = nodes.map((n) => `- ${n.name} (${shortType(n.type)})`).join("\n");
  const placeholders = Array.from(findPlaceholders(nodes), ([ph, users]) => `- ${ph} → ${Array.from(users).join(", ")}`);
  const issues = (opts.openIssues ?? []).map((i) => `- ${i.node ? `${i.node}: ` : ""}${i.message}`);

  if (opts.lang === "en") {
    return [
      `The attached JSON file is an n8n workflow called "${name}". I want to get it running in my own n8n. I may be new to n8n, so please guide me step by step.`,
      "",
      `What the workflow should do: ${opts.request}`,
      ...(opts.answers.length ? ["", "Details I specified:", ...opts.answers.map((a) => `- ${a.question} → ${a.answer}`)] : []),
      "",
      "Nodes in the workflow:",
      nodeList,
      ...(placeholders.length ? ["", "Placeholder values I still need to replace:", ...placeholders] : []),
      ...(issues.length
        ? ["", "An automatic check against the n8n node catalog found these unresolved issues; please help me fix them:", ...issues]
        : []),
      "",
      "Please:",
      "1. Summarise in 3–4 sentences what this workflow does.",
      "2. Explain how to import it into n8n.",
      "3. For every node that needs credentials: which service it is, exactly where and how I get the credentials (which page, which permissions or scopes to choose), and where to enter them in n8n.",
      "4. Tell me what to replace each placeholder value with and where I can find that information.",
      "5. If it uses a webhook, show me where to find its URL and how to test it.",
      "6. Explain how to test the whole workflow and how to fix the most common errors.",
      "7. Go one step at a time: wait for me to say I've finished a step before moving on, and answer my questions when I get stuck.",
      "",
      "If you spot a mistake or something missing in the JSON, also give me a corrected version.",
    ].join("\n");
  }

  return [
    `Ekteki JSON dosyası "${name}" adlı bir n8n iş akışı. Bunu kendi n8n hesabımda çalışır hâle getirmek istiyorum. n8n'i ilk kez kullanıyor olabilirim; lütfen beni adım adım yönlendir.`,
    "",
    `İş akışının yapması gereken: ${opts.request}`,
    ...(opts.answers.length ? ["", "Belirttiğim ayrıntılar:", ...opts.answers.map((a) => `- ${a.question} → ${a.answer}`)] : []),
    "",
    "İş akışındaki düğümler:",
    nodeList,
    ...(placeholders.length ? ["", "Doldurmam gereken yer tutucu değerler:", ...placeholders] : []),
    ...(issues.length
      ? ["", "n8n düğüm kataloğuna göre yapılan otomatik kontrol şu sorunları çözemedi; bunları düzeltmeme de yardım et:", ...issues]
      : []),
    "",
    "Lütfen:",
    "1. Bu iş akışının ne yaptığını 3–4 cümleyle özetle.",
    "2. n8n'e nasıl içe aktaracağımı anlat.",
    "3. Bağlantı bilgisi (credential) gereken her düğüm için: hangi servis olduğunu, bu bilgiyi tam olarak nereden ve nasıl alacağımı (hangi sayfaya gireceğimi, hangi izinleri seçeceğimi) ve n8n'de nereye gireceğimi söyle.",
    "4. Her yer tutucu değeri neyle değiştirmem gerektiğini ve bu bilgiyi nereden bulacağımı söyle.",
    "5. Webhook kullanıyorsa adresini nereden bulacağımı ve nasıl test edeceğimi göster.",
    "6. İş akışının tamamını nasıl test edeceğimi ve en sık karşılaşılan hataları nasıl çözeceğimi açıkla.",
    "7. Adım adım ilerle: bir adımı bitirdiğimi söylemeden sonrakine geçme ve takıldığım yerde sorularımı cevapla.",
    "",
    "JSON'da bir hata veya eksik görürsen düzeltilmiş hâlini de ver.",
    "",
    "Bana Türkçe cevap ver.",
  ].join("\n");
}
