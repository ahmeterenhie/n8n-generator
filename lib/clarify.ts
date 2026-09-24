import type { Lang } from "@/lib/dictionaries";

// Clarifying questions asked before generating, so the workflow covers
// details the user's short description leaves out.

export interface ClarifyQuestion {
  id: string;
  question: string;
  options: string[];
}

export interface ClarifyAnswer {
  question: string;
  answer: string;
}

export function clarifySystemPrompt(lang: Lang): string {
  const language = lang === "tr" ? "Turkish" : "English";
  return `You help people design n8n automations. The user describes an automation in a sentence or two. Before a workflow is built, you ask the few questions whose answers most change what the workflow must contain, so the result is complete and actually works.

Ask between 3 and 6 questions. Cover what is missing or ambiguous, typically:
- the trigger and timing (what starts it, how often, which time zone)
- where the data comes from and which fields matter
- where results go (which channel, sheet, table, recipient)
- conditions, filters and edge cases (duplicates, empty data, invalid input)
- what should happen when something fails (retry, notify someone)
Do not ask about things the description already states. Do not ask for passwords, API keys or other secrets.

Keep each question short and plain, for a non-technical person. When natural, give 2 to 4 short suggested answers in "options"; use an empty array for open questions.

Write the questions and options in ${language}.

Respond with only a JSON object, no markdown fences:
{"questions":[{"id":"q1","question":"...","options":["...","..."]}]}`;
}

/** Validates the model's output; drops malformed entries. */
export function parseQuestions(obj: unknown): ClarifyQuestion[] {
  const raw = (obj as { questions?: unknown })?.questions;
  if (!Array.isArray(raw)) throw new Error("Response has no questions array.");
  const questions = raw
    .filter((q): q is { id?: unknown; question: string; options?: unknown } => typeof q?.question === "string" && q.question.trim() !== "")
    .slice(0, 6)
    .map((q, i) => ({
      id: typeof q.id === "string" && q.id ? q.id : `q${i + 1}`,
      question: q.question.trim(),
      options: Array.isArray(q.options)
        ? q.options.filter((o): o is string => typeof o === "string" && o.trim() !== "").slice(0, 4)
        : [],
    }));
  if (!questions.length) throw new Error("Response contains no usable questions.");
  return questions;
}

/** Keeps only well-formed, non-empty answers within size limits. */
export function sanitizeAnswers(value: unknown): ClarifyAnswer[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (a): a is ClarifyAnswer =>
        typeof a?.question === "string" && typeof a?.answer === "string" && a.answer.trim() !== ""
    )
    .slice(0, 8)
    .map((a) => ({ question: a.question.trim().slice(0, 300), answer: a.answer.trim().slice(0, 500) }));
}

export function formatAnswers(answers: ClarifyAnswer[]): string {
  return answers.map((a) => `- Q: ${a.question}\n  A: ${a.answer}`).join("\n");
}

/** Fixed questions for demo mode (no AI). */
export function demoQuestions(lang: Lang): ClarifyQuestion[] {
  if (lang === "en") {
    return [
      { id: "q1", question: "When should the workflow run?", options: ["When new data arrives", "Every morning", "Every hour"] },
      { id: "q2", question: "Where should the result be sent?", options: ["Slack", "Google Sheets", "Email"] },
      { id: "q3", question: "What should happen if a step fails?", options: ["Email me", "Notify on Slack", "Nothing"] },
      { id: "q4", question: "Anything else the workflow should check or filter?", options: [] },
    ];
  }
  return [
    { id: "q1", question: "İş akışı ne zaman çalışsın?", options: ["Yeni veri gelince", "Her sabah", "Saatte bir"] },
    { id: "q2", question: "Sonuç nereye gönderilsin?", options: ["Slack", "Google Sheets", "E-posta"] },
    { id: "q3", question: "Bir adım hata verirse ne olsun?", options: ["Bana e-posta gönder", "Slack'e bildir", "Bir şey yapma"] },
    { id: "q4", question: "İş akışının kontrol etmesi veya ayıklaması gereken başka bir şey var mı?", options: [] },
  ];
}
