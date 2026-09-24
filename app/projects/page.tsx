"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Spinner } from "@/components/ProgressPanel";
import { Shell } from "@/components/Shell";
import { useI18n } from "@/lib/i18n";
import type { ProjectSummary } from "@/lib/projects";

const ROLE_COLOR: Record<string, string> = { main: "#ff6b35", sub: "#5b9dff", error: "#ff5f57" };

/** Saved projects: open to keep working on them, or delete. */
export default function Projects() {
  const { t, lang } = useI18n();
  const p = t.projects;
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : { projects: [] }))
      .then((data) => setProjects(data.projects ?? []))
      .catch(() => setProjects([]));
  }, []);

  const remove = async (id: string) => {
    if (!window.confirm(p.confirmDelete)) return;
    await fetch(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
    setProjects((list) => list?.filter((x) => x.id !== id) ?? null);
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString(lang === "tr" ? "tr-TR" : "en-GB", { dateStyle: "medium", timeStyle: "short" });

  return (
    <Shell variant="app">
      <div className="py-12">
        <header className="mb-8 border-l-2 border-[#ff6b35] pl-5">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#f0ede6]">{p.title}</h1>
          <p className="mt-2 text-sm text-[#6b6b7b] leading-relaxed max-w-xl">{p.subtitle}</p>
        </header>

        {projects === null && (
          <p className="flex items-center gap-2 text-xs text-[#6b6b7b]">
            <Spinner />
          </p>
        )}
        {projects?.length === 0 && (
          <p className="border border-dashed border-[#2a2a3a] rounded-sm px-4 py-6 text-xs text-[#8b8b9b]">{p.empty}</p>
        )}

        <ul className="space-y-3">
          {projects?.map((project) => {
            const issues = project.workflows.reduce((n, w) => n + w.errors, 0);
            const pushed = project.workflows.some((w) => w.pushed);
            return (
              <li key={project.id} className="border border-[#1e1e2e] bg-[#0d0d17] rounded-sm px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-[#e8e6e0] line-clamp-2">{project.request || p.untitled}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#6b6b7b]">
                      <span>{formatDate(project.updatedAt)}</span>
                      <span>{p.workflows.replace("{n}", String(project.workflows.length))}</span>
                      {issues > 0 ? (
                        <span className="text-[#febc2e]">⚠ {p.issues.replace("{n}", String(issues))}</span>
                      ) : (
                        <span className="text-[#28c840]">✓</span>
                      )}
                      {pushed && <span className="text-[#28c840] border border-[#28c840]/40 rounded-sm px-1.5">{p.pushed}</span>}
                      {project.demo && <span className="text-[#febc2e] border border-[#febc2e]/40 rounded-sm px-1.5">{p.demo}</span>}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {project.workflows.map((w, i) => (
                        <span key={i} className="flex items-center gap-1.5 text-[11px] text-[#a8a59e] border border-[#1e1e2e] rounded-sm px-2 py-0.5">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ROLE_COLOR[w.role] ?? "#8b8b9b" }} />
                          {w.name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/generator?project=${encodeURIComponent(project.id)}`}
                      className="px-4 py-1.5 text-xs font-bold tracking-wider text-[#0a0a0f] bg-[#ff6b35] hover:bg-[#ff8555] rounded-sm"
                    >
                      {p.open}
                    </Link>
                    <button
                      type="button"
                      onClick={() => remove(project.id)}
                      className="px-3 py-1.5 text-xs text-[#6b6b7b] hover:text-[#ff5f57]"
                    >
                      {p.delete}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Shell>
  );
}
