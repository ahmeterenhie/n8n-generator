"use client";

import { useEffect, useState } from "react";
import { ApiRequestError, postJson } from "@/lib/apiClient";
import { translateError, useI18n } from "@/lib/i18n";
import { clearN8n, loadN8n, saveN8n } from "@/lib/n8nConfig";

type TestState = { kind: "idle" } | { kind: "testing" } | { kind: "ok" } | { kind: "error"; message: string };

/** n8n address and API key, used to send workflows to n8n and read their runs. */
export function N8nSettingsCard() {
  const { t } = useI18n();
  const s = t.n8n;
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [test, setTest] = useState<TestState>({ kind: "idle" });
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    const current = loadN8n();
    if (current) {
      setBaseUrl(current.baseUrl);
      setApiKey(current.apiKey);
      setSaved(true);
    }
  }, []);

  const ready = baseUrl.trim() && apiKey.trim();

  const handleTest = async () => {
    setTest({ kind: "testing" });
    try {
      await postJson("/api/n8n/test", { n8n: { baseUrl: baseUrl.trim(), apiKey: apiKey.trim() } });
      setTest({ kind: "ok" });
    } catch (err) {
      setTest({ kind: "error", message: err instanceof ApiRequestError ? translateError(t, err.data, err.status) : t.errors.SERVER });
    }
  };

  const handleSave = () => {
    saveN8n({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim() });
    setSaved(true);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  };

  const handleRemove = () => {
    clearN8n();
    setBaseUrl("");
    setApiKey("");
    setSaved(false);
    setTest({ kind: "idle" });
  };

  return (
    <div className="mt-8 border border-[#1e1e2e] bg-[#0d0d17] rounded-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-[#1e1e2e] bg-[#0a0a12]">
        <span className="text-[#4a4a5a] text-xs tracking-widest">{s.fileLabel}</span>
        <span className="flex items-center gap-2 text-xs">
          <span className={`w-2 h-2 rounded-full ${saved ? "bg-[#28c840]" : "bg-[#4a4a5a]"}`} />
          <span className={saved ? "text-[#28c840]" : "text-[#6b6b7b]"}>{saved ? s.connected : s.notConnected}</span>
        </span>
      </div>

      <div className="px-5 py-6 space-y-5">
        <div>
          <h2 className="text-sm font-bold text-[#f0ede6]">{s.title}</h2>
          <p className="mt-1 text-xs leading-relaxed text-[#6b6b7b]">{s.subtitle}</p>
        </div>

        <div>
          <label htmlFor="n8nUrl" className="block mb-1.5 text-[11px] tracking-widest uppercase text-[#6b6b7b]">
            {s.url}
          </label>
          <input
            id="n8nUrl"
            value={baseUrl}
            onChange={(e) => {
              setBaseUrl(e.target.value);
              setTest({ kind: "idle" });
            }}
            placeholder={s.urlPlaceholder}
            spellCheck={false}
            autoComplete="off"
            className="input w-full"
          />
          <p className="mt-1.5 text-[11px] text-[#4a4a5a]">{s.urlHelp}</p>
        </div>

        <div>
          <label htmlFor="n8nKey" className="block mb-1.5 text-[11px] tracking-widest uppercase text-[#6b6b7b]">
            {s.apiKey}
          </label>
          <div className="flex gap-2">
            <input
              id="n8nKey"
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setTest({ kind: "idle" });
              }}
              spellCheck={false}
              autoComplete="off"
              className="input flex-1 min-w-0"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="px-3 text-xs text-[#6b6b7b] hover:text-[#e8e6e0] border border-[#1e1e2e] hover:border-[#3a3a4a] rounded-sm transition-colors"
            >
              {showKey ? t.settings.hide : t.settings.show}
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-[#4a4a5a]">{s.apiKeyHelp}</p>
        </div>

        {test.kind === "ok" && (
          <p className="text-xs text-[#28c840] border border-[#28c840]/30 bg-[#28c840]/5 rounded-sm px-3 py-2">✓ {s.testOk}</p>
        )}
        {test.kind === "error" && (
          <p role="alert" className="text-xs text-[#ff5f57] border border-[#ff5f57]/40 bg-[#ff5f57]/5 rounded-sm px-3 py-2">
            {test.message}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleTest}
            disabled={!ready || test.kind === "testing"}
            className="px-4 py-2 text-xs tracking-wider uppercase text-[#e8e6e0] border border-[#3a3a4a] hover:border-[#ff6b35] hover:text-[#ff6b35] rounded-sm disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {test.kind === "testing" ? t.settings.testing : s.test}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!ready}
            className="px-5 py-2 text-xs font-bold tracking-widest uppercase bg-[#ff6b35] text-[#0a0a0f] hover:bg-[#ff8555] rounded-sm disabled:opacity-30 disabled:cursor-not-allowed transition-colors active:scale-95"
          >
            {justSaved ? `✓ ${s.saved}` : s.save}
          </button>
          {saved && (
            <button type="button" onClick={handleRemove} className="ml-auto px-3 py-2 text-xs text-[#6b6b7b] hover:text-[#ff5f57] transition-colors">
              {s.remove}
            </button>
          )}
        </div>
      </div>

      <div className="px-5 py-3 border-t border-[#1e1e2e] bg-[#0a0a12]">
        <p className="text-[11px] text-[#4a4a5a] leading-relaxed">🔒 {s.note}</p>
      </div>
    </div>
  );
}
