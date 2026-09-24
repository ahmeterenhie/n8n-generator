"use client";

import { useState } from "react";
import { SetupGuide } from "@/components/SetupGuide";
import { WorkflowCard, downloadJson } from "@/components/WorkflowCard";
import type { Connection, Provider } from "@/lib/apiConfig";
import type { ClarifyAnswer } from "@/lib/clarify";
import { useI18n } from "@/lib/i18n";
import type { BuiltWorkflow } from "@/lib/pipeline";

const ROLE_COLOR: Record<BuiltWorkflow["role"], string> = { main: "#ff6b35", sub: "#5b9dff", error: "#ff5f57" };

/** All workflows of a generated system, one tab each, plus the setup prompt for the whole system. */
export function ProjectResult({
  workflows,
  isDemo,
  request,
  answers,
  conn,
  onReplace,
}: {
  workflows: BuiltWorkflow[];
  isDemo: boolean;
  request: string;
  answers: ClarifyAnswer[];
  conn: (Connection & { provider: Provider }) | null;
  onReplace: (index: number, updated: BuiltWorkflow) => void;
}) {
  const { t } = useI18n();
  const [active, setActive] = useState(0);
  const current = workflows[Math.min(active, workflows.length - 1)];

  // Browsers may ask once to allow several downloads
  const downloadAll = async () => {
    for (const w of workflows) {
      downloadJson(w.name, w.workflow);
      await new Promise((r) => setTimeout(r, 400));
    }
  };

  return (
    <section>
      {workflows.length > 1 && (
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div className="flex flex-wrap gap-1.5" role="tablist">
            {workflows.map((w, i) => {
              const selected = i === active;
              const failing = w.validation.errors.length > 0;
              return (
                <button
                  key={w.key}
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActive(i)}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-sm border transition-colors ${
                    selected ? "border-[#ff6b35] bg-[#ff6b35]/10 text-[#e8e6e0]" : "border-[#1e1e2e] text-[#8b8b9b] hover:text-[#e8e6e0]"
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ROLE_COLOR[w.role] }} />
                  <span className="max-w-[220px] truncate">{w.name}</span>
                  <span className={failing ? "text-[#febc2e]" : "text-[#28c840]"}>{failing ? "⚠" : "✓"}</span>
                </button>
              );
            })}
          </div>
          <button
            onClick={downloadAll}
            className="px-3 py-1.5 text-xs font-bold text-[#0a0a0f] bg-[#ff6b35] hover:bg-[#ff8555] rounded-sm transition-colors"
          >
            {t.result.downloadAll}
          </button>
        </div>
      )}

      {current && (
        <WorkflowCard
          key={current.key}
          built={current}
          isDemo={isDemo}
          conn={conn}
          onReplace={(updated) => onReplace(workflows.indexOf(current), updated)}
        />
      )}

      <SetupGuide
        workflows={workflows.map((w) => ({ name: w.name, role: w.role, workflow: w.workflow, openIssues: w.validation.errors }))}
        request={request}
        answers={answers}
      />
    </section>
  );
}
