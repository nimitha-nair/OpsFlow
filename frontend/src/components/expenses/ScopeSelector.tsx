import { Building2, FolderKanban } from "lucide-react";

import { EXPENSE_SCOPES, type ExpenseScope } from "../../types/expense";

const OPTIONS: Record<
  ExpenseScope,
  { title: string; description: string; icon: typeof Building2 }
> = {
  GENERAL: {
    title: "General Expense",
    description: "Personal / operational expense",
    icon: Building2,
  },
  PROJECT: {
    title: "Project Expense",
    description: "Allocate to a project budget",
    icon: FolderKanban,
  },
};

/**
 * Segmented card selector for the expense scope — the first decision a user makes.
 * Replaces a plain dropdown so the choice is visually obvious and clearly labeled.
 */
export function ScopeSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: ExpenseScope;
  onChange: (scope: ExpenseScope) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {EXPENSE_SCOPES.map((scope) => {
        const opt = OPTIONS[scope];
        const Icon = opt.icon;
        const selected = value === scope;
        return (
          <button
            key={scope}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onChange(scope)}
            className={`flex items-start gap-3 rounded-xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
              selected
                ? "ring-ai border-[var(--x-primary)] bg-ai-soft"
                : "border-muted-foreground/25 hover:border-[var(--x-primary)]/50"
            }`}
          >
            <Icon
              className={`mt-0.5 size-5 shrink-0 ${
                selected ? "text-ai" : "text-muted-foreground"
              }`}
            />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-semibold text-foreground">
                {opt.title}
              </span>
              <span className="text-xs text-muted-foreground">
                {opt.description}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
