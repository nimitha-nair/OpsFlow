import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ACCENTS, riseStyle, type Accent } from "./accent";

interface MetricCardProps {
  label: string;
  /** A formatted value, or a node (e.g. a multi-currency breakdown). */
  value: ReactNode;
  hint?: string;
  icon: LucideIcon;
  accent: Accent;
  index?: number;
  /** Optional route — turns the whole card into a link with an arrow affordance. */
  to?: string;
  /** Emphasize the value (used for the headline metric, e.g. Total Spend). */
  emphasize?: boolean;
}

/**
 * The single, shared vivid metric card used across dashboards and reports: a
 * gradient icon chip, a large accent-colored value, an optional hint, a soft
 * corner glow, a hover lift, and a staggered entrance.
 */
export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  accent,
  index = 0,
  to,
  emphasize = false,
}: MetricCardProps) {
  const a = ACCENTS[accent];
  const inner = (
    <Card
      style={riseStyle(index)}
      className={cn(
        "r-card r-rise relative h-full overflow-hidden border-border/60",
        to && "cursor-pointer",
      )}
    >
      {/* Subtle accent: a hairline top edge + a soft corner glow. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r opacity-60"
        style={{ backgroundImage: `linear-gradient(to right, transparent, ${a.glow}, transparent)` }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full opacity-70 blur-2xl"
        style={{ background: `radial-gradient(circle, ${a.glow}, transparent 70%)` }}
      />
      <div className="relative flex items-center gap-2.5 p-3 sm:gap-3 sm:p-4">
        {/* Consistent icon chip across all cards (size doesn't change with emphasis). */}
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm sm:size-10",
            a.chip,
          )}
        >
          <Icon className="size-[18px] sm:size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "whitespace-nowrap font-bold leading-tight tracking-tight tabular-nums",
              a.value,
              emphasize ? "text-2xl sm:text-3xl" : "text-xl sm:text-2xl",
            )}
          >
            {value}
          </div>
          <div className="mt-0.5 truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
          {hint && (
            <div className="truncate text-[11px] leading-tight text-muted-foreground/70">
              {hint}
            </div>
          )}
        </div>
      </div>
    </Card>
  );

  return to ? (
    <Link to={to} className="block h-full">
      {inner}
    </Link>
  ) : (
    inner
  );
}
