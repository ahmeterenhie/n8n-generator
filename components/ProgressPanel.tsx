"use client";

import { useI18n } from "@/lib/i18n";
import type { Progress } from "@/lib/pipeline";

export function Spinner() {
  return (
    <svg className="animate-spin w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function fill(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));
}

/** Live list of generation steps streamed from the server. */
export function ProgressPanel({ events, title }: { events: Progress[]; title?: string }) {
  const { t } = useI18n();
  const pr = t.progress;
  const describe = (e: Progress) => fill(pr[e.stage], e as unknown as Record<string, unknown>);

  return (
    <div className="mb-6 border border-[#1e1e2e] bg-[#0d0d17] rounded-sm px-5 py-5">
      <div className="flex items-center gap-3 mb-4 text-[#ff6b35]">
        <Spinner />
        <span className="text-xs tracking-widest uppercase">{title ?? pr.title}</span>
      </div>
      <ul className="space-y-2" aria-live="polite">
        {events.map((e, i) => {
          const current = i === events.length - 1;
          return (
            <li key={i} className="flex items-center gap-2.5 text-xs">
              <span className={current ? "text-[#febc2e] animate-pulse" : "text-[#28c840]"}>{current ? "▸" : "✓"}</span>
              <span className={current ? "text-[#c8c5be]" : "text-[#4a4a5a]"}>{describe(e)}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-[11px] text-[#4a4a5a]">{pr.note}</p>
    </div>
  );
}
