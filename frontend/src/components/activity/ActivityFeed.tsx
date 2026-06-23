import { useEffect, useState } from "react";
import {
  Activity as ActivityIcon,
  Briefcase,
  ClipboardList,
  LifeBuoy,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { EmptyState } from "../common/EmptyState";
import { ErrorState } from "../common/ErrorState";
import { LoadingState } from "../common/LoadingState";
import { formatRelativeTime } from "../../lib/format";
import { apiErrorMessage, listActivity } from "../../lib/activity-api";
import type { ActivityEntity, ActivityEvent } from "../../types/activity";

const ENTITY_ICON: Record<ActivityEntity, LucideIcon> = {
  ticket: LifeBuoy,
  task: ClipboardList,
  expense: Wallet,
  user: Users,
  project: Briefcase,
};

// Literal class strings (Tailwind can't see dynamically-built names).
const ENTITY_STYLE: Record<ActivityEntity, string> = {
  ticket: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
  task: "bg-indigo-500/12 text-indigo-600 dark:text-indigo-400",
  expense: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  user: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
  project: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
};

/** Local day bucket label: Today / Yesterday / <Mon D, YYYY>. */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(today) - startOf(d)) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

interface DayGroup {
  label: string;
  events: ActivityEvent[];
}

function groupByDay(events: ActivityEvent[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const ev of events) {
    const label = dayLabel(ev.timestamp);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.events.push(ev);
    else groups.push({ label, events: [ev] });
  }
  return groups;
}

interface ActivityFeedProps {
  /** Max events to request. Default 40. */
  limit?: number;
  /** Denser styling for dashboard widgets. */
  compact?: boolean;
  className?: string;
}

export function ActivityFeed({ limit = 40, compact, className }: ActivityFeedProps) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const data = await listActivity(limit);
        if (!cancelled) {
          setEvents(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, "Failed to load activity."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [limit, reloadKey]);

  if (loading) return <LoadingState label="Loading activity…" />;
  if (error)
    return (
      <ErrorState
        title="Couldn't load activity"
        description={error}
        onRetry={() => setReloadKey((k) => k + 1)}
      />
    );
  if (events.length === 0)
    return (
      <EmptyState
        icon={ActivityIcon}
        title="No activity yet"
        description="Tickets, tasks, expenses and team changes will show up here."
        compact={compact}
      />
    );

  const groups = groupByDay(events);

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.label}
          </p>
          <ul className="flex flex-col">
            {group.events.map((ev) => {
              const Icon = ENTITY_ICON[ev.entity];
              return (
                <li
                  key={ev.id}
                  className={cn(
                    "flex items-start gap-3 border-b border-border/40 last:border-0",
                    compact ? "py-2" : "py-3",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                      ENTITY_STYLE[ev.entity],
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-medium text-foreground">{ev.title}</span>
                      {ev.code && (
                        <span className="font-mono text-xs text-muted-foreground">{ev.code}</span>
                      )}
                    </div>
                    {ev.description && (
                      <p className="truncate text-sm text-muted-foreground">{ev.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {ev.actorName ? `${ev.actorName} · ` : ""}
                      {formatRelativeTime(ev.timestamp)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
