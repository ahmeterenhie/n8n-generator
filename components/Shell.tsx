"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n, type Lang } from "@/lib/i18n";

/** Page chrome shared by every screen: background layers, header, content column. */
export function Shell({
  variant,
  children,
  wide = false,
}: {
  variant: "public" | "app";
  children: React.ReactNode;
  wide?: boolean;
}) {
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

      <div className={`relative z-10 mx-auto px-4 sm:px-6 ${wide ? "max-w-5xl" : "max-w-4xl"}`}>
        <Header variant={variant} />
        {children}
      </div>
    </div>
  );
}

function Header({ variant }: { variant: "public" | "app" }) {
  const { t } = useI18n();
  const pathname = usePathname();

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST" }).catch(() => {});
    // Full navigation so no cached signed-in page is reused
    window.location.assign("/login");
  };

  return (
    <header className="flex items-center justify-between gap-4 py-6 border-b border-[#1a1a24]">
      <Link href="/" className="flex items-center gap-3 shrink-0">
        <div className="flex gap-1.5">
          <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
          <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
          <span className="w-3 h-3 rounded-full bg-[#28c840]" />
        </div>
        <span className="text-[#6b6b7b] text-xs tracking-widest uppercase hidden sm:inline">n8n-forge</span>
      </Link>

      <nav className="flex items-center gap-1 sm:gap-2 text-xs">
        {variant === "app" ? (
          <>
            <NavLink href="/generator" active={pathname === "/generator"}>
              {t.nav.generator}
            </NavLink>
            <NavLink href="/settings" active={pathname === "/settings"}>
              {t.nav.settings}
            </NavLink>
            <LanguageToggle />
            <button
              onClick={handleLogout}
              className="px-2.5 py-1.5 text-[#6b6b7b] hover:text-[#ff5f57] transition-colors"
            >
              {t.nav.logout}
            </button>
          </>
        ) : (
          <>
            <LanguageToggle />
            <Link
              href="/generator"
              className="px-3 py-1.5 border border-[#ff6b35]/60 text-[#ff6b35] hover:bg-[#ff6b35] hover:text-[#0a0a0f] rounded-sm transition-colors font-bold tracking-wider uppercase"
            >
              {t.nav.openApp}
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`px-2.5 py-1.5 rounded-sm tracking-wider uppercase transition-colors ${
        active ? "text-[#ff6b35] bg-[#ff6b35]/10" : "text-[#6b6b7b] hover:text-[#e8e6e0]"
      }`}
    >
      {children}
    </Link>
  );
}

export function LanguageToggle() {
  const { lang, setLang, t } = useI18n();
  const options: Lang[] = ["tr", "en"];
  return (
    <div className="flex items-center border border-[#1e1e2e] rounded-sm overflow-hidden" role="group" aria-label={t.nav.language}>
      {options.map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={`px-2 py-1 text-[11px] font-bold tracking-widest uppercase transition-colors ${
            lang === l ? "bg-[#ff6b35] text-[#0a0a0f]" : "text-[#6b6b7b] hover:text-[#e8e6e0]"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
