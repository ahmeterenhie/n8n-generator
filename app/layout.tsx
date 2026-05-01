import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "n8n Forge — Prompt-to-Workflow Generator",
  description:
    "Describe your automation in plain English. Get a production-ready n8n workflow JSON instantly.",
  keywords: ["n8n", "workflow", "automation", "AI", "OpenAI", "no-code"],
  openGraph: {
    title: "n8n Forge",
    description: "AI-powered n8n workflow generator",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={jetbrainsMono.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
