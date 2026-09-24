"use client";

import Link from "next/link";
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Shell } from "@/components/Shell";
import { QuestionsPanel } from "@/components/QuestionsPanel";
import { SetupGuide } from "@/components/SetupGuide";
import { WorkflowDiagram } from "@/components/WorkflowDiagram";
import { activeConnection, loadApiConfig, needsKey, type Connection, type Provider } from "@/lib/apiConfig";
import type { ClarifyAnswer, ClarifyQuestion } from "@/lib/clarify";
import { translateError, useI18n } from "@/lib/i18n";

export default function Generator() {
  const { t, lang } = useI18n();
  const g = t.generator;
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  // Which request is running: fetching questions or generating the workflow
  const [busy, setBusy] = useState<"asking" | "generating" | null>(null);
  const loading = busy !== null;
  const [questions, setQuestions] = useState<ClarifyQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  // Request + answers the current result was built from (for the setup prompt)
  const [generatedFrom, setGeneratedFrom] = useState<{ request: string; answers: ClarifyAnswer[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Provider, key and model saved on the API page
  const [conn, setConn] = useState<(Connection & { provider: Provider }) | null>(null);
  const [view, setView] = useState<"diagram" | "json">("diagram");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // localStorage is only available after mount
  useEffect(() => setConn(activeConnection(loadApiConfig())), []);

  const postJson = useCallback(
    async (url: string, extra: Record<string, unknown>) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          provider: conn?.provider,
          apiKey: conn?.apiKey,
          model: conn?.model,
          lang,
          ...extra,
        }),
      });
      // Non-JSON responses (e.g. an HTML error page) would otherwise surface as a cryptic parse error
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(translateError(t, data, res.status));
      return data;
    },
    [prompt, conn, lang, t]
  );

  // Step 1: ask a few clarifying questions about the description
  const handleAsk = useCallback(async () => {
    if (!prompt.trim() || loading) return;
    setBusy("asking");
    setError(null);
    setQuestions(null);
    try {
      const data = await postJson("/api/clarify", {});
      setAnswers({});
      setQuestions(data.questions);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t.errors.SERVER);
    } finally {
      setBusy(null);
    }
  }, [prompt, loading, postJson, t]);

  // Step 2: generate, with whatever answers were given (none when skipped)
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || loading) return;
    const given: ClarifyAnswer[] = (questions ?? [])
      .map((q) => ({ question: q.question, answer: answers[q.id]?.trim() ?? "" }))
      .filter((a) => a.answer);
    setBusy("generating");
    setError(null);
    setResult(null);
    setCopied(false);
    try {
      const data = await postJson("/api/generate", { answers: given });
      setResult(JSON.stringify(data.workflow, null, 2));
      setIsDemo(data.demo === true);
      setGeneratedFrom({ request: prompt.trim(), answers: given });
      setQuestions(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t.errors.SERVER);
    } finally {
      setBusy(null);
    }
  }, [prompt, loading, questions, answers, postJson, t]);

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

  // Questions belong to the description they were asked about
  const updatePrompt = (value: string) => {
    setPrompt(value);
    setQuestions(null);
  };

  const handleExampleClick = (example: string) => {
    updatePrompt(example);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      handleAsk();
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
        {conn && (!needsKey(conn.provider) || !conn.apiKey) && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-2 border border-[#febc2e]/30 bg-[#febc2e]/5 rounded-sm px-4 py-3">
            <span className="text-[#febc2e] text-xs">{needsKey(conn.provider) ? g.noKeyBanner : g.demoBanner}</span>
            <Link href="/settings" className="text-xs font-bold text-[#ff6b35] hover:text-[#ff8555]">
              {needsKey(conn.provider) ? g.noKeyLink : g.demoLink}
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
                {conn && (!needsKey(conn.provider) || conn.apiKey) && (
                  <Link
                    href="/settings"
                    className="text-[11px] text-[#6b6b7b] hover:text-[#ff6b35] border border-[#1e1e2e] rounded-sm px-2 py-0.5"
                  >
                    {needsKey(conn.provider) ? (
                      <>
                        {t.settings.providers[conn.provider].label}: <span className="text-[#28c840]">{conn.model}</span>
                      </>
                    ) : (
                      <span className="text-[#febc2e]">{t.settings.providers.demo.label}</span>
                    )}
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
              onChange={(e) => updatePrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={1000}
              rows={5}
              placeholder={g.placeholder}
              className="w-full bg-transparent px-5 py-4 text-sm text-[#c8c5be] placeholder-[#3a3a4a] resize-none outline-none leading-relaxed"
            />

            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-t border-[#1e1e2e] bg-[#0a0a12]">
              <span className="text-[#3a3a4a] text-xs hidden sm:inline">{g.shortcut}</span>
              <div className="flex items-center gap-4 ml-auto">
                <button
                  onClick={handleGenerate}
                  disabled={!prompt.trim() || loading}
                  className="text-xs text-[#6b6b7b] hover:text-[#e8e6e0] underline-offset-4 hover:underline disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  {g.skipQuestions}
                </button>
                <button
                  onClick={handleAsk}
                  disabled={!prompt.trim() || loading}
                  className="flex items-center gap-2.5 px-5 py-2 bg-[#ff6b35] text-[#0a0a0f] text-xs font-bold tracking-widest uppercase rounded-sm hover:bg-[#ff8555] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150 active:scale-95"
                >
                  {busy === "asking" ? (
                    <>
                      <LoadingSpinner />
                      {g.asking}
                    </>
                  ) : busy === "generating" ? (
                    <>
                      <LoadingSpinner />
                      {g.generating}
                    </>
                  ) : (
                    <>
                      <span>▶</span>
                      {g.next}
                    </>
                  )}
                </button>
              </div>
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

        {/* Clarifying questions */}
        {questions && !loading && (
          <QuestionsPanel
            questions={questions}
            answers={answers}
            onAnswer={(id, value) => setAnswers((prev) => ({ ...prev, [id]: value }))}
            onGenerate={handleGenerate}
            onBack={() => {
              setQuestions(null);
              textareaRef.current?.focus();
            }}
            busy={loading}
          />
        )}

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
              <span className="text-[#ff6b35] text-xs tracking-widest uppercase">
                {busy === "asking" ? g.askingTitle : g.loadingTitle}
              </span>
            </div>
            <div className="space-y-2">
              {(busy === "asking" ? g.askingSteps : g.loadingSteps).map((step, i) => (
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

              {isDemo && (
                <p className="px-4 py-2 border-b border-[#1e1e2e] text-[11px] text-[#febc2e] bg-[#febc2e]/5">
                  {g.demoNotice}
                </p>
              )}

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

            {generatedFrom && (
              <SetupGuide workflow={workflow} request={generatedFrom.request} answers={generatedFrom.answers} />
            )}
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
