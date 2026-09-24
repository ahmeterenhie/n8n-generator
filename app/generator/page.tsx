"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { PlanPanel } from "@/components/PlanPanel";
import { ProgressPanel, Spinner } from "@/components/ProgressPanel";
import { ProjectResult } from "@/components/ProjectResult";
import { QuestionsPanel } from "@/components/QuestionsPanel";
import { Shell } from "@/components/Shell";
import { ApiRequestError, postJson, postStream } from "@/lib/apiClient";
import { activeConnection, loadApiConfig, needsKey, type Connection, type Provider } from "@/lib/apiConfig";
import { MAX_CLARIFY_ROUNDS, type ClarifyAnswer, type ClarifyQuestion } from "@/lib/clarify";
import { translateError, useI18n } from "@/lib/i18n";
import { loadN8n, type N8nSettings } from "@/lib/n8nConfig";
import type { BuiltWorkflow, Progress } from "@/lib/pipeline";
import type { Plan } from "@/lib/plan";
import type { ProjectWorkflow } from "@/lib/projectTypes";

// Flow: describe → questions (rounds) → plan (review, edit, approve) → build (streamed) → result.
// "Generate directly" skips questions and plan review; an uploaded JSON goes straight to the result.

type Stage = "describe" | "questions" | "plan" | "building" | "result";
type Busy = null | "asking" | "planning" | "revising" | "building" | "uploading";

interface ProjectState {
  workflows: ProjectWorkflow[];
  demo: boolean;
  request: string;
  answers: ClarifyAnswer[];
  plan?: Plan | null;
}

// useSearchParams needs a Suspense boundary
export default function GeneratorPage() {
  return (
    <Suspense>
      <Generator />
    </Suspense>
  );
}

