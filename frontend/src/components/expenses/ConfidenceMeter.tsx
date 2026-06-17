/** Confidence as a 0–100 bar; green ≥80, amber ≥60, red below. */
export function ConfidenceMeter({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const color =
    clamped >= 80 ? "bg-emerald-500" : clamped >= 60 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${color}`} style={{ width: `${clamped}%` }} />
      </div>
      <span className="text-sm font-medium text-foreground">{clamped}%</span>
    </div>
  );
}
