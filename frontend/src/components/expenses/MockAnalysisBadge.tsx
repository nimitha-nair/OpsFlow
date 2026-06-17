import { FlaskConical } from "lucide-react";

import { Badge } from "../ui/badge";

/** Flags that the extracted values are synthetic mock data, not a real scan. */
export function MockAnalysisBadge() {
  return (
    <Badge
      variant="outline"
      className="gap-1 border-amber-300 bg-amber-50 text-amber-800"
      title="Synthetic mock data (AI_PROVIDER=mock) — these values are not from a real receipt scan."
    >
      <FlaskConical className="size-3" />
      Mock Analysis
    </Badge>
  );
}