function Generator() {
  const { t, lang } = useI18n();
  const g = t.generator;
  const [conn, setConn] = useState<(Connection & { provider: Provider }) | null>(null);
  const [prompt, setPrompt] = useState("");
  const [stage, setStage] = useState<Stage>("describe");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  const [round, setRound] = useState(1);
  const [questions, setQuestions] = useState<ClarifyQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  // Every question asked in earlier rounds, with its answer ("" = skipped)
  const [history, setHistory] = useState<ClarifyAnswer[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [project, setProject] = useState<ProjectState | null>(null);
  // Saved project (history) the current result belongs to
  const [projectId, setProjectId] = useState<string | null>(null);
  const [n8n, setN8n] = useState<N8nSettings | null>(null);
  const searchParams = useSearchParams();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // localStorage is only available after mount
  useEffect(() => {
    setConn(activeConnection(loadApiConfig()));
    setN8n(loadN8n());
  }, []);

  // Open a saved project: /generator?project=<id>
  const openId = searchParams.get("project");
  useEffect(() => {
    if (!openId) return;
    fetch(`/api/projects/${encodeURIComponent(openId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.project) return;
        const p = data.project;
        setPrompt(p.request ?? "");
        setProject({ workflows: p.workflows, demo: p.demo === true, request: p.request, answers: p.answers ?? [], plan: p.plan });
        setProjectId(p.id);
        setStage("result");
      })
      .catch(() => {});
  }, [openId]);

  // Keep the history copy up to date after every change (build, refine, push, upload)
  useEffect(() => {
    if (!project) return;
    const timer = setTimeout(() => {
      postJson<{ id: string }>("/api/projects", { id: projectId ?? undefined, ...project })
        .then((data) => setProjectId(data.id))
        .catch(() => {}); // history is a convenience; the result stays on screen
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- save when the project changes, not when the id is set
  }, [project]);

  const connBody = { provider: conn?.provider, apiKey: conn?.apiKey, model: conn?.model, lang };

  const fail = useCallback(
    (err: unknown) => setError(err instanceof ApiRequestError ? translateError(t, err.data, err.status) : t.errors.SERVER),
    [t]
  );

  /** Questions of the current round with the answers given so far. */
  const currentRound = (): ClarifyAnswer[] => questions.map((q) => ({ question: q.question, answer: answers[q.id]?.trim() ?? "" }));

  const makePlan = async (answered: ClarifyAnswer[], revision?: { plan: Plan; feedback: string }) => {
    setBusy(revision ? "revising" : "planning");
    setError(null);
    try {
      const data = await postJson<{ plan: Plan }>("/api/plan", {
        prompt: prompt.trim(),
        answers: answered,
        ...(revision && { plan: revision.plan, feedback: revision.feedback }),
        ...connBody,
      });
      setPlan(data.plan);
      setStage("plan");
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  };

  const ask = async (nextRound: number, asked: ClarifyAnswer[]) => {
    setBusy("asking");
    setError(null);
    try {
      const data = await postJson<{ done: boolean; questions: ClarifyQuestion[] }>("/api/clarify", {
        prompt: prompt.trim(),
        history: asked,
        round: nextRound,
        ...connBody,
      });
      if (data.done || !data.questions.length) {
        setBusy(null);
        await makePlan(asked);
        return;
      }
      setRound(nextRound);
      setQuestions(data.questions);
      setAnswers({});
      setStage("questions");
    } catch (err) {
      fail(err);
    } finally {
      setBusy((b) => (b === "asking" ? null : b));
    }
  };

  const start = () => {
    if (!prompt.trim() || busy) return;
    setHistory([]);
    setPlan(null);
    ask(1, []);
  };

  const continueQuestions = () => {
    const asked = [...history, ...currentRound()];
    setHistory(asked);
    ask(round + 1, asked);
  };

  const enoughQuestions = () => {
    const asked = [...history, ...currentRound()];
    setHistory(asked);
    makePlan(asked);
  };

  const build = async (approved: Plan | null) => {
    setBusy("building");
    setError(null);
    setProgress([]);
    setStage("building");
    const asked = approved ? history : [];
    try {
      const data = await postStream<{ workflows: BuiltWorkflow[]; demo?: boolean }>(
        "/api/generate",
        { prompt: prompt.trim(), answers: asked, ...(approved && { plan: approved }), ...connBody },
        (e) => setProgress((prev) => [...prev, e as unknown as Progress])
      );
      setProjectId(null); // a new build is a new project
      setProject({
        workflows: data.workflows,
        demo: data.demo === true,
        request: prompt.trim(),
        answers: asked.filter((a) => a.answer),
        plan: approved,
      });
      setStage("result");
    } catch (err) {
      fail(err);
      setStage(approved ? "plan" : "describe");
    } finally {
      setBusy(null);
    }
  };

  const generateDirectly = () => {
    if (!prompt.trim() || busy) return;
    setHistory([]);
    setPlan(null);
    build(null);
  };

  const upload = async (file: File) => {
    setBusy("uploading");
    setError(null);
    try {
      const workflow = JSON.parse(await file.text());
      const data = await postJson<{ workflow: BuiltWorkflow["workflow"]; validation: BuiltWorkflow["validation"] }>(
        "/api/validate",
        { workflow }
      );
      const name = typeof data.workflow.name === "string" ? data.workflow.name : file.name.replace(/\.json$/i, "");
      setProjectId(null);
      setProject({
        workflows: [{ key: "uploaded", name, role: "main", workflow: data.workflow, validation: data.validation }],
        demo: false,
        request: name,
        answers: [],
      });
      setStage("result");
    } catch (err) {
      if (err instanceof ApiRequestError) fail(err);
      else setError(g.uploadInvalid);
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // Questions and plan belong to the description they were made for
  const updatePrompt = (value: string) => {
    setPrompt(value);
    if (stage === "questions" || stage === "plan") setStage("describe");
  };

  const reset = () => {
    setStage("describe");
    setProject(null);
    setProjectId(null);
    setPlan(null);
    setHistory([]);
    setPrompt("");
    setError(null);
    textareaRef.current?.focus();
  };

  const loading = busy !== null;

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

        {/* Description */}
        <section className="mb-8">
          <div className="border border-[#1e1e2e] bg-[#0d0d17] rounded-sm overflow-hidden focus-within:border-[#ff6b35] transition-colors duration-200">
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
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") start();
              }}
              maxLength={1000}
              rows={5}
              placeholder={g.placeholder}
              className="w-full bg-transparent px-5 py-4 text-sm text-[#c8c5be] placeholder-[#3a3a4a] resize-none outline-none leading-relaxed"
            />

            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-t border-[#1e1e2e] bg-[#0a0a12]">
              <span className="text-[#3a3a4a] text-xs hidden sm:inline">{g.shortcut}</span>
              <div className="flex items-center gap-4 ml-auto">
                <button
                  onClick={generateDirectly}
                  disabled={!prompt.trim() || loading}
                  className="text-xs text-[#6b6b7b] hover:text-[#e8e6e0] underline-offset-4 hover:underline disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  {g.skipQuestions}
                </button>
                <button
                  onClick={start}
                  disabled={!prompt.trim() || loading}
                  className="flex items-center gap-2.5 px-5 py-2 bg-[#ff6b35] text-[#0a0a0f] text-xs font-bold tracking-widest uppercase rounded-sm hover:bg-[#ff8555] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150 active:scale-95"
                >
                  {busy === "asking" || busy === "planning" ? (
                    <>
                      <Spinner />
                      {g.asking}
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

          {/* Examples and upload */}
          {stage === "describe" && (
            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-[#3a3a4a] text-xs mb-2.5 tracking-widest uppercase">{g.tryExample}</p>
                <div className="flex flex-col gap-1.5">
                  {g.examples.map((ex, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        updatePrompt(ex);
                        textareaRef.current?.focus();
                      }}
                      className="text-left text-xs text-[#4a4a6a] hover:text-[#ff6b35] transition-colors duration-150 truncate"
                    >
                      <span className="text-[#2a2a3a] mr-2">{`[${i + 1}]`}</span>
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
              <div className="shrink-0">
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) upload(file);
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={loading}
                  className="flex items-center gap-2 text-xs text-[#6b6b7b] hover:text-[#ff6b35] border border-dashed border-[#2a2a3a] hover:border-[#ff6b35] rounded-sm px-3 py-2 disabled:opacity-30 transition-colors"
                >
                  {busy === "uploading" ? <Spinner /> : "⤒"} {g.upload}
                </button>
              </div>
            </div>
          )}
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

        {/* Waiting for questions or the plan */}
        {(busy === "asking" || busy === "planning") && (
          <div className="mb-6 border border-[#1e1e2e] bg-[#0d0d17] rounded-sm px-5 py-6">
            <div className="flex items-center gap-3 mb-4 text-[#ff6b35]">
              <Spinner />
              <span className="text-xs tracking-widest uppercase">{busy === "asking" ? g.askingTitle : g.planningTitle}</span>
            </div>
            <div className="space-y-2">
              {(busy === "asking" ? g.askingSteps : g.planningSteps).map((step, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <span className="text-[#28c840] text-xs animate-pulse">▸</span>
                  <span className="text-[#3a3a4a] text-xs">{step}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {stage === "questions" && busy !== "asking" && busy !== "planning" && (
          <QuestionsPanel
            questions={questions}
            answers={answers}
            round={round}
            maxRounds={MAX_CLARIFY_ROUNDS}
            onAnswer={(id, value) => setAnswers((prev) => ({ ...prev, [id]: value }))}
            onContinue={continueQuestions}
            onEnough={enoughQuestions}
            onBack={() => {
              setStage("describe");
              textareaRef.current?.focus();
            }}
            busy={loading}
          />
        )}

        {stage === "plan" && plan && busy !== "planning" && (
          <PlanPanel
            plan={plan}
            onChange={setPlan}
            onApprove={() => build(plan)}
            onRevise={(feedback) => makePlan(history, { plan, feedback })}
            onBack={() => setStage(questions.length ? "questions" : "describe")}
            busy={loading}
            revising={busy === "revising"}
          />
        )}

        {stage === "building" && <ProgressPanel events={progress} />}

        {stage === "result" && project && (
          <>
            <div className="mb-3 flex justify-end">
              <button type="button" onClick={reset} className="text-xs text-[#6b6b7b] hover:text-[#ff6b35]">
                {g.newRequest}
              </button>
            </div>
            <ProjectResult
              workflows={project.workflows}
              isDemo={project.demo}
              request={project.request}
              answers={project.answers}
              conn={conn}
              n8n={n8n}
              onReplace={(index, updated) =>
                setProject((p) => (p ? { ...p, workflows: p.workflows.map((w, i) => (i === index ? updated : w)) } : p))
              }
              onReplaceAll={(updated) => setProject((p) => (p ? { ...p, workflows: updated } : p))}
            />
          </>
        )}
      </div>
    </Shell>
  );
}
