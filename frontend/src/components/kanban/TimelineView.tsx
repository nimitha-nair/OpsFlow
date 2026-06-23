import { useMemo } from "react";
import { GanttChartSquare } from "lucide-react";

import { cn } from "@/lib/utils";
import { EmptyState } from "../common/EmptyState";
import { projectColor } from "../../lib/project-color";
import { addMonths, startOfMonth } from "../../lib/calendar-utils";
import { formatDate } from "../../lib/format";
import type { Task } from "../../types/task";

const DAY = 24 * 60 * 60 * 1000;

interface TimelineViewProps {
  tasks: Task[];
  getProjectName: (id: string) => string;
  onTaskClick: (task: Task) => void;
}

function taskSpan(task: Task): { start: number; end: number } {
  const start = Date.parse(task.createdAt);
  const due = Date.parse(task.dueDate);
  const safeStart = Number.isNaN(start) ? due : start;
  const end = Number.isNaN(due) ? safeStart : due;
  return { start: safeStart, end: Math.max(end, safeStart) };
}

export function TimelineView({
  tasks,
  getProjectName,
  onTaskClick,
}: TimelineViewProps) {
  const { axisStart, axisEnd, groups, months } = useMemo(() => {
    const spans = tasks.map(taskSpan);
    // Guard against an empty task list: Math.min/max of [] return ±Infinity,
    // which would corrupt the axis and every percentage calculation.
    if (spans.length === 0) {
      // Axis values are unused when there are no groups (we render an empty
      // state below), so any valid non-degenerate range is fine.
      return { axisStart: 0, axisEnd: DAY, groups: [], months: [] };
    }
    const minStart = Math.min(...spans.map((s) => s.start));
    const maxEnd = Math.max(...spans.map((s) => s.end));
    const start = minStart - 3 * DAY;
    const end = Math.max(maxEnd + 3 * DAY, start + DAY);

    // Group tasks by project, sorted by project name.
    const byProject = new Map<string, Task[]>();
    for (const task of tasks) {
      const list = byProject.get(task.projectId);
      if (list) list.push(task);
      else byProject.set(task.projectId, [task]);
    }
    const grouped = [...byProject.entries()]
      .map(([projectId, items]) => ({
        projectId,
        name: getProjectName(projectId),
        items,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const pctOf = (ms: number) =>
      Math.max(0, Math.min(100, ((ms - start) / (end - start)) * 100));

    const monthTicks: { label: string; left: number }[] = [];
    let m = startOfMonth(new Date(start));
    while (m.getTime() <= end) {
      monthTicks.push({
        label: m.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
        left: pctOf(m.getTime()),
      });
      m = addMonths(m, 1);
    }

    return {
      axisStart: start,
      axisEnd: end,
      groups: grouped,
      months: monthTicks,
    };
  }, [tasks, getProjectName]);

  const pct = (ms: number) =>
    Math.max(0, Math.min(100, ((ms - axisStart) / (axisEnd - axisStart)) * 100));

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={GanttChartSquare}
        title="Nothing on the timeline"
        description="Tasks with a due date appear here, grouped by project. Create a task or adjust your filters to populate the timeline."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        {/* Axis */}
        <div className="grid grid-cols-[180px_1fr] border-b border-border">
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            Project / Task
          </div>
          <div className="relative h-7">
            {months.map((tick) => (
              <div
                key={tick.label + tick.left}
                className="absolute top-0 h-full border-l border-border pl-1 text-[11px] text-muted-foreground"
                style={{ left: `${tick.left}%` }}
              >
                {tick.label}
              </div>
            ))}
          </div>
        </div>

        {/* Groups */}
        {groups.map((group) => (
          <div key={group.projectId}>
            <div className="grid grid-cols-[180px_1fr] bg-muted/30">
              <div className="truncate px-2 py-1.5 text-sm font-medium text-foreground">
                {group.name}
              </div>
              <div />
            </div>
            {group.items.map((task) => {
              const { start, end } = taskSpan(task);
              const left = pct(start);
              const width = Math.max(pct(end) - left, 1.5);
              return (
                <div
                  key={task.id}
                  className="grid grid-cols-[180px_1fr] items-center border-b border-border"
                >
                  <div className="truncate px-2 py-2 pl-4 text-sm text-muted-foreground">
                    {task.title}
                  </div>
                  <div className="relative h-9">
                    <button
                      type="button"
                      onClick={() => onTaskClick(task)}
                      title={`${task.title} — due ${formatDate(task.dueDate)}`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      className={cn(
                        "absolute top-1/2 flex h-5 -translate-y-1/2 items-center overflow-hidden rounded px-1.5 text-[11px] text-white",
                        projectColor(task.projectId).bar,
                        task.status === "DONE" && "opacity-60",
                      )}
                    >
                      <span className="truncate">{formatDate(task.dueDate)}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
