"use client";

import Link from "next/link";
import { Shell } from "@/components/Shell";
import { useI18n } from "@/lib/i18n";

export default function Landing() {
  const { t } = useI18n();
  const l = t.landing;

  return (
    <Shell variant="public" wide>
      {/* Hero */}
      <section className="grid gap-10 lg:grid-cols-[1.1fr_1fr] items-center py-16 sm:py-24">
        <div>
          <span className="inline-flex items-center gap-2 text-[11px] tracking-widest uppercase text-[#28c840] border border-[#28c840]/30 bg-[#28c840]/5 px-2.5 py-1 rounded-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-[#28c840] animate-pulse" />
            {l.badge}
          </span>
          <h1 className="mt-6 text-4xl sm:text-5xl font-bold tracking-tight leading-tight text-[#f0ede6]">
            {l.titleA}
            <br />
            <span className="text-[#ff6b35]">{l.titleB}</span>
          </h1>
          <p className="mt-5 text-[#8b8b9b] text-sm leading-relaxed max-w-lg">{l.subtitle}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/generator"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#ff6b35] text-[#0a0a0f] text-xs font-bold tracking-widest uppercase rounded-sm hover:bg-[#ff8555] transition-colors active:scale-95"
            >
              ▶ {l.cta}
            </Link>
            <a
              href="#how"
              className="px-5 py-3 text-xs tracking-widest uppercase text-[#8b8b9b] border border-[#1e1e2e] hover:border-[#3a3a4a] hover:text-[#e8e6e0] rounded-sm transition-colors"
            >
              {l.secondary}
            </a>
          </div>
        </div>

        <div className="border border-[#1e1e2e] bg-[#0d0d17] rounded-sm overflow-hidden shadow-[0_0_60px_-20px_rgba(255,107,53,0.35)]">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#1e1e2e] bg-[#0a0a12]">
            <span className="w-2 h-2 rounded-full bg-[#28c840]" />
            <span className="text-[#28c840] text-xs tracking-widest">{l.sampleFile}</span>
          </div>
          <pre className="px-5 py-4 text-xs text-[#a8a59e] leading-relaxed overflow-x-auto scrollbar-thin">
            <code>{l.sampleJson}</code>
          </pre>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="py-12 border-t border-[#1a1a24] scroll-mt-4">
        <SectionTitle>{l.stepsTitle}</SectionTitle>
        <ol className="grid gap-4 sm:grid-cols-3">
          {l.steps.map((step, i) => (
            <li key={i} className="border border-[#1e1e2e] bg-[#0d0d17] rounded-sm p-5">
              <span className="text-[#ff6b35] text-xs font-bold">{`[${i + 1}]`}</span>
              <h3 className="mt-2 text-sm font-bold text-[#f0ede6]">{step.title}</h3>
              <p className="mt-2 text-xs text-[#8b8b9b] leading-relaxed">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Features */}
      <section className="py-12 border-t border-[#1a1a24]">
        <SectionTitle>{l.featuresTitle}</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-3">
          {l.features.map((f, i) => (
            <div key={i} className="border-l-2 border-[#ff6b35] pl-4">
              <h3 className="text-sm font-bold text-[#f0ede6]">{f.title}</h3>
              <p className="mt-2 text-xs text-[#8b8b9b] leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 text-center">
          <Link
            href="/generator"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#ff6b35] text-[#0a0a0f] text-xs font-bold tracking-widest uppercase rounded-sm hover:bg-[#ff8555] transition-colors"
          >
            ▶ {l.cta}
          </Link>
        </div>
      </section>

      <footer className="py-8 border-t border-[#1a1a24]">
        <p className="text-[#3a3a4a] text-xs text-center">{l.footer}</p>
      </footer>
    </Shell>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-6 text-xs tracking-widest uppercase text-[#6b6b7b]">— {children}</h2>;
}
