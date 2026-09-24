"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { N8nSettingsCard } from "@/components/N8nSettingsCard";
import { Shell } from "@/components/Shell";
import {
  DEFAULT_MODELS,
  MODEL_OPTIONS,
  PROVIDERS,
  loadApiConfig,
  maskKey,
  needsKey,
  saveApiConfig,
  type ApiConfig,
  type Provider,
} from "@/lib/apiConfig";
import { translateError, useI18n } from "@/lib/i18n";

type TestState = { kind: "idle" } | { kind: "testing" } | { kind: "ok"; model: string } | { kind: "error"; message: string };

const CUSTOM = "__custom__";

export default function Settings() {
  const { t } = useI18n();
  const s = t.settings;
  const [config, setConfig] = useState<ApiConfig | null>(null);
  const [provider, setProvider] = useState<Provider>("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [modelChoice, setModelChoice] = useState<string>(DEFAULT_MODELS.anthropic);
  const [customModel, setCustomModel] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [test, setTest] = useState<TestState>({ kind: "idle" });
  const [justSaved, setJustSaved] = useState(false);

  // Fill the form from what is saved for a provider
  const loadForm = (cfg: ApiConfig, p: Provider) => {
    const conn = cfg.connections[p];
    setProvider(p);
    setApiKey(conn.apiKey);
    if (MODEL_OPTIONS[p].includes(conn.model)) {
      setModelChoice(conn.model);
      setCustomModel("");
    } else {
      setModelChoice(CUSTOM);
      setCustomModel(conn.model);
    }
    setShowKey(false);
    setTest({ kind: "idle" });
  };

  useEffect(() => {
    const cfg = loadApiConfig();
    setConfig(cfg);
    loadForm(cfg, cfg.provider);
  }, []);

  if (!config) return <Shell variant="app">{null}</Shell>;

  const p = s.providers[provider];
  const model = modelChoice === CUSTOM ? customModel.trim() : modelChoice;
  const activeConn = config.connections[config.provider];
  const withKey = needsKey(provider);
  const activeUsable = !needsKey(config.provider) || !!activeConn.apiKey;
  const canSave = !withKey || (!!apiKey.trim() && !!model);

  const handleTest = async () => {
    setTest({ kind: "testing" });
    try {
      const res = await fetch("/api/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey: apiKey.trim(), model }),
      });
      const data = await res.json().catch(() => ({}));
      setTest(res.ok ? { kind: "ok", model: data.model } : { kind: "error", message: translateError(t, data, res.status) });
    } catch {
      setTest({ kind: "error", message: t.errors.SERVER });
    }
  };

  const handleSave = () => {
    const next: ApiConfig = {
      provider,
      connections: { ...config.connections, [provider]: { apiKey: apiKey.trim(), model: model || DEFAULT_MODELS[provider] } },
    };
    saveApiConfig(next);
    setConfig(next);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  };

  const handleRemove = () => {
    const next: ApiConfig = {
      ...config,
      connections: { ...config.connections, [provider]: { ...config.connections[provider], apiKey: "" } },
    };
    saveApiConfig(next);
    setConfig(next);
    setApiKey("");
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
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-[#1e1e2e] bg-[#0a0a12]">
            <span className="text-[#4a4a5a] text-xs tracking-widest">{s.fileLabel}</span>
            <span className="flex items-center gap-2 text-xs">
              <span className={`w-2 h-2 rounded-full ${activeUsable ? "bg-[#28c840]" : "bg-[#4a4a5a]"}`} />
              <span className={activeUsable ? "text-[#28c840]" : "text-[#6b6b7b]"}>
                {!activeUsable
                  ? s.notConnected
                  : needsKey(config.provider)
                    ? `${s.active}: ${s.providers[config.provider].label} · ${activeConn.model}`
                    : `${s.active}: ${s.providers[config.provider].label}`}
              </span>
            </span>
          </div>

          <div className="px-5 py-6 space-y-6">
            {/* Provider */}
            <div>
              <span className="block mb-1.5 text-[11px] tracking-widest uppercase text-[#6b6b7b]">{s.provider}</span>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={s.provider}>
                {PROVIDERS.map((id) => {
                  const selected = provider === id;
                  const saved = config.connections[id].apiKey;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => loadForm(config, id)}
                      className={`text-left px-4 py-3 rounded-sm border transition-colors ${
                        selected ? "border-[#ff6b35] bg-[#ff6b35]/10" : "border-[#1e1e2e] hover:border-[#3a3a4a]"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className={`text-sm font-bold ${selected ? "text-[#ff6b35]" : "text-[#e8e6e0]"}`}>
                          {s.providers[id].label}
                        </span>
                        {saved && (
                          <span className="text-[10px] text-[#28c840]" title={maskKey(saved)}>
                            ● {maskKey(saved)}
                          </span>
                        )}
                      </span>
                      <span className="block mt-0.5 text-[11px] text-[#6b6b7b]">{s.providers[id].by}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {!withKey && (
              <p className="text-xs leading-relaxed text-[#a8a59e] border border-[#febc2e]/25 bg-[#febc2e]/5 rounded-sm px-3 py-2.5">
                {s.demoInfo}
              </p>
            )}

            {/* API key */}
            {withKey && (
              <div>
                <label htmlFor="apiKey" className="block mb-1.5 text-[11px] tracking-widest uppercase text-[#6b6b7b]">
                  {/* lang="en" keeps the brand name from Turkish uppercasing (i → İ) */}
                  <span lang="en">{p.vendor}</span> {s.apiKey}
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
                    placeholder={p.keyPlaceholder}
                    autoComplete="off"
                    spellCheck={false}
                    className="input flex-1 min-w-0"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="px-3 text-xs text-[#6b6b7b] hover:text-[#e8e6e0] border border-[#1e1e2e] hover:border-[#3a3a4a] rounded-sm transition-colors"
                  >
                    {showKey ? s.hide : s.show}
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-[#4a4a5a]">{p.keyHelp}</p>
              </div>
            )}

            {/* Model */}
            {withKey && (
              <div>
                <span className="block mb-1.5 text-[11px] tracking-widest uppercase text-[#6b6b7b]">{s.model}</span>
                <div className="flex flex-wrap gap-2">
                  {[...MODEL_OPTIONS[provider], CUSTOM].map((m) => (
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
                    placeholder={p.customPlaceholder}
                    spellCheck={false}
                    className="input mt-2 w-full"
                  />
                )}
                <p className="mt-1.5 text-[11px] text-[#4a4a5a]">{p.modelHelp}</p>
              </div>
            )}

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
              {withKey && (
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={!apiKey.trim() || !model || test.kind === "testing"}
                  className="px-4 py-2 text-xs tracking-wider uppercase text-[#e8e6e0] border border-[#3a3a4a] hover:border-[#ff6b35] hover:text-[#ff6b35] rounded-sm disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  {test.kind === "testing" ? s.testing : s.test}
                </button>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave}
                className="px-5 py-2 text-xs font-bold tracking-widest uppercase bg-[#ff6b35] text-[#0a0a0f] hover:bg-[#ff8555] rounded-sm disabled:opacity-30 disabled:cursor-not-allowed transition-colors active:scale-95"
              >
                {justSaved ? `✓ ${s.saved}` : s.save}
              </button>
              {withKey && config.connections[provider].apiKey && (
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
            {activeUsable && (
              <Link href="/generator" className="text-xs font-bold text-[#ff6b35] hover:text-[#ff8555]">
                {s.goGenerate}
              </Link>
            )}
          </div>
        </div>

        <N8nSettingsCard />
      </div>
    </Shell>
  );
}
