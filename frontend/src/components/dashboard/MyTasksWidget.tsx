import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ClipboardList } from "lucide-react";

import { SectionCard } from "../common/SectionCard";
import { EmptyState } from "../common/EmptyState";
import { LoadingState } from "../common/LoadingState";
import { DueDate } from "../tasks/DueDate";
import { apiErrorMessage, listMyTasks } from "../../lib/tasks-api";
import type { Task } from "../../types/task";

/** Employee dashboard widget: a snapshot of the tasks assigned to me. */
export function MyTasksWidget() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await listMyTasks();
        if (!cancelled) setTasks(data);
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, "Failed to load tasks."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const open = tasks.filter((t) => t.status !== "DONE");
  const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS").length;
  const upcoming = [...open]
    .filter((t) => /^\d{4}-\d{2}-\d{2}/.test(t.dueDate ?? ""))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 4);

  return (
    <SectionCard
      title="My tasks"
      description={
        loading ? "Loading…" : `${open.length} open · ${inProgress} in progress`
      }
      actions={
        <Link
          to="/employee/tasks"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          View all <ArrowRight className="size-3" />
        </Link>
      }
    >
      {loading ? (
        <LoadingState compact label="Loading tasks…" />
      ) : error ? (
        <p className="py-4 text-center text-xs text-muted-foreground">{error}</p>
      ) : open.length === 0 ? (
        <EmptyState
          compact
          icon={ClipboardList}
          title="You're all caught up"
          description="Tasks assigned to you will appear here."
        />
      ) : (
        <ul className="flex flex-col divide-y">
          {upcoming.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-3 py-2.5"
            >
              <span className="min-w-0 truncate text-sm font-medium text-foreground">
                {t.title}
              </span>
              <DueDate dueDate={t.dueDate} status={t.status} />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
