"use client";

import { useMemo, useState } from "react";
import type { ClarifyAnswer } from "@/lib/clarify";
import { useI18n } from "@/lib/i18n";
import { buildSetupPrompt } from "@/lib/setupPrompt";

/** Ready-to-paste prompt that lets any AI assistant walk the user through setup. */
export function SetupGuide({
  workflow,
  request,
  answers,
}: {
  workflow: Record<string, unknown>;
  request: string;
  answers: ClarifyAnswer[];
}) {
  const { t, lang } = useI18n();
  const s = t.setup;
  const [copied, setCopied] = useState(false);
  const prompt = useMemo(() => buildSetupPrompt({ workflow, request, answers, lang }), [workflow, request, answers, lang]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the text is still selectable in the box below
    }
  };

  const handleDownload = () => {
    const url = URL.createObjectURL(new Blob([prompt], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${s.fileName}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mt-4 border border-[#1e1e2e] bg-[#0a0a12] rounded-sm overflow-hidden">
      <div className="px-4 pt-3 pb-4">
        <p className="text-[#6b6b7b] text-xs mb-2 tracking-widest uppercase">{s.title}</p>
        <p className="text-xs leading-relaxed text-[#a8a59e]">{s.intro}</p>
        <ol className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-[#8b8b9b]">
          {s.steps.map((step, i) => (
            <li key={i}>
              <span className="text-[#ff6b35] mr-1.5">{`[${i + 1}]`}</span>
              {step}
            </li>
          ))}
        </ol>
      </div>

      <div className="border-t border-[#1e1e2e]">
        <div className="flex items-center justify-end gap-2 px-4 py-2 bg-[#0d0d17]">
          <button
            type="button"
            onClick={handleDownload}
            className="px-3 py-1.5 text-xs text-[#6b6b7b] hover:text-[#e8e6e0] border border-[#1e1e2e] hover:border-[#3a3a4a] rounded-sm transition-colors"
          >
            {s.download}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="px-3 py-1.5 text-xs font-bold text-[#0a0a0f] bg-[#ff6b35] hover:bg-[#ff8555] rounded-sm transition-colors"
          >
            {copied ? s.copied : s.copy}
          </button>
        </div>
        <pre className="max-h-64 overflow-auto scrollbar-thin px-4 py-3 text-[11px] leading-relaxed text-[#a8a59e] whitespace-pre-wrap">
          {prompt}
        </pre>
      </div>
    </div>
  );
}
