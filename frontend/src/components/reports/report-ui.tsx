import type { LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { type Accent, riseStyle } from "./report-palette";

export type { Accent } from "./report-palette";

const ACCENTS: Record<
  Accent,
  { chip: string; value: string; glow: string }
> = {
  indigo: {
    chip: "from-indigo-500 to-violet-500",
    value: "text-indigo-600 dark:text-indigo-300",
    glow: "rgba(99,102,241,0.20)",
  },
  violet: {
    chip: "from-violet-500 to-fuchsia-500",
    value: "text-violet-600 dark:text-violet-300",
    glow: "rgba(139,92,246,0.20)",
  },
  emerald: {
    chip: "from-emerald-500 to-teal-500",
    value: "text-emerald-600 dark:text-emerald-300",
    glow: "rgba(16,185,129,0.20)",
  },
  amber: {
    chip: "from-amber-500 to-orange-500",
    value: "text-amber-600 dark:text-amber-300",
    glow: "rgba(245,158,11,0.22)",
  },
  rose: {
    chip: "from-rose-500 to-pink-500",
    value: "text-rose-600 dark:text-rose-300",
    glow: "rgba(244,63,94,0.20)",
  },
  sky: {
    chip: "from-sky-500 to-blue-500",
    value: "text-sky-600 dark:text-sky-300",
    glow: "rgba(14,165,233,0.20)",
  },
};

/**
 * Vivid metric card: a gradient icon chip, a large accent-colored value, an
 * optional hint, a soft corner glow, hover lift, and a staggered entrance.
 */
export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  accent,
  index = 0,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  accent: Accent;
  index?: number;
}) {
  const a = ACCENTS[accent];
  return (
    <Card
      style={riseStyle(index)}
      className="r-card r-rise relative overflow-hidden border-border/60"
    >
      {/* Soft accent corner glow. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 size-28 rounded-full blur-2xl"
        style={{ background: `radial-gradient(circle, ${a.glow}, transparent 70%)` }}
      />
      <div className="relative flex items-center gap-4 p-5">
        <span
          className={`flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${a.chip} text-white shadow-sm`}
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <div
            className={`text-2xl font-bold tracking-tight tabular-nums ${a.value}`}
          >
            {value}
          </div>
          <div className="truncate text-xs font-medium text-muted-foreground">
            {label}
          </div>
          {hint && (
            <div className="mt-0.5 truncate text-xs text-muted-foreground/70">
              {hint}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
