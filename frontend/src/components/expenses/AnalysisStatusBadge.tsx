import { Loader2 } from "lucide-react";

import { Badge } from "../ui/badge";
import {
  ANALYSIS_STATUS_META,
  type AnalysisStatus,
} from "../../types/expenseAnalysis";

const TONE_CLASS: Record<string, string> = {
  slate: "bg-slate-100 text-slate-700",
  blue: "bg-blue-100 text-blue-700",
  emerald: "bg-emerald-100 text-emerald-700",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-700",
};

export function AnalysisStatusBadge({ status }: { status: AnalysisStatus }) {
  const meta = ANALYSIS_STATUS_META[status];
  return (
    <Badge variant="outline" className={`gap-1 border-0 ${TONE_CLASS[meta.tone]}`}>
      {meta.spinner && <Loader2 className="size-3 animate-spin" />}
      {meta.label}
    </Badge>
  );
}
