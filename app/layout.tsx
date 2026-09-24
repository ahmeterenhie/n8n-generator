import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { JetBrains_Mono } from "next/font/google";
import { I18nProvider, LANG_COOKIE, type Lang } from "@/lib/i18n";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "n8n Forge — Prompt-to-Workflow Generator",
  description:
    "Describe your automation in plain language. Get a production-ready n8n workflow JSON instantly.",
  keywords: ["n8n", "workflow", "automation", "AI", "OpenAI", "Codex", "no-code"],
  openGraph: {
    title: "n8n Forge",
    description: "AI-powered n8n workflow generator",
    type: "website",
  },
};

// Saved choice first, then the browser's language
function detectLang(): Lang {
  const saved = cookies().get(LANG_COOKIE)?.value;
  if (saved === "tr" || saved === "en") return saved;
  return headers().get("accept-language")?.toLowerCase().startsWith("tr") ? "tr" : "en";
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
