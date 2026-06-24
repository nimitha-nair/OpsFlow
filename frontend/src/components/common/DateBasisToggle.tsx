import type { LucideIcon } from "lucide-react";
import { Receipt, Send } from "lucide-react";

import { cn } from "@/lib/utils";

export interface BasisOption<T extends string> {
  value: T;
  label: string;
  Icon: LucideIcon;
}

/** Default options for expense surfaces (expense vs submission date). */
const EXPENSE_OPTIONS: BasisOption<"expenseDate" | "submittedAt">[] = [
  { value: "expenseDate", label: "Expense date", Icon: Receipt },
  { value: "submittedAt", label: "Submission date", Icon: Send },
];

interface DateBasisToggleProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  /** Override the choices (e.g. Due date / Created date for tasks). Defaults to
   *  the expense-date / submission-date pair. */
  options?: BasisOption<T>[];
  className?: string;
}

/**
 * Compact segmented control for choosing which date a range filter applies to.
 * Icons + an explicit active state make the choice obvious; sits inline beside
 * <DateRangeFilter>. Generic over the basis values so non-expense surfaces
 * (e.g. tasks) can supply their own options.
 */
export function DateBasisToggle<
  T extends string = "expenseDate" | "submittedAt",
>({ value, onChange, options, className }: DateBasisToggleProps<T>) {
  const opts = options ?? (EXPENSE_OPTIONS as unknown as BasisOption<T>[]);
  return (
    <div
      role="group"
      aria-label="Filter by date"
      className={cn(
        "no-print inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/60 p-1 text-xs font-medium",
        className,
      )}
    >
      {opts.map(({ value: v, label, Icon }) => {
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
