import { confidenceLevel } from "../../types/expenseAnalysis";

const TONE = {
  emerald: { bar: "bg-emerald-500", pill: "bg-emerald-100 text-emerald-700" },
  amber: { bar: "bg-amber-500", pill: "bg-amber-100 text-amber-800" },
  red: { bar: "bg-red-500", pill: "bg-red-100 text-red-700" },
} as const;

/** Prominent confidence bar with a High/Medium/Low level pill and color coding. */
export function ConfidenceMeter({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const { label, tone } = confidenceLevel(clamped);
  const t = TONE[tone];
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          AI confidence
        </span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${t.pill}`}>
          {label} · {clamped}%
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${t.bar} transition-all`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
