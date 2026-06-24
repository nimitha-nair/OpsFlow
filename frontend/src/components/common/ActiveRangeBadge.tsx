import { CalendarRange } from "lucide-react";

import { cn } from "@/lib/utils";
import { rangeLabel, type DateRange } from "@/lib/date-range";

/** Always-visible label of the active date range, shown near a page title and
 *  in export headers so users always know the scope of what they're viewing. */
export function ActiveRangeBadge({
  range,
  className,
}: {
  range: DateRange;
  className?: string;
}) {
  return (
    <span
      data-testid="active-range-badge"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      <CalendarRange className="size-3.5" />
      {rangeLabel(range)}
    </span>
  );
}
