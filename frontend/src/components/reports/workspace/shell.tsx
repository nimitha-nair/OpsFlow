/**
 * Shared workspace shell for the executive report surfaces (Admin Reports and
 * the HR Insights Dashboard): a sticky section rail with scroll-spy and a
 * per-section frame carrying CSV/PDF export. Keeping these in one place means
 * both dashboards read and behave identically.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { FileSpreadsheet, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { printElement } from "../../../lib/export";

export interface SectionDef {
  id: string;
  label: string;
  icon: LucideIcon;
}

/** Highlight whichever section is currently in view. */
export function useScrollSpy(ids: string[]): string {
  const [active, setActive] = useState(ids[0] ?? "");
  const key = ids.join(",");
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-15% 0px -75% 0px", threshold: 0 },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return active;
}

/** The sticky left navigation rail. */
export function SectionRail({
  sections,
  active,
  onGo,
}: {
  sections: SectionDef[];
  active: string;
  onGo: (id: string) => void;
}) {
  return (
    <nav className="no-print hidden lg:block">
      <div className="sticky top-20 flex flex-col gap-1">
        <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Sections
        </p>
        {sections.map((s) => {
          const Icon = s.icon;
          const isActive = active === s.id;
          return (
            <button
              key={s.id}
              onClick={() => onGo(s.id)}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              <Icon className={`size-4 shrink-0 ${isActive ? "text-primary" : ""}`} />
              <span className="truncate">{s.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/** A titled report section with its own export toolbar and a print anchor. */
export function SectionFrame({
  id,
  title,
  description,
  onCsv,
  children,
}: {
  id: string;
  title: string;
  description: string;
  onCsv?: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  return (
    <section id={id} ref={ref} data-report-section className="scroll-mt-24 flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border/60 pb-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="no-print flex items-center gap-2">
          {onCsv && (
            <Button variant="outline" size="sm" onClick={onCsv}>
              <FileSpreadsheet className="size-4" />
              CSV
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => printElement(ref.current, `opsflow-${id}-report`)}
          >
            <FileText className="size-4" />
            PDF
          </Button>
        </div>
      </div>
      {children}
    </section>
  );
}

/** Helper to smooth-scroll the content area to a section by id. */
export function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}
