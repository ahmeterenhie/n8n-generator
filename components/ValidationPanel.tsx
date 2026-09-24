"use client";

import { useI18n } from "@/lib/i18n";
import type { ValidationIssue } from "@/lib/n8n/validate";

export interface ValidationSummary {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  catalogVersion: string;
  repairRounds: number;
}

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));
}

/** Result of checking the workflow against the n8n node catalog. */
export function ValidationPanel({ validation }: { validation: ValidationSummary }) {
  const { t } = useI18n();
  const v = t.validation;
  const ok = validation.errors.length === 0;

  // Warnings the UI can phrase in the user's language; others fall back to the English detail
  const describe = (w: ValidationIssue) => (w.code ? fill(v[w.code], { param: w.param ?? "" }) : w.message);

  return (
    <div className="border-t border-[#1e1e2e] px-4 py-3 space-y-2.5">
      <p className={`flex flex-wrap items-center gap-x-2 text-xs ${ok ? "text-[#28c840]" : "text-[#febc2e]"}`}>
        <span>{ok ? "✓" : "⚠"}</span>
        <span>{ok ? fill(v.ok, { version: validation.catalogVersion }) : fill(v.problems, { count: validation.errors.length })}</span>
        {validation.repairRounds > 0 && (
          <span className="text-[#6b6b7b]">· {fill(v.repaired, { rounds: validation.repairRounds })}</span>
        )}
      </p>

      {!ok && (
        <ul className="space-y-1 pl-5">
          {validation.errors.map((e, i) => (
            <li key={i} className="text-[11px] text-[#a8a59e]">
              {e.node && <span className="text-[#e8e6e0]">{e.node}: </span>}
              <span title={v.technical}>{e.message}</span>
            </li>
          ))}
        </ul>
      )}

      {validation.warnings.length > 0 && (
        <div>
          <p className="text-[10px] tracking-widest uppercase text-[#4a4a5a] mb-1">{v.fillIn}</p>
          <ul className="space-y-1 pl-5 list-disc marker:text-[#4a4a5a]">
            {validation.warnings.map((w, i) => (
              <li key={i} className="text-[11px] text-[#8b8b9b]">
                {w.node && <span className="text-[#c8c5be]">{w.node}: </span>}
                {describe(w)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
