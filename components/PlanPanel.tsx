"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { Plan, PlanStep, PlanWorkflow } from "@/lib/plan";

const ROLE_COLOR: Record<PlanWorkflow["role"], string> = {
  main: "#ff6b35",
  sub: "#5b9dff",
  error: "#ff5f57",
};

/** The plan the user reviews, edits and approves before anything is generated. */
export function PlanPanel({
  plan,
  onChange,
  onApprove,
  onRevise,
  onBack,
  busy,
  revising,
}: {
  plan: Plan;
  onChange: (plan: Plan) => void;
  onApprove: () => void;
  onRevise: (feedback: string) => void;
  onBack: () => void;
  busy: boolean;
  revising: boolean;
}) {
  const { t } = useI18n();
  const p = t.plan;
  const [feedback, setFeedback] = useState("");

  const updateWorkflow = (key: string, change: (w: PlanWorkflow) => PlanWorkflow) =>
    onChange({ ...plan, workflows: plan.workflows.map((w) => (w.key === key ? change(w) : w)) });

  const updateStep = (key: string, id: string, change: Partial<PlanStep>) =>
    updateWorkflow(key, (w) => ({ ...w, steps: w.steps.map((s) => (s.id === id ? { ...s, ...change } : s)) }));

  const removeStep = (key: string, id: string) =>
    updateWorkflow(key, (w) => ({ ...w, steps: w.steps.filter((s) => s.id !== id) }));

  const addStep = (key: string) =>
    updateWorkflow(key, (w) => ({
      ...w,
      steps: [...w.steps, { id: `${key}-new-${Date.now()}`, description: "" }],
    }));

  const hasSteps = plan.workflows.some((w) => w.role === "main" && w.steps.some((s) => s.description.trim()));

  return (
    <section className="mb-8 border border-[#ff6b35]/40 bg-[#0d0d17] rounded-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-[#1e1e2e] bg-[#0a0a12]">
        <span className="text-[#ff6b35] text-xs tracking-widest uppercase font-bold">{p.title}</span>
        <span className="text-[11px] text-[#6b6b7b]">{p.workflowsCount.replace("{n}", String(plan.workflows.length))}</span>
      </div>

      <div className="px-5 py-5 space-y-5">
        <p className="text-xs leading-relaxed text-[#8b8b9b]">{p.subtitle}</p>
        {plan.summary && <p className="text-sm leading-relaxed text-[#e8e6e0]">{plan.summary}</p>}

        {plan.workflows.map((w) => (
          <div key={w.key} className="border border-[#1e1e2e] rounded-sm bg-[#0a0a12]" style={{ borderLeft: `3px solid ${ROLE_COLOR[w.role]}` }}>
            <div className="px-4 pt-3 pb-2 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="text-[10px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded-sm"
                  style={{ color: ROLE_COLOR[w.role], backgroundColor: `${ROLE_COLOR[w.role]}1a` }}
                >
                  {p.roles[w.role]}
                </span>
                <input
                  value={w.name}
                  onChange={(e) => updateWorkflow(w.key, (x) => ({ ...x, name: e.target.value }))}
                  aria-label={p.roles[w.role]}
                  className="flex-1 min-w-0 bg-transparent text-sm font-bold text-[#f0ede6] outline-none border-b border-transparent focus:border-[#ff6b35]"
                />
              </div>
              {w.trigger && (
                <p className="text-[11px] text-[#8b8b9b]">
                  <span className="text-[#6b6b7b]">{p.trigger}:</span> {w.trigger}
                </p>
              )}
              {w.inputs && (
                <p className="text-[11px] text-[#8b8b9b]">
                  <span className="text-[#6b6b7b]">{p.inputs}:</span> {w.inputs}
                </p>
              )}
              {w.outputs && (
                <p className="text-[11px] text-[#8b8b9b]">
                  <span className="text-[#6b6b7b]">{p.outputs}:</span> {w.outputs}
                </p>
              )}
            </div>

            <ol className="px-4 pb-3 space-y-1.5">
              {w.steps.map((s, i) => (
                <li key={s.id} className="group flex items-start gap-2">
                  <span className="text-[#ff6b35] text-[11px] font-bold pt-1.5 w-6 shrink-0 text-right">{i + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <input
                      value={s.description}
                      onChange={(e) => updateStep(w.key, s.id, { description: e.target.value })}
                      placeholder={p.newStep}
                      className="w-full bg-transparent text-xs text-[#e8e6e0] placeholder-[#3a3a4a] py-1 outline-none border-b border-[#1e1e2e] focus:border-[#ff6b35]"
                    />
                    <span className="text-[10px] text-[#4a4a5a]">
                      {s.node
                        ? `${s.node.replace("n8n-nodes-base.", "")}${s.resource || s.operation ? ` · ${[s.resource, s.operation].filter(Boolean).join("/")}` : ""}`
                        : p.autoNode}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeStep(w.key, s.id)}
                    aria-label={p.removeStep}
                    title={p.removeStep}
                    className="px-1.5 pt-1 text-sm text-[#4a4a5a] hover:text-[#ff5f57] opacity-60 group-hover:opacity-100 transition-opacity"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ol>
            <div className="px-4 pb-3">
              <button type="button" onClick={() => addStep(w.key)} className="text-[11px] text-[#6b6b7b] hover:text-[#ff6b35]">
                {p.addStep}
              </button>
            </div>
          </div>
        ))}

        {plan.credentials.length > 0 && (
          <div>
            <p className="text-[10px] tracking-widest uppercase text-[#4a4a5a] mb-1.5">{p.credentials}</p>
            <div className="flex flex-wrap gap-1.5">
              {plan.credentials.map((c) => (
                <span key={c} className="text-[11px] text-[#c8c5be] border border-[#1e1e2e] rounded-sm px-2 py-0.5">
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}

        {plan.assumptions.length > 0 && (
          <div>
            <p className="text-[10px] tracking-widest uppercase text-[#4a4a5a] mb-1.5">{p.assumptions}</p>
            <ul className="space-y-1 pl-5 list-disc marker:text-[#4a4a5a]">
              {plan.assumptions.map((a, i) => (
                <li key={i} className="text-[11px] text-[#a8a59e]">
                  {a}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            maxLength={2000}
            rows={2}
            placeholder={p.feedbackPlaceholder}
            className="input flex-1 resize-none leading-relaxed"
          />
          <button
            type="button"
            onClick={() => {
              onRevise(feedback.trim());
              setFeedback("");
            }}
            disabled={!feedback.trim() || busy}
            className="px-4 py-2 text-xs tracking-wider uppercase text-[#e8e6e0] border border-[#3a3a4a] hover:border-[#ff6b35] hover:text-[#ff6b35] rounded-sm disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {revising ? p.revising : p.revise}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-[#1e1e2e] bg-[#0a0a12]">
        <button type="button" onClick={onBack} className="text-xs text-[#6b6b7b] hover:text-[#e8e6e0] transition-colors">
          {p.back}
        </button>
        <button
          type="button"
          onClick={onApprove}
          disabled={busy || !hasSteps}
          className="flex items-center gap-2 px-5 py-2 bg-[#ff6b35] text-[#0a0a0f] text-xs font-bold tracking-widest uppercase rounded-sm hover:bg-[#ff8555] disabled:opacity-30 disabled:cursor-not-allowed transition-colors active:scale-95"
        >
          ▶ {p.approve}
        </button>
      </div>
    </section>
  );
}
