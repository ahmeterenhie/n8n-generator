"use client";

import Link from "next/link";
import { useState } from "react";
import { Shell } from "@/components/Shell";
import { useI18n } from "@/lib/i18n";

export function LoginForm({ next, showDefaultsHint }: { next: string; showDefaultsHint: boolean }) {
  const { t } = useI18n();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        setError(res.status === 401 ? t.login.invalid : `${t.errors.SERVER}: ${res.status}`);
        return;
      }
      // Full navigation: the client router may have cached the pre-login redirect
      window.location.assign(next);
    } catch {
      setError(t.errors.SERVER);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Shell variant="public">
      <div className="flex justify-center py-16 sm:py-24">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-sm border border-[#1e1e2e] bg-[#0d0d17] rounded-sm overflow-hidden"
        >
          <div className="px-5 py-2.5 border-b border-[#1e1e2e] bg-[#0a0a12]">
            <span className="text-[#4a4a5a] text-xs tracking-widest">{t.login.fileLabel}</span>
          </div>

          <div className="px-5 py-6 space-y-5">
            <div className="border-l-2 border-[#ff6b35] pl-4">
              <h1 className="text-2xl font-bold text-[#f0ede6]">{t.login.title}</h1>
              <p className="mt-1.5 text-xs text-[#6b6b7b]">{t.login.subtitle}</p>
            </div>

            <Field label={t.login.username}>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                required
                className="input w-full"
              />
            </Field>

            <Field label={t.login.password}>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="input w-full"
              />
            </Field>

            {error && (
              <p role="alert" className="text-[#ff5f57] text-xs border border-[#ff5f57]/40 bg-[#ff5f57]/5 rounded-sm px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[#ff6b35] text-[#0a0a0f] text-xs font-bold tracking-widest uppercase rounded-sm hover:bg-[#ff8555] disabled:opacity-40 transition-colors active:scale-[0.98]"
            >
              {loading ? t.login.submitting : `▶ ${t.login.submit}`}
            </button>

            {showDefaultsHint && (
              <p className="text-[11px] leading-relaxed text-[#febc2e]/80 border border-[#febc2e]/20 bg-[#febc2e]/5 rounded-sm px-3 py-2">
                {t.login.defaultsHint}
              </p>
            )}
          </div>

          <div className="px-5 py-3 border-t border-[#1e1e2e] bg-[#0a0a12]">
            <Link href="/" className="text-xs text-[#6b6b7b] hover:text-[#ff6b35] transition-colors">
              {t.login.back}
            </Link>
          </div>
        </form>
      </div>
    </Shell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block mb-1.5 text-[11px] tracking-widest uppercase text-[#6b6b7b]">{label}</span>
      {children}
    </label>
  );
}
