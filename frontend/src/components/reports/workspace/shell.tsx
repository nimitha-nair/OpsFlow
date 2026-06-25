/**
 * Shared workspace shell components for the executive report surfaces: a sticky
 * section rail and a per-section frame carrying CSV/PDF export. Non-component
 * helpers (useScrollSpy, scrollToSection, SectionDef) live in report-sections.ts
 * so this file stays components-only for fast refresh.
 */

import { useRef, type ReactNode } from "react";
import { FileSpreadsheet, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { printElement } from "../../../lib/export";
import type { SectionDef } from "./report-sections";

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
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight text-foreground break-words">{title}</h2>
          <p className="text-sm text-muted-foreground break-words">{description}</p>
        </div>
        <div className="no-print flex shrink-0 items-center gap-2">
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
