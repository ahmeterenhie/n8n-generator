"use client";

import { useCallback, useEffect, useState } from "react";
import { Spinner } from "@/components/ProgressPanel";
import { ApiRequestError, postJson } from "@/lib/apiClient";
import { translateError, useI18n } from "@/lib/i18n";
import type { N8nSettings } from "@/lib/n8nConfig";
import type { ExecutionSummary } from "@/lib/projectTypes";

const STATUS_COLOR: Record<string, string> = {
  success: "#28c840",
  error: "#ff5f57",
  crashed: "#ff5f57",
  running: "#febc2e",
  waiting: "#febc2e",
};

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");
}

/**
 * Recent runs of a workflow in n8n. A failed run can be fixed (its error goes
 * to the model as a change request, then n8n is updated) and retried with the
 * same input.
 */
export function ExecutionsPanel({
  n8n,
  workflowId,
  onFix,
}: {
  n8n: N8nSettings;
  workflowId: string;
  /** Applies a change from the error and updates n8n; resolves true on success */
  onFix: (instruction: string) => Promise<boolean>;
}) {
  const { t, lang } = useI18n();
  const s = t.n8n;
  const [executions, setExecutions] = useState<ExecutionSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fixing, setFixing] = useState<string | null>(null);
  const [fixed, setFixed] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [retryResult, setRetryResult] = useState<string | null>(null);

  const explain = useCallback(
    (err: unknown) => (err instanceof ApiRequestError ? translateError(t, err.data, err.status) : t.errors.SERVER),
    [t]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await postJson<{ executions: ExecutionSummary[] }>("/api/n8n/executions", { n8n, workflowId });
      setExecutions(data.executions);
    } catch (err) {
      setError(explain(err));
    } finally {
      setLoading(false);
    }
  }, [n8n, workflowId, explain]);

  useEffect(() => {
    load();
  }, [load]);

  const fix = async (e: ExecutionSummary) => {
    if (!e.error) return;
    setFixing(e.id);
    setFixed(null);
    setRetryResult(null);
    const instruction = fill(s.fixInstruction, {
      node: e.error.node ?? "?",
      message: e.error.message,
      description: e.error.description ?? "",
    })
      .replace(/\s+/g, " ")
      .trim();
    if (await onFix(instruction)) setFixed(e.id);
    setFixing(null);
  };

  const retry = async (e: ExecutionSummary) => {
    setRetrying(e.id);
    setError(null);
    try {
      const data = await postJson<{ execution: ExecutionSummary }>("/api/n8n/retry", { n8n, executionId: e.id });
      const label = s.status[data.execution.status as keyof typeof s.status] ?? data.execution.status;
      setRetryResult(fill(s.retried, { status: label }));
      await load();
    } catch (err) {
      setError(explain(err));
    } finally {
      setRetrying(null);
    }
  };

  const formatTime = (iso?: string) =>
    iso ? new Date(iso).toLocaleString(lang === "tr" ? "tr-TR" : "en-GB", { dateStyle: "short", timeStyle: "medium" }) : "";

  return (
    <div className="mt-4 border border-[#1e1e2e] bg-[#0a0a12] rounded-sm px-4 py-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[#6b6b7b] text-xs tracking-widest uppercase">— {s.executions}</p>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-[11px] text-[#6b6b7b] hover:text-[#ff6b35] disabled:opacity-40"
        >
          {loading && <Spinner />} {s.refresh}
        </button>
      </div>

      {executions && executions.length === 0 && <p className="text-[11px] text-[#8b8b9b]">{s.none}</p>}

      {executions && executions.length > 0 && (
        <ul className="space-y-2">
          {executions.map((e) => {
            const color = STATUS_COLOR[e.status] ?? "#8b8b9b";
            const failed = e.status === "error" || e.status === "crashed";
            return (
              <li key={e.id} className="border border-[#1e1e2e] rounded-sm px-3 py-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                  <span className="font-bold" style={{ color }}>
                    ● {s.status[e.status as keyof typeof s.status] ?? e.status}
                  </span>
                  <span className="text-[#6b6b7b]">#{e.id}</span>
                  <span className="text-[#6b6b7b]">{formatTime(e.startedAt)}</span>
                  {e.mode && <span className="text-[#4a4a5a]">{e.mode}</span>}
                </div>
                {e.error && (
                  <p className="mt-1.5 text-[11px] text-[#c8c5be] leading-relaxed">
                    {e.error.node && (
                      <span className="text-[#ff5f57]">
                        {s.failedAt}: {e.error.node} —{" "}
                      </span>
                    )}
                    {e.error.message}
                    {e.error.description && <span className="text-[#8b8b9b]"> {e.error.description}</span>}
                  </p>
                )}
                {failed && e.error && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fix(e)}
                      disabled={!!fixing || !!retrying}
                      className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold tracking-wider text-[#0a0a0f] bg-[#ff6b35] hover:bg-[#ff8555] rounded-sm disabled:opacity-40"
                    >
                      {fixing === e.id && <Spinner />}
                      {fixing === e.id ? s.fixing : s.fix}
                    </button>
                    {fixed === e.id && (
                      <button
                        type="button"
                        onClick={() => retry(e)}
                        disabled={!!retrying}
                        className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold tracking-wider text-[#e8e6e0] border border-[#3a3a4a] hover:border-[#ff6b35] rounded-sm disabled:opacity-40"
                      >
                        {retrying === e.id && <Spinner />}
                        {retrying === e.id ? s.retrying : s.retry}
                      </button>
                    )}
                  </div>
                )}
                {fixed === e.id && !retryResult && <p className="mt-1.5 text-[11px] text-[#28c840]">✓ {s.fixed}</p>}
              </li>
            );
          })}
        </ul>
      )}

      {retryResult && <p className="mt-2 text-[11px] text-[#e8e6e0]">{retryResult}</p>}
      {error && <p className="mt-2 text-[11px] text-[#ff5f57]">{error}</p>}
      <p className="mt-2 text-[10px] text-[#4a4a5a] leading-relaxed">{s.manualNote}</p>
    </div>
  );
}
