import type { Lang } from "@/lib/dictionaries";

// Clarifying questions asked before planning, in up to MAX_CLARIFY_ROUNDS
// rounds: each round sees every earlier question and answer, asks only what
// is still missing, and reports "done" once the request is detailed enough.

export const MAX_CLARIFY_ROUNDS = 3;

export interface ClarifyQuestion {
  id: string;
  question: string;
  options: string[];
}

/** A question with the user's answer; an empty answer means it was skipped. */
export interface ClarifyAnswer {
  question: string;
  answer: string;
}

export interface ClarifyResult {
  done: boolean;
  questions: ClarifyQuestion[];
}

export function clarifySystemPrompt(lang: Lang): string {
  const language = lang === "tr" ? "Turkish" : "English";
  return `You help people design n8n automations, including large multi-step systems. The user describes an automation; before a workflow is planned, you ask the questions whose answers most change what the workflow must contain, so the result is complete and actually works.

You work in rounds. You get the request and every question asked so far with its answer ("(skipped)" means the user chose not to answer; do not ask it again).
- If the information is enough to build a complete, working workflow, respond {"done": true, "questions": []}.
- Otherwise ask up to 5 new questions about what is still missing or ambiguous. Follow up on earlier answers when they open new questions (e.g. "Slack" → which channel; "on error" → who is notified and how).

Typical gaps: what starts it and how often (time zone); where data comes from and which fields matter; where results go (channel, sheet, table, recipient); conditions, filters and edge cases (duplicates, empty data, invalid input, large volumes); what happens when something fails (retry, notify someone); parts that repeat or are shared between flows.
Do not ask about things already stated or answered. Do not ask for passwords, API keys or other secrets.

Keep each question short and plain, for a non-technical person. When natural, give 2 to 4 short suggested answers in "options"; use an empty array for open questions.

Write the questions and options in ${language}.

Respond with only a JSON object, no markdown fences:
{"done": false, "questions": [{"id": "q1", "question": "...", "options": ["...", "..."]}]}`;
}

export function clarifyInput(request: string, history: ClarifyAnswer[], round: number): string {
  return [
    `Request: ${request}`,
    "",
    history.length ? `Questions asked so far:\n${formatAnswers(history)}` : "No questions asked yet.",
    "",
    `This is round ${round} of at most ${MAX_CLARIFY_ROUNDS}.${round === MAX_CLARIFY_ROUNDS ? " This is the last round; ask only what is essential." : ""}`,
  ].join("\n");
}

/** Validates the model's output; drops malformed entries. No questions means done. */
export function parseClarify(obj: unknown): ClarifyResult {
  const raw = (obj as { questions?: unknown; done?: unknown }) ?? {};
  if (!Array.isArray(raw.questions) && raw.done !== true) throw new Error("Response has no questions array.");
  const questions = (Array.isArray(raw.questions) ? raw.questions : [])
    .filter(
      (q): q is { id?: unknown; question: string; options?: unknown } =>
        typeof q?.question === "string" && q.question.trim() !== ""
    )
    .slice(0, 6)
    .map((q, i) => ({
      id: typeof q.id === "string" && q.id ? q.id : `q${i + 1}`,
      question: q.question.trim(),
      options: Array.isArray(q.options)
        ? q.options.filter((o): o is string => typeof o === "string" && o.trim() !== "").slice(0, 4)
        : [],
    }));
  return { done: raw.done === true || questions.length === 0, questions: raw.done === true ? [] : questions };
}

function sanitize(value: unknown, keepEmpty: boolean): ClarifyAnswer[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (a): a is ClarifyAnswer =>
        typeof a?.question === "string" && typeof a?.answer === "string" && (keepEmpty || a.answer.trim() !== "")
    )
    .slice(0, 24)
    .map((a) => ({ question: a.question.trim().slice(0, 300), answer: a.answer.trim().slice(0, 500) }));
}

/** Answered questions only, within size limits. */
export function sanitizeAnswers(value: unknown): ClarifyAnswer[] {
  return sanitize(value, false);
}

/** All asked questions, including skipped ones (empty answer). */
export function sanitizeHistory(value: unknown): ClarifyAnswer[] {
  return sanitize(value, true);
}

export function formatAnswers(answers: ClarifyAnswer[]): string {
  return answers.map((a) => `- Q: ${a.question}\n  A: ${a.answer || "(skipped)"}`).join("\n");
}

/** Fixed questions for demo mode (no AI): one round, then done. */
export function demoQuestions(lang: Lang, round: number): ClarifyResult {
  if (round > 1) return { done: true, questions: [] };
  if (lang === "en") {
    return {
      done: false,
      questions: [
        { id: "q1", question: "When should the workflow run?", options: ["When new data arrives", "Every morning", "Every hour"] },
        { id: "q2", question: "Where should the result be sent?", options: ["Slack", "Google Sheets", "Email"] },
        { id: "q3", question: "What should happen if a step fails?", options: ["Email me", "Notify on Slack", "Nothing"] },
        { id: "q4", question: "Anything else the workflow should check or filter?", options: [] },
      ],
    };
  }
  return {
    done: false,
    questions: [
      { id: "q1", question: "İş akışı ne zaman çalışsın?", options: ["Yeni veri gelince", "Her sabah", "Saatte bir"] },
      { id: "q2", question: "Sonuç nereye gönderilsin?", options: ["Slack", "Google Sheets", "E-posta"] },
      { id: "q3", question: "Bir adım hata verirse ne olsun?", options: ["Bana e-posta gönder", "Slack'e bildir", "Bir şey yapma"] },
      { id: "q4", question: "İş akışının kontrol etmesi veya ayıklaması gereken başka bir şey var mı?", options: [] },
    ],
  };
}
