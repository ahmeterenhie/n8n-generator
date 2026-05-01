"use client";

import { useState, useRef, useCallback } from "react";

const EXAMPLE_PROMPTS = [
  "Webhook trigger → parse JSON body → send a Slack message with the data",
  "Every day at 9am, fetch top 10 posts from Reddit API and save titles to Google Sheets",
  "When a form is submitted via webhook, validate the email field, then add the contact to Airtable and send a confirmation email via Gmail",
];

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Server error: ${res.status}`);
      }

      setResult(JSON.stringify(data.workflow, null, 2));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }, [prompt, loading]);

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

  const handleExampleClick = (example: string) => {
    setPrompt(example);
    setCharCount(example.length);
    textareaRef.current?.focus();
  };

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
    setCharCount(e.target.value.length);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      handleGenerate();
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e6e0] font-mono">
      {/* Scanline overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-50 opacity-[0.03]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)",
        }}
      />

      {/* Grid background */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(#ff6b35 1px, transparent 1px), linear-gradient(90deg, #ff6b35 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-16 sm:px-6">
        {/* Header */}
        <header className="mb-14">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex gap-1.5">
              <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
              <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
              <span className="w-3 h-3 rounded-full bg-[#28c840]" />
            </div>
            <span className="text-[#4a4a5a] text-xs tracking-widest uppercase">
              n8n-forge v1.0.0
            </span>
          </div>

          <div className="border-l-2 border-[#ff6b35] pl-5">
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-[#f0ede6] leading-tight">
              Prompt →{" "}
              <span className="text-[#ff6b35]">n8n Workflow</span>
            </h1>
            <p className="mt-3 text-[#6b6b7b] text-sm leading-relaxed max-w-xl">
              Describe your automation in plain English. Get a production-ready
              n8n workflow JSON — importable in seconds.
            </p>
          </div>
        </header>

        {/* Input Section */}
        <section className="mb-8">
          <div className="border border-[#1e1e2e] bg-[#0d0d17] rounded-sm overflow-hidden focus-within:border-[#ff6b35] transition-colors duration-200">
            {/* Terminal bar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1e1e2e] bg-[#0a0a12]">
              <span className="text-[#4a4a5a] text-xs tracking-widest">
                DESCRIBE_YOUR_WORKFLOW.txt
              </span>
              <span
                className={`text-xs tabular-nums ${
                  charCount > 800 ? "text-[#ff5f57]" : "text-[#4a4a5a]"
                }`}
              >
                {charCount}/1000
              </span>
            </div>

            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={handlePromptChange}
              onKeyDown={handleKeyDown}
              maxLength={1000}
              rows={5}
              placeholder="e.g. Trigger via webhook, extract the email field, look it up in Airtable, and send a personalized reply via Gmail..."
              className="w-full bg-transparent px-5 py-4 text-sm text-[#c8c5be] placeholder-[#3a3a4a] resize-none outline-none leading-relaxed"
            />

            <div className="flex items-center justify-between px-4 py-2.5 border-t border-[#1e1e2e] bg-[#0a0a12]">
              <span className="text-[#3a3a4a] text-xs">
                ⌘ + Enter to generate
              </span>
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || loading}
                className="flex items-center gap-2.5 px-5 py-2 bg-[#ff6b35] text-[#0a0a0f] text-xs font-bold tracking-widest uppercase rounded-sm hover:bg-[#ff8555] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150 active:scale-95"
              >
                {loading ? (
                  <>
                    <LoadingSpinner />
                    GENERATING...
                  </>
                ) : (
                  <>
                    <span>▶</span>
                    GENERATE
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Examples */}
          <div className="mt-4">
            <p className="text-[#3a3a4a] text-xs mb-2.5 tracking-widest uppercase">
              — try an example
            </p>
            <div className="flex flex-col gap-1.5">
              {EXAMPLE_PROMPTS.map((ex, i) => (
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
              <span className="font-bold mr-2">ERROR:</span>
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
                Parsing intent...
              </span>
            </div>
            <div className="space-y-2">
              {["Identifying trigger nodes", "Mapping action nodes", "Wiring connections", "Validating JSON schema"].map(
                (step, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <span className="text-[#28c840] text-xs animate-pulse">
                      ▸
                    </span>
                    <span className="text-[#3a3a4a] text-xs">{step}</span>
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {/* Result */}
        {result && !loading && (
          <section>
            <div className="border border-[#1e1e2e] bg-[#0d0d17] rounded-sm overflow-hidden">
              {/* Result header */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1e1e2e] bg-[#0a0a12]">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#28c840] animate-pulse" />
                  <span className="text-[#28c840] text-xs tracking-widest">
                    WORKFLOW_GENERATED.json
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#6b6b7b] hover:text-[#e8e6e0] border border-[#1e1e2e] hover:border-[#3a3a4a] rounded-sm transition-all duration-150"
                  >
                    {copied ? (
                      <span className="text-[#28c840]">✓ COPIED</span>
                    ) : (
                      "COPY"
                    )}
                  </button>
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#0a0a0f] bg-[#ff6b35] hover:bg-[#ff8555] rounded-sm transition-all duration-150 font-bold"
                  >
                    ↓ DOWNLOAD
                  </button>
                </div>
              </div>

              {/* JSON display */}
              <pre className="overflow-auto max-h-[480px] px-5 py-4 text-xs text-[#a8a59e] leading-relaxed scrollbar-thin">
                <code>{result}</code>
              </pre>

              {/* Stats footer */}
              <div className="flex items-center gap-4 px-4 py-2.5 border-t border-[#1e1e2e] bg-[#0a0a12]">
                <Stat
                  label="nodes"
                  value={
                    (JSON.parse(result)?.nodes?.length ?? 0).toString()
                  }
                />
                <Stat
                  label="connections"
                  value={
                    Object.keys(
                      JSON.parse(result)?.connections ?? {}
                    ).length.toString()
                  }
                />
                <Stat
                  label="bytes"
                  value={new Blob([result]).size.toLocaleString()}
                />
              </div>
            </div>

            {/* Import instructions */}
            <div className="mt-4 border border-[#1e1e2e] bg-[#0a0a12] rounded-sm px-4 py-3">
              <p className="text-[#3a3a4a] text-xs mb-1.5 tracking-widest uppercase">
                — how to import
              </p>
              <ol className="text-[#4a4a5a] text-xs space-y-1">
                <li>
                  <span className="text-[#ff6b35] mr-2">[1]</span>Download the
                  .json file
                </li>
                <li>
                  <span className="text-[#ff6b35] mr-2">[2]</span>Open n8n →
                  Workflows → Import from File
                </li>
                <li>
                  <span className="text-[#ff6b35] mr-2">[3]</span>Select the
                  downloaded file
                </li>
                <li>
                  <span className="text-[#ff6b35] mr-2">[4]</span>Configure
                  credentials for each node
                </li>
              </ol>
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="mt-16 pt-6 border-t border-[#1a1a24]">
          <p className="text-[#2a2a3a] text-xs text-center">
            n8n-forge · powered by OpenAI · review all generated workflows before
            deploying to production
          </p>
        </footer>
      </div>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <svg
      className="animate-spin w-3.5 h-3.5"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[#ff6b35] text-xs tabular-nums font-bold">
        {value}
      </span>
      <span className="text-[#3a3a4a] text-xs">{label}</span>
    </div>
  );
}
