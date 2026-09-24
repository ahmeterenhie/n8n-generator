"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import {
  DEFAULT_MODEL,
  MODEL_OPTIONS,
  clearApiConfig,
  loadApiConfig,
  maskKey,
  saveApiConfig,
} from "@/lib/apiConfig";
import { translateError, useI18n } from "@/lib/i18n";

type TestState = { kind: "idle" } | { kind: "testing" } | { kind: "ok"; model: string } | { kind: "error"; message: string };

const CUSTOM = "__custom__";

export default function Settings() {
  const { t } = useI18n();
  const s = t.settings;
  const [apiKey, setApiKey] = useState("");
  const [savedKey, setSavedKey] = useState("");
  const [modelChoice, setModelChoice] = useState<string>(DEFAULT_MODEL);
  const [customModel, setCustomModel] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [test, setTest] = useState<TestState>({ kind: "idle" });
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    const config = loadApiConfig();
    setApiKey(config.apiKey);
    setSavedKey(config.apiKey);
    if ((MODEL_OPTIONS as readonly string[]).includes(config.model)) {
      setModelChoice(config.model);
    } else {
      setModelChoice(CUSTOM);
      setCustomModel(config.model);
    }
  }, []);

  const model = modelChoice === CUSTOM ? customModel.trim() : modelChoice;

  const handleTest = async () => {
    setTest({ kind: "testing" });
    try {
      const res = await fetch("/api/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim(), model }),
      });
      const data = await res.json().catch(() => ({}));
      setTest(res.ok ? { kind: "ok", model: data.model } : { kind: "error", message: translateError(t, data, res.status) });
    } catch {
      setTest({ kind: "error", message: t.errors.SERVER });
    }
  };

  const handleSave = () => {
    saveApiConfig({ apiKey: apiKey.trim(), model: model || DEFAULT_MODEL });
    setSavedKey(apiKey.trim());
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  };

  const handleRemove = () => {
    clearApiConfig();
    setApiKey("");
    setSavedKey("");
    setTest({ kind: "idle" });
  };

  return (
    <Shell variant="app">
      <div className="py-12 max-w-2xl">
        <header className="mb-8 border-l-2 border-[#ff6b35] pl-5">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#f0ede6]">{s.title}</h1>
          <p className="mt-2 text-sm text-[#6b6b7b] leading-relaxed">{s.subtitle}</p>
        </header>

        <div className="border border-[#1e1e2e] bg-[#0d0d17] rounded-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1e1e2e] bg-[#0a0a12]">
            <span className="text-[#4a4a5a] text-xs tracking-widest">OPENAI_CONNECTION.env</span>
            <span className="flex items-center gap-2 text-xs">
              <span className={`w-2 h-2 rounded-full ${savedKey ? "bg-[#28c840]" : "bg-[#4a4a5a]"}`} />
              <span className={savedKey ? "text-[#28c840]" : "text-[#6b6b7b]"}>
                {savedKey ? `${s.connected} · ${maskKey(savedKey)}` : s.notConnected}
              </span>
            </span>
          </div>

          <div className="px-5 py-6 space-y-6">
            {/* API key */}
            <div>
              <label htmlFor="apiKey" className="block mb-1.5 text-[11px] tracking-widest uppercase text-[#6b6b7b]">
                {s.apiKey}
              </label>
              <div className="flex gap-2">
                <input
                  id="apiKey"
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setTest({ kind: "idle" });
                  }}
                  placeholder="sk-..."
                  autoComplete="off"
                  spellCheck={false}
                  className="input flex-1"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="px-3 text-xs text-[#6b6b7b] hover:text-[#e8e6e0] border border-[#1e1e2e] hover:border-[#3a3a4a] rounded-sm transition-colors"
                >
                  {showKey ? s.hide : s.show}
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-[#4a4a5a]">{s.apiKeyHelp}</p>
            </div>

            {/* Model */}
            <div>
              <span className="block mb-1.5 text-[11px] tracking-widest uppercase text-[#6b6b7b]">{s.model}</span>
              <div className="flex flex-wrap gap-2">
                {[...MODEL_OPTIONS, CUSTOM].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setModelChoice(m);
                      setTest({ kind: "idle" });
                    }}
                    aria-pressed={modelChoice === m}
                    className={`px-3 py-1.5 text-xs rounded-sm border transition-colors ${
                      modelChoice === m
                        ? "border-[#ff6b35] text-[#ff6b35] bg-[#ff6b35]/10"
                        : "border-[#1e1e2e] text-[#8b8b9b] hover:border-[#3a3a4a] hover:text-[#e8e6e0]"
                    }`}
                  >
                    {m === CUSTOM ? s.custom : m}
                  </button>
                ))}
              </div>
              {modelChoice === CUSTOM && (
                <input
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  placeholder={s.customPlaceholder}
                  spellCheck={false}
                  className="input mt-2 w-full"
                />
              )}
              <p className="mt-1.5 text-[11px] text-[#4a4a5a]">{s.modelHelp}</p>
            </div>

            {/* Test result */}
            {test.kind === "ok" && (
              <p className="text-xs text-[#28c840] border border-[#28c840]/30 bg-[#28c840]/5 rounded-sm px-3 py-2">
                ✓ {s.testOk} <span className="font-bold">{test.model}</span>
              </p>
            )}
            {test.kind === "error" && (
              <p role="alert" className="text-xs text-[#ff5f57] border border-[#ff5f57]/40 bg-[#ff5f57]/5 rounded-sm px-3 py-2">
                {test.message}
              </p>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleTest}
                disabled={!apiKey.trim() || !model || test.kind === "testing"}
                className="px-4 py-2 text-xs tracking-wider uppercase text-[#e8e6e0] border border-[#3a3a4a] hover:border-[#ff6b35] hover:text-[#ff6b35] rounded-sm disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                {test.kind === "testing" ? s.testing : s.test}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!apiKey.trim() || !model}
                className="px-5 py-2 text-xs font-bold tracking-widest uppercase bg-[#ff6b35] text-[#0a0a0f] hover:bg-[#ff8555] rounded-sm disabled:opacity-30 disabled:cursor-not-allowed transition-colors active:scale-95"
              >
                {justSaved ? `✓ ${s.saved}` : s.save}
              </button>
              {savedKey && (
                <button
                  type="button"
                  onClick={handleRemove}
                  className="ml-auto px-3 py-2 text-xs text-[#6b6b7b] hover:text-[#ff5f57] transition-colors"
                >
                  {s.remove}
                </button>
              )}
            </div>
          </div>

          <div className="px-5 py-3 border-t border-[#1e1e2e] bg-[#0a0a12] flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-[#4a4a5a] leading-relaxed max-w-md">🔒 {s.storageNote}</p>
            {savedKey && (
              <Link href="/generator" className="text-xs font-bold text-[#ff6b35] hover:text-[#ff8555]">
                {s.goGenerate}
              </Link>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}
