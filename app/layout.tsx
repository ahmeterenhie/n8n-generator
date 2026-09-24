import type { Metadata } from "next";
import { cookies } from "next/headers";
import { JetBrains_Mono } from "next/font/google";
import { DEFAULT_LANG, LANG_COOKIE, dictionaries, type Lang } from "@/lib/dictionaries";
import { I18nProvider } from "@/lib/i18n";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  variable: "--font-mono",
  display: "swap",
});

export function generateMetadata(): Metadata {
  const { meta } = dictionaries[detectLang()];
  return {
    title: meta.title,
    description: meta.description,
    keywords: ["n8n", "workflow", "automation", "AI", "Claude", "OpenAI", "Codex", "no-code"],
    openGraph: { title: "n8n Forge", description: meta.description, type: "website" },
  };
}

// Turkish unless the visitor picked English with the language switch
function detectLang(): Lang {
  const saved = cookies().get(LANG_COOKIE)?.value;
  return saved === "tr" || saved === "en" ? saved : DEFAULT_LANG;
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const lang = detectLang();
  return (
    <html lang={lang} className={jetbrainsMono.variable}>
      <body className="antialiased">
        <I18nProvider initialLang={lang}>{children}</I18nProvider>
      </body>
    </html>
  );
}
