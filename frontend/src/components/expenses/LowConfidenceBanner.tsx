import { AlertTriangle } from "lucide-react";

/** Prominent warning shown for LOW_CONFIDENCE results, with the reason. */
export function LowConfidenceBanner({ reason }: { reason: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-3"
    >
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-semibold text-amber-900">
          Low confidence — please review carefully
        </p>
        <p className="text-sm text-amber-800">{reason}</p>
        <p className="text-xs text-amber-700">
          Check every field against the receipt before submitting.
        </p>
      </div>
    </div>
  );
}
