import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { projectColor } from "../../lib/project-color";
import {
  WEEKDAY_LABELS,
  addDays,
  addMonths,
  monthLabel,
  monthMatrix,
  weekDays,
  ymd,
} from "../../lib/calendar-utils";
import type { Task } from "../../types/task";

interface CalendarViewProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

export function CalendarView({ tasks, onTaskClick }: CalendarViewProps) {
  const [mode, setMode] = useState<"month" | "week">("month");
  const [viewDate, setViewDate] = useState<Date>(() => new Date());

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      const key = task.dueDate.slice(0, 10);
      const list = map.get(key);
      if (list) list.push(task);
      else map.set(key, [task]);
    }
    return map;
  }, [tasks]);

  const days = mode === "month" ? monthMatrix(viewDate) : weekDays(viewDate);
  const todayKey = ymd(new Date());
  const currentMonth = viewDate.getMonth();

  function shift(direction: -1 | 1) {
    setViewDate((prev) =>
      mode === "month"
        ? addMonths(prev, direction)
        : addDays(prev, direction * 7),
    );
  }

  const rangeLabel =
    mode === "month"
      ? monthLabel(viewDate)
      : `Week of ${weekDays(viewDate)[0]?.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => shift(-1)} aria-label="Previous">
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-44 text-center text-sm font-medium">
            {rangeLabel}
          </span>
          <Button variant="outline" size="icon" onClick={() => shift(1)} aria-label="Next">
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setViewDate(new Date())}>
            Today
          </Button>
        </div>
        <div className="inline-flex rounded-lg border border-border p-0.5">
          {(["month", "week"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded-md px-3 py-1 text-sm capitalize",
                mode === m
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <div className="grid grid-cols-7 border-b border-border bg-muted/40">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="px-2 py-1.5 text-center text-xs font-medium text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const key = ymd(day);
            const dayTasks = tasksByDay.get(key) ?? [];
            const isOtherMonth =
              mode === "month" && day.getMonth() !== currentMonth;
            const isToday = key === todayKey;
            return (
              <div
                key={key}
                className={cn(
                  "min-h-24 border-b border-r border-border p-1.5 last:border-r-0",
                  isOtherMonth && "bg-muted/20",
                  mode === "week" && "min-h-48",
                )}
              >
                <div
                  className={cn(
                    "mb-1 flex size-6 items-center justify-center rounded-full text-xs",
                    isToday
                      ? "bg-primary font-medium text-primary-foreground"
                      : isOtherMonth
                        ? "text-muted-foreground/60"
                        : "text-foreground",
                  )}
                >
                  {day.getDate()}
                </div>
                <div className="flex flex-col gap-1">
                  {dayTasks.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => onTaskClick(task)}
                      className="flex items-center gap-1.5 truncate rounded bg-muted/60 px-1.5 py-0.5 text-left text-xs hover:bg-muted"
                      title={task.title}
                    >
                      <span
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          projectColor(task.projectId).dot,
                        )}
                      />
                      <span className="truncate">{task.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
