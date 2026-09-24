"use client";

import type { ClarifyQuestion } from "@/lib/clarify";
import { useI18n } from "@/lib/i18n";

/** Clarifying questions shown before generating; each has optional suggested answers. */
export function QuestionsPanel({
  questions,
  answers,
  onAnswer,
  onGenerate,
  onBack,
  busy,
}: {
  questions: ClarifyQuestion[];
  answers: Record<string, string>;
  onAnswer: (id: string, value: string) => void;
  onGenerate: () => void;
  onBack: () => void;
  busy: boolean;
}) {
  const { t } = useI18n();
  const g = t.generator;
  const answeredCount = questions.filter((q) => answers[q.id]?.trim()).length;

  return (
    <section className="mb-8 border border-[#ff6b35]/40 bg-[#0d0d17] rounded-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-[#1e1e2e] bg-[#0a0a12]">
        <span className="text-[#ff6b35] text-xs tracking-widest uppercase font-bold">{g.questionsTitle}</span>
        <span className="text-[11px] tabular-nums text-[#6b6b7b]">
          {answeredCount}/{questions.length} {g.answered}
        </span>
      </div>

      <div className="px-5 py-5">
        <p className="mb-5 text-xs leading-relaxed text-[#8b8b9b]">{g.questionsSubtitle}</p>

        <ol className="space-y-6">
          {questions.map((q, i) => {
            const value = answers[q.id] ?? "";
            return (
              <li key={q.id}>
                <label htmlFor={`answer-${q.id}`} className="flex gap-2 text-sm text-[#e8e6e0] leading-snug">
                  <span className="text-[#ff6b35] text-xs font-bold pt-0.5">{`[${i + 1}]`}</span>
                  {q.question}
                </label>
                {q.options.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-2 pl-7">
                    {q.options.map((option) => {
                      const selected = value === option;
                      return (
                        <button
                          key={option}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => onAnswer(q.id, selected ? "" : option)}
                          className={`px-3 py-1.5 text-xs rounded-sm border transition-colors ${
                            selected
                              ? "border-[#ff6b35] text-[#ff6b35] bg-[#ff6b35]/10"
                              : "border-[#1e1e2e] text-[#8b8b9b] hover:border-[#3a3a4a] hover:text-[#e8e6e0]"
                          }`}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="mt-2 pl-7">
                  <input
                    id={`answer-${q.id}`}
                    value={value}
                    onChange={(e) => onAnswer(q.id, e.target.value)}
                    maxLength={500}
                    placeholder={g.answerPlaceholder}
                    className="input w-full"
                  />
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-[#1e1e2e] bg-[#0a0a12]">
        <button type="button" onClick={onBack} className="text-xs text-[#6b6b7b] hover:text-[#e8e6e0] transition-colors">
          {g.editRequest}
        </button>
        <button
          type="button"
          onClick={onGenerate}
          disabled={busy}
          className="flex items-center gap-2 px-5 py-2 bg-[#ff6b35] text-[#0a0a0f] text-xs font-bold tracking-widest uppercase rounded-sm hover:bg-[#ff8555] disabled:opacity-30 disabled:cursor-not-allowed transition-colors active:scale-95"
        >
          ▶ {g.generateNow}
        </button>
      </div>
    </section>
  );
}
