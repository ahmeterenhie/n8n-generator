"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LANG_COOKIE, dictionaries, type Dict, type Lang } from "@/lib/dictionaries";

export type { Dict, Lang };

type ErrorCode = keyof Dict["errors"];

/** Turns an API error payload `{ code, error }` into a message in the current language. */
export function translateError(t: Dict, data: { code?: string; error?: string }, status: number): string {
  const code = data.code as ErrorCode | undefined;
  if (code && code in t.errors) {
    const base = t.errors[code];
    // These codes are prefixes: append the upstream detail
    return code === "UPSTREAM" || code === "VALIDATION" || code === "N8N_ERROR" ? `${base} ${data.error ?? ""}`.trim() : base;
  }
  return data.error || `${t.errors.SERVER}: ${status}`;
}

const I18nContext = createContext<{ lang: Lang; t: Dict; setLang: (l: Lang) => void } | null>(null);

export function I18nProvider({ initialLang, children }: { initialLang: Lang; children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const router = useRouter();

  const setLang = useCallback(
    (l: Lang) => {
      setLangState(l);
      // Cookie so the server renders the right language on the next load (no flash)
      document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
      // Re-render server parts too (page title, description)
      router.refresh();
    },
    [router]
  );

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return <I18nContext.Provider value={{ lang, t: dictionaries[lang], setLang }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
