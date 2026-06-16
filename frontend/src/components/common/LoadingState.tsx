import { Loader2 } from "lucide-react";

interface LoadingStateProps {
  label?: string;
  /** Smaller padding for use inside compact containers. */
  compact?: boolean;
}

export function LoadingState({
  label = "Loading…",
  compact,
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={
        "flex flex-col items-center justify-center gap-3 text-muted-foreground " +
        (compact ? "py-8" : "py-16")
      }
    >
      <Loader2 className="size-6 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
