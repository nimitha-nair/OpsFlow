import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  PROJECT_STATUS_LABELS,
  type ProjectStatus,
} from "../../types/project";

const STATUS_STYLES: Record<ProjectStatus, string> = {
  PLANNING:
    "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300",
  ACTIVE:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  ON_HOLD:
    "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  COMPLETED: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  CANCELLED:
    "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <Badge className={cn("border-transparent", STATUS_STYLES[status])}>
      {PROJECT_STATUS_LABELS[status]}
    </Badge>
  );
}
