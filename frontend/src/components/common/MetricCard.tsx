import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ACCENTS, riseStyle, type Accent } from "./accent";

interface MetricCardProps {
  label: string;
  value: string | number;
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
      {/* Soft accent corner glow. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 size-28 rounded-full blur-2xl"
        style={{ background: `radial-gradient(circle, ${a.glow}, transparent 70%)` }}
      />
      <div className="relative flex items-start gap-4 p-5">
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-sm",
            a.chip,
            emphasize ? "size-14" : "size-12",
          )}
        >
          <Icon className={emphasize ? "size-6" : "size-5"} />
        </span>
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "font-bold tracking-tight tabular-nums",
              a.value,
              emphasize ? "text-3xl" : "text-2xl",
            )}
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

  return to ? (
    <Link to={to} className="block h-full">
      {inner}
    </Link>
  ) : (
    inner
  );
}
