"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Spinner } from "@/components/ProgressPanel";
import { SetupGuide } from "@/components/SetupGuide";
import { WorkflowCard, downloadJson } from "@/components/WorkflowCard";
import { ApiRequestError, postJson } from "@/lib/apiClient";
import type { Connection, Provider } from "@/lib/apiConfig";
import type { ClarifyAnswer } from "@/lib/clarify";
import { translateError, useI18n } from "@/lib/i18n";
import type { N8nSettings } from "@/lib/n8nConfig";
import type { BuiltWorkflow } from "@/lib/pipeline";
import type { ProjectWorkflow } from "@/lib/projectTypes";

const ROLE_COLOR: Record<BuiltWorkflow["role"], string> = { main: "#ff6b35", sub: "#5b9dff", error: "#ff5f57" };

interface Pushed {
  key: string;
  id: string;
  url: string;
  workflow: Record<string, unknown>;
}

/** All workflows of a generated system, one tab each, sending to n8n, and the setup prompt. */
export function ProjectResult({
  workflows,
  isDemo,
  request,
  answers,
  conn,
  n8n,
  onReplace,
  onReplaceAll,
}: {
  workflows: ProjectWorkflow[];
  isDemo: boolean;
  request: string;
  answers: ClarifyAnswer[];
  conn: (Connection & { provider: Provider }) | null;
  n8n: N8nSettings | null;
  onReplace: (index: number, updated: ProjectWorkflow) => void;
  onReplaceAll: (updated: ProjectWorkflow[]) => void;
}) {
  const { t } = useI18n();
  const s = t.n8n;
  const [active, setActive] = useState(0);
  const [pushing, setPushing] = useState(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  // Async steps (fix → push) must send the newest workflows, not the ones from an older render
  const latest = useRef(workflows);
  latest.current = workflows;

  const current = workflows[Math.min(active, workflows.length - 1)];
  const pushedBefore = workflows.some((w) => w.remote);

  // Browsers may ask once to allow several downloads
  const downloadAll = async () => {
    for (const w of workflows) {
      downloadJson(w.name, w.workflow);
      await new Promise((r) => setTimeout(r, 400));
    }
  };

  /** Creates or updates every workflow in n8n; links sub-workflows and the error workflow. */
  const pushAll = async (override?: ProjectWorkflow): Promise<boolean> => {
    if (!n8n) return false;
    setPushing(true);
    setPushError(null);
    setPushMessage(null);
    const items = latest.current.map((w) => (override && w.key === override.key ? override : w));
    try {
      const { pushed } = await postJson<{ pushed: Pushed[] }>("/api/n8n/push", {
        n8n,
        workflows: items.map((w) => ({ key: w.key, name: w.name, role: w.role, workflow: w.workflow, remoteId: w.remote?.id })),
      });
      const now = new Date().toISOString();
      // Linking filled in ids, so check the sent versions again (no AI call)
      const updated = await Promise.all(
        items.map(async (w) => {
          const p = pushed.find((x) => x.key === w.key);
          if (!p) return w;
          const checked = await postJson<{ workflow: ProjectWorkflow["workflow"]; validation: ProjectWorkflow["validation"] }>(
            "/api/validate",
            { workflow: p.workflow }
          ).catch(() => ({ workflow: p.workflow, validation: w.validation }));
          return { ...w, workflow: checked.workflow, validation: checked.validation, remote: { id: p.id, url: p.url, pushedAt: now } };
        })
      );
      onReplaceAll(updated);
      setPushMessage(`${s.pushed}.${items.length > 1 ? ` ${s.linked}` : ""} ${s.nextSteps}`);
      return true;
    } catch (err) {
      setPushError(err instanceof ApiRequestError ? translateError(t, err.data, err.status) : t.errors.SERVER);
      return false;
    } finally {
      setPushing(false);
    }
  };

  return (
    <section>
      {/* n8n */}
      {!isDemo && (
        <div className="mb-4 border border-[#1e1e2e] bg-[#0a0a12] rounded-sm px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[#6b6b7b] text-xs tracking-widest uppercase">{s.panelTitle}</p>
            {n8n ? (
              <button
                type="button"
                onClick={() => pushAll()}
                disabled={pushing}
                className="flex items-center gap-2 px-4 py-1.5 text-xs font-bold tracking-widest text-[#0a0a0f] bg-[#28c840] hover:bg-[#3ddc55] rounded-sm disabled:opacity-40 transition-colors"
              >
                {pushing && <Spinner />}
                {pushing ? s.pushing : pushedBefore ? s.update : s.push}
              </button>
            ) : (
              <Link href="/settings" className="text-xs font-bold text-[#ff6b35] hover:text-[#ff8555]">
                {s.connect}
              </Link>
            )}
          </div>
          {!n8n && <p className="mt-1.5 text-[11px] text-[#8b8b9b]">{s.connectHint}</p>}
          {pushMessage && <p className="mt-2 text-[11px] text-[#28c840] leading-relaxed">✓ {pushMessage}</p>}
          {pushError && <p className="mt-2 text-[11px] text-[#ff5f57]">{pushError}</p>}
        </div>
      )}

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
          n8n={n8n}
          onReplace={(updated) => onReplace(workflows.indexOf(current), updated)}
          onPushAll={n8n ? pushAll : undefined}
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
