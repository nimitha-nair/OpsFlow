import { cn } from "@/lib/utils";

type DateBasis = "expenseDate" | "submittedAt";

interface DateBasisToggleProps {
  value: DateBasis;
  onChange: (v: DateBasis) => void;
  className?: string;
}

/**
 * Compact segmented control for switching the date field a date-range filter
 * applies to. Sits inline beside <DateRangeFilter>.
 */
export function DateBasisToggle({ value, onChange, className }: DateBasisToggleProps) {
  return (
    <div
      className={cn(
        "no-print inline-flex items-center rounded-lg border border-border bg-muted/50 p-0.5 text-xs font-medium",
        className,
      )}
      role="group"
      aria-label="Date basis"
    >
      {(
        [
          { v: "expenseDate", label: "Expense date" },
          { v: "submittedAt", label: "Submission date" },
        ] as { v: DateBasis; label: string }[]
      ).map(({ v, label }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={cn(
            "rounded-md px-2.5 py-1 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            value === v
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
