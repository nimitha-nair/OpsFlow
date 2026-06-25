import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

import { SectionCard } from "../common/SectionCard";

export interface QuickActionItem {
  label: string;
  hint: string;
  icon: ReactNode;
  /** Navigation target (renders a link). */
  to?: string;
  /** Click handler (renders a button) — e.g. when the action opens a dialog. */
  onClick?: () => void;
}

/**
 * The dashboard "Quick actions" panel — a row of prominent shortcut cards.
 * Shared across roles so each dashboard surfaces the same first-thing actions.
 */
export function QuickActions({ items }: { items: QuickActionItem[] }) {
  return (
    <SectionCard
      title="Quick actions"
      description="Jump straight to what you need."
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((action) => (
          <QuickAction key={action.label} {...action} />
        ))}
      </div>
    </SectionCard>
  );
}

const CARD_CLASS =
  "group flex w-full items-center gap-3 rounded-lg border border-border/70 p-3 text-left transition hover:border-primary/40 hover:bg-muted/50";

function QuickAction({ to, onClick, icon, label, hint }: QuickActionItem) {
  const inner = (
    <>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {hint}
        </span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
    </>
  );

  if (to) {
    return (
      <Link to={to} className={CARD_CLASS}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={CARD_CLASS}>
      {inner}
    </button>
  );
}
