import { Receipt, Send } from "lucide-react";

import { cn } from "@/lib/utils";

type DateBasis = "expenseDate" | "submittedAt";

interface DateBasisToggleProps {
  value: DateBasis;
  onChange: (v: DateBasis) => void;
  className?: string;
}

const OPTIONS: { v: DateBasis; label: string; Icon: typeof Receipt }[] = [
  { v: "expenseDate", label: "Expense date", Icon: Receipt },
  { v: "submittedAt", label: "Submission date", Icon: Send },
];

/**
 * Compact segmented control for choosing which date a range filter applies to —
 * the expense (receipt) date or the submission date. Sits inline beside
 * <DateRangeFilter>; icons + an explicit active state make the choice obvious.
 */
export function DateBasisToggle({
  value,
  onChange,
  className,
}: DateBasisToggleProps) {
  return (
    <div
      role="group"
      aria-label="Filter by date"
      className={cn(
        "no-print inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/60 p-1 text-xs font-medium",
        className,
      )}
    >
      {OPTIONS.map(({ v, label, Icon }) => {
        const active = value === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            aria-pressed={active}
            title={`Filter by ${label.toLowerCase()}`}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background/50 hover:text-foreground",
            )}
          >
            <Icon className="size-3.5 shrink-0" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
