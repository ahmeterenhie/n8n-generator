"use client";

import Link from "next/link";
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Shell } from "@/components/Shell";
import { WorkflowDiagram } from "@/components/WorkflowDiagram";
import { loadApiConfig, type ApiConfig } from "@/lib/apiConfig";
import { translateError, useI18n } from "@/lib/i18n";

export default function Generator() {
  const { t } = useI18n();
  const g = t.generator;
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [config, setConfig] = useState<ApiConfig | null>(null);
  const [view, setView] = useState<"diagram" | "json">("diagram");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // localStorage is only available after mount
  useEffect(() => setConfig(loadApiConfig()), []);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setCopied(false);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), apiKey: config?.apiKey, model: config?.model }),
      });

      // Non-JSON responses (e.g. an HTML error page) would otherwise surface as a cryptic parse error
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(translateError(t, data, res.status));
      }

      setResult(JSON.stringify(data.workflow, null, 2));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t.errors.SERVER);
    } finally {
      setLoading(false);
    }
  }, [prompt, loading, config, t]);

  const handleCopy = useCallback(async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [result]);

  const handleDownload = useCallback(() => {
    if (!result) return;
    const blob = new Blob([result], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `n8n-workflow-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  const workflow = useMemo(() => (result ? (JSON.parse(result) as Record<string, unknown>) : null), [result]);

  const stats = useMemo(() => {
    if (!result || !workflow) return null;
    const parsed = workflow as { nodes?: unknown[]; connections?: object };
    return {
      nodes: parsed?.nodes?.length ?? 0,
      connections: Object.keys(parsed?.connections ?? {}).length,
      bytes: new Blob([result]).size,
    };
  }, [result, workflow]);

  const handleExampleClick = (example: string) => {
    setPrompt(example);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      handleGenerate();
    }
  };

  return (
    <Shell variant="app">
      <div className="py-12">
        {/* Header */}
        <header className="mb-10">
          <div className="border-l-2 border-[#ff6b35] pl-5">
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-[#f0ede6] leading-tight">
              {g.title} <span className="text-[#ff6b35]">{g.titleAccent}</span>
            </h1>
            <p className="mt-3 text-[#6b6b7b] text-sm leading-relaxed max-w-xl">{g.subtitle}</p>
          </div>
        </header>

        {/* API connection status */}
        {config && !config.apiKey && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-2 border border-[#febc2e]/30 bg-[#febc2e]/5 rounded-sm px-4 py-3">
            <span className="text-[#febc2e] text-xs">{g.noKeyBanner}</span>
            <Link href="/settings" className="text-xs font-bold text-[#ff6b35] hover:text-[#ff8555]">
              {g.noKeyLink}
            </Link>
          </div>
        )}

        {/* Input Section */}
        <section className="mb-8">
          <div className="border border-[#1e1e2e] bg-[#0d0d17] rounded-sm overflow-hidden focus-within:border-[#ff6b35] transition-colors duration-200">
            {/* Terminal bar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1e1e2e] bg-[#0a0a12]">
              <span className="text-[#4a4a5a] text-xs tracking-widest">{g.fileLabel}</span>
              <div className="flex items-center gap-3">
                {config?.apiKey && (
                  <Link
                    href="/settings"
                    className="text-[11px] text-[#6b6b7b] hover:text-[#ff6b35] border border-[#1e1e2e] rounded-sm px-2 py-0.5"
                  >
                    {g.modelChip}: <span className="text-[#28c840]">{config.model}</span>
                  </Link>
                )}
                <span className={`text-xs tabular-nums ${prompt.length > 800 ? "text-[#ff5f57]" : "text-[#4a4a5a]"}`}>
                  {prompt.length}/1000
                </span>
              </div>
            </div>

            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={1000}
              rows={5}
              placeholder={g.placeholder}
              className="w-full bg-transparent px-5 py-4 text-sm text-[#c8c5be] placeholder-[#3a3a4a] resize-none outline-none leading-relaxed"
            />

            <div className="flex items-center justify-between px-4 py-2.5 border-t border-[#1e1e2e] bg-[#0a0a12]">
              <span className="text-[#3a3a4a] text-xs">{g.shortcut}</span>
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || loading}
                className="flex items-center gap-2.5 px-5 py-2 bg-[#ff6b35] text-[#0a0a0f] text-xs font-bold tracking-widest uppercase rounded-sm hover:bg-[#ff8555] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150 active:scale-95"
              >
                {loading ? (
                  <>
                    <LoadingSpinner />
                    {g.generating}
                  </>
                ) : (
                  <>
                    <span>▶</span>
                    {g.generate}
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Examples */}
          <div className="mt-4">
            <p className="text-[#3a3a4a] text-xs mb-2.5 tracking-widest uppercase">{g.tryExample}</p>
            <div className="flex flex-col gap-1.5">
              {g.examples.map((ex, i) => (
                <button
                  key={i}
                  onClick={() => handleExampleClick(ex)}
                  className="text-left text-xs text-[#4a4a6a] hover:text-[#ff6b35] transition-colors duration-150 truncate"
                >
                  <span className="text-[#2a2a3a] mr-2">{`[${i + 1}]`}</span>
                  {ex}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Error */}
        {error && (
          <div className="mb-6 border border-[#ff5f57]/40 bg-[#ff5f57]/5 rounded-sm px-4 py-3">
            <p className="text-[#ff5f57] text-xs">
              <span className="font-bold mr-2">{g.error}</span>
              {error}
            </p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="mb-6 border border-[#1e1e2e] bg-[#0d0d17] rounded-sm px-5 py-6">
            <div className="flex items-center gap-3 mb-4">
              <LoadingSpinner />
              <span className="text-[#ff6b35] text-xs tracking-widest uppercase">{g.loadingTitle}</span>
            </div>
            <div className="space-y-2">
              {g.loadingSteps.map((step, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <span className="text-[#28c840] text-xs animate-pulse">▸</span>
                  <span className="text-[#3a3a4a] text-xs">{step}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Result */}
        {result && workflow && stats && !loading && (
          <section>
            <div className="border border-[#1e1e2e] bg-[#0d0d17] rounded-sm overflow-hidden">
              {/* Result header */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-[#1e1e2e] bg-[#0a0a12]">
                <div className="flex items-center gap-3">
                  <span className="hidden sm:flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#28c840] animate-pulse" />
                    <span className="text-[#28c840] text-xs tracking-widest">{g.resultLabel}</span>
                  </span>
                  <div className="flex border border-[#1e1e2e] rounded-sm overflow-hidden" role="tablist">
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
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#6b6b7b] hover:text-[#e8e6e0] border border-[#1e1e2e] hover:border-[#3a3a4a] rounded-sm transition-all duration-150"
                  >
                    {copied ? <span className="text-[#28c840]">{g.copied}</span> : g.copy}
                  </button>
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#0a0a0f] bg-[#ff6b35] hover:bg-[#ff8555] rounded-sm transition-all duration-150 font-bold"
                  >
                    {g.download}
                  </button>
                </div>
              </div>

              {view === "diagram" ? (
                <WorkflowDiagram workflow={workflow} />
              ) : (
                <pre className="overflow-auto max-h-[480px] px-5 py-4 text-xs text-[#a8a59e] leading-relaxed scrollbar-thin">
                  <code>{result}</code>
                </pre>
              )}

              {/* Stats footer */}
              <div className="flex items-center gap-4 px-4 py-2.5 border-t border-[#1e1e2e] bg-[#0a0a12]">
                <Stat label={g.nodes} value={stats.nodes.toString()} />
                <Stat label={g.connections} value={stats.connections.toString()} />
                <Stat label={g.bytes} value={stats.bytes.toLocaleString()} />
              </div>
            </div>

            {/* Import instructions */}
            <div className="mt-4 border border-[#1e1e2e] bg-[#0a0a12] rounded-sm px-4 py-3">
              <p className="text-[#3a3a4a] text-xs mb-1.5 tracking-widest uppercase">{g.howToImport}</p>
              <ol className="text-[#4a4a5a] text-xs space-y-1">
                {g.importSteps.map((step, i) => (
                  <li key={i}>
                    <span className="text-[#ff6b35] mr-2">{`[${i + 1}]`}</span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          </section>
        )}
      </div>
    </Shell>
  );
}

function LoadingSpinner() {
  return (
    <svg className="animate-spin w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[#ff6b35] text-xs tabular-nums font-bold">{value}</span>
      <span className="text-[#3a3a4a] text-xs">{label}</span>
    </div>
  );
}
