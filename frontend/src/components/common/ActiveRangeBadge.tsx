import { CalendarRange } from "lucide-react";

import { cn } from "@/lib/utils";
import { rangeLabel, type DateRange } from "@/lib/date-range";

/** Always-visible label of the active date range, shown near a page title and
 *  in export headers so users always know the scope of what they're viewing.
 *  Optional `basisLabel` prefixes the range text, e.g. "Submitted · Last 30 days". */
export function ActiveRangeBadge({
  range,
  basisLabel,
  className,
}: {
  range: DateRange;
  /** When present, prefixes the rendered text with "<basisLabel> · ". */
  basisLabel?: string;
  className?: string;
}) {
  // "All time" means no active date window — there's nothing to indicate, and a
  // non-interactive "All time" pill reads as a dead button. Render nothing until
  // a real range is picked; then the badge confirms it (with the basis prefix).
  const bounded = range.fromMs != null || range.toMs != null;
  if (!bounded) return null;
  const label = basisLabel
    ? `${basisLabel} · ${rangeLabel(range)}`
    : rangeLabel(range);
  return (
    <span
      data-testid="active-range-badge"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      <CalendarRange className="size-3.5" />
      {label}
    </span>
  );
}
