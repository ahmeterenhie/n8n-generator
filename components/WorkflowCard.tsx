"use client";

import { useMemo, useState } from "react";
import { ExecutionsPanel } from "@/components/ExecutionsPanel";
import { ProgressPanel, Spinner } from "@/components/ProgressPanel";
import { ValidationPanel } from "@/components/ValidationPanel";
import { WorkflowDiagram } from "@/components/WorkflowDiagram";
import { ApiRequestError, postStream } from "@/lib/apiClient";
import type { Connection, Provider } from "@/lib/apiConfig";
import { translateError, useI18n } from "@/lib/i18n";
import type { N8nSettings } from "@/lib/n8nConfig";
import type { BuiltWorkflow, Progress } from "@/lib/pipeline";
import type { ProjectWorkflow } from "@/lib/projectTypes";

export function downloadJson(name: string, data: unknown) {
  const slug = name.toLocaleLowerCase("tr").replace(/[^a-z0-9ğüşöçı]+/gi, "-").replace(/^-|-$/g, "") || "workflow";
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** One generated workflow: diagram or JSON, check result, download, change requests and n8n runs. */
export function WorkflowCard({
  built,
  isDemo,
  conn,
  n8n,
  onReplace,
  onPushAll,
}: {
  built: ProjectWorkflow;
  isDemo: boolean;
  conn: (Connection & { provider: Provider }) | null;
  n8n: N8nSettings | null;
  onReplace: (updated: ProjectWorkflow) => void;
  /** Sends the system to n8n, with this workflow replaced by the given version */
  onPushAll?: (override: ProjectWorkflow) => Promise<boolean>;
}) {
  const { t, lang } = useI18n();
  const g = t.generator;
  const r = t.result;
  const [view, setView] = useState<"diagram" | "json">("diagram");
  const [copied, setCopied] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [refining, setRefining] = useState(false);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refined, setRefined] = useState(false);

  const json = useMemo(() => JSON.stringify(built.workflow, null, 2), [built.workflow]);
  const stats = useMemo(
    () => ({
      nodes: (built.workflow.nodes as unknown[])?.length ?? 0,
      connections: Object.keys((built.workflow.connections as object) ?? {}).length,
      bytes: new Blob([json]).size,
    }),
    [built.workflow, json]
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the JSON tab still allows selecting the text
    }
  };

  /** Applies a change request; returns the updated workflow, or null on failure. */
  const runRefine = async (text: string): Promise<ProjectWorkflow | null> => {
    setRefining(true);
    setError(null);
    setRefined(false);
    setProgress([]);
    try {
      const data = await postStream<{ workflow: BuiltWorkflow["workflow"]; validation: BuiltWorkflow["validation"] }>(
        "/api/refine",
        { workflow: built.workflow, instruction: text, provider: conn?.provider, apiKey: conn?.apiKey, model: conn?.model, lang },
        (e) => setProgress((prev) => [...prev, e as unknown as Progress])
      );
      const updated: ProjectWorkflow = {
        ...built,
        workflow: data.workflow,
        validation: data.validation,
        ...(built.remote && { remote: { ...built.remote, outdated: true } }),
      };
      onReplace(updated);
      return updated;
    } catch (err) {
      setError(err instanceof ApiRequestError ? translateError(t, err.data, err.status) : t.errors.SERVER);
      return null;
    } finally {
      setRefining(false);
    }
  };

  const handleRefine = async () => {
    if (!instruction.trim() || refining) return;
    if (await runRefine(instruction.trim())) {
      setInstruction("");
      setRefined(true);
    }
  };

  // From a failed n8n run: fix, then update n8n so the run can be retried
  const fixFromRun = async (text: string): Promise<boolean> => {
    const updated = await runRefine(text);
    if (!updated) return false;
    return onPushAll ? onPushAll(updated) : true;
  };

  return (
    <div>
      <div className="border border-[#1e1e2e] bg-[#0d0d17] rounded-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-[#1e1e2e] bg-[#0a0a12]">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-2 h-2 rounded-full bg-[#28c840] shrink-0" />
            <span className="text-[#e8e6e0] text-xs font-bold truncate">{built.name}</span>
            <div className="flex border border-[#1e1e2e] rounded-sm overflow-hidden shrink-0" role="tablist">
              {(["diagram", "json"] as const).map((v) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1 text-[11px] font-bold tracking-widest transition-colors ${
                    view === v ? "bg-[#ff6b35]/15 text-[#ff6b35]" : "text-[#6b6b7b] hover:text-[#e8e6e0]"
                  }`}
                >
                  {v === "diagram" ? g.viewDiagram : g.viewJson}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {built.remote && (
              <a
                href={built.remote.url}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 text-xs text-[#28c840] hover:text-[#e8e6e0] border border-[#28c840]/40 hover:border-[#3a3a4a] rounded-sm transition-colors"
              >
                {t.n8n.open}
              </a>
            )}
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 text-xs text-[#6b6b7b] hover:text-[#e8e6e0] border border-[#1e1e2e] hover:border-[#3a3a4a] rounded-sm transition-colors"
            >
              {copied ? <span className="text-[#28c840]">{g.copied}</span> : g.copy}
            </button>
            <button
              onClick={() => downloadJson(built.name, built.workflow)}
              className="px-3 py-1.5 text-xs text-[#0a0a0f] bg-[#ff6b35] hover:bg-[#ff8555] rounded-sm transition-colors font-bold"
            >
              {g.download}
            </button>
          </div>
        </div>

        {isDemo && (
          <p className="px-4 py-2 border-b border-[#1e1e2e] text-[11px] text-[#febc2e] bg-[#febc2e]/5">{g.demoNotice}</p>
        )}
        {built.remote?.outdated && (
          <p className="px-4 py-2 border-b border-[#1e1e2e] text-[11px] text-[#febc2e] bg-[#febc2e]/5">⚠ {t.n8n.outdated}</p>
        )}

        {view === "diagram" ? (
          <WorkflowDiagram workflow={built.workflow} />
        ) : (
          <pre className="overflow-auto max-h-[480px] px-5 py-4 text-xs text-[#a8a59e] leading-relaxed scrollbar-thin">
            <code>{json}</code>
          </pre>
        )}

        <ValidationPanel validation={built.validation} />

        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-[#1e1e2e] bg-[#0a0a12] text-xs">
          <span>
            <span className="text-[#ff6b35] font-bold tabular-nums">{stats.nodes}</span> <span className="text-[#3a3a4a]">{g.nodes}</span>
          </span>
          <span>
            <span className="text-[#ff6b35] font-bold tabular-nums">{stats.connections}</span>{" "}
            <span className="text-[#3a3a4a]">{g.connections}</span>
          </span>
          <span>
            <span className="text-[#ff6b35] font-bold tabular-nums">{stats.bytes.toLocaleString()}</span>{" "}
            <span className="text-[#3a3a4a]">{g.bytes}</span>
          </span>
        </div>
      </div>

      {/* Change request */}
      <div className="mt-4 border border-[#1e1e2e] bg-[#0a0a12] rounded-sm px-4 py-3">
        <p className="text-[#6b6b7b] text-xs mb-2 tracking-widest uppercase">{r.refineTitle}</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            maxLength={2000}
            rows={2}
            placeholder={r.refinePlaceholder}
            className="input flex-1 resize-none leading-relaxed"
          />
          <button
            type="button"
            onClick={handleRefine}
            disabled={!instruction.trim() || refining}
            className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold tracking-widest uppercase text-[#0a0a0f] bg-[#ff6b35] hover:bg-[#ff8555] rounded-sm disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {refining && <Spinner />}
            {refining ? r.refining : r.refine}
          </button>
        </div>
        {refined && <p className="mt-2 text-[11px] text-[#28c840]">✓ {r.refined}</p>}
        {error && <p className="mt-2 text-[11px] text-[#ff5f57]">{error}</p>}
      </div>
      {refining && progress.length > 0 && (
        <div className="mt-4">
          <ProgressPanel events={progress} />
        </div>
      )}

      {built.remote && n8n && <ExecutionsPanel n8n={n8n} workflowId={built.remote.id} onFix={fixFromRun} />}
    </div>
  );
}
