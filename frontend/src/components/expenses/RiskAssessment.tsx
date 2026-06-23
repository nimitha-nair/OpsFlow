import { AlertTriangle, ShieldAlert, ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  RISK_LEVEL_META,
  RISK_REASON_LABELS,
  type ExpenseAnalysis,
  type RiskLevel,
} from "../../types/expenseAnalysis";

const TONE: Record<"emerald" | "amber" | "red", string> = {
  emerald: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
  amber: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  red: "bg-red-500/15 text-red-700 dark:text-red-400",
};

/** Compact risk pill — used in lists and review queues (HR/Admin only). */
export function RiskBadge({
  level,
  className,
}: {
  level: RiskLevel;
  className?: string;
}) {
  const meta = RISK_LEVEL_META[level];
  const Icon =
    level === "LOW" ? ShieldCheck : level === "MEDIUM" ? ShieldAlert : AlertTriangle;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
        TONE[meta.tone],
        className,
      )}
    >
      <Icon className="size-3.5" />
      {meta.label}
    </span>
  );
}

/**
 * Full receipt-authenticity panel for the HR/Admin review surfaces: the risk
 * level, the specific indicators, and an additional-review nudge for elevated
 * risk. Assists the reviewer — never auto-rejects.
 */
export function RiskAssessment({ analysis }: { analysis: ExpenseAnalysis }) {
  if (!analysis.riskLevel) return null;
  const reasons = analysis.riskReasons ?? [];
  const elevated = analysis.riskLevel !== "LOW";

  return (
    <div
      className={cn(
        "rounded-md border p-3",
        elevated
          ? "border-amber-300 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/10"
          : "border-border bg-muted/20",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">
          Receipt authenticity
        </span>
        <RiskBadge level={analysis.riskLevel} />
      </div>
      {reasons.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {reasons.map((r) => (
            <li
              key={r}
              className="rounded bg-background px-1.5 py-0.5 text-xs text-muted-foreground ring-1 ring-border"
            >
              {RISK_REASON_LABELS[r]}
            </li>
          ))}
        </ul>
      )}
      {elevated && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          Flagged for additional review. This assists your decision — the system
          never auto-rejects.
        </p>
      )}
    </div>
  );
}
