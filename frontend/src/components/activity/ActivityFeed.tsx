import { useEffect, useState } from "react";
import {
  Activity as ActivityIcon,
  Banknote,
  Briefcase,
  ClipboardList,
  LayoutGrid,
  LifeBuoy,
  ListOrdered,
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
  reimbursement: Banknote,
  user: Users,
  project: Briefcase,
};

// Literal class strings (Tailwind can't see dynamically-built names).
const ENTITY_STYLE: Record<ActivityEntity, string> = {
  ticket: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
  task: "bg-indigo-500/12 text-indigo-600 dark:text-indigo-400",
  expense: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  reimbursement: "bg-teal-500/12 text-teal-600 dark:text-teal-400",
  user: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
  project: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
};

/** Plural category labels, in the order chips/groups should appear. */
const ENTITY_LABEL: Record<ActivityEntity, string> = {
  task: "Tasks",
  expense: "Expenses",
  reimbursement: "Reimbursements",
  ticket: "Tickets",
  project: "Projects",
  user: "Users",
};
const ENTITY_ORDER: ActivityEntity[] = [
  "task",
  "expense",
  "reimbursement",
  "ticket",
  "project",
  "user",
];

type Filter = ActivityEntity | "all";

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

/** Group by entity category, ordered per ENTITY_ORDER; events stay newest-first. */
function groupByType(events: ActivityEvent[]): DayGroup[] {
  const byEntity = new Map<ActivityEntity, ActivityEvent[]>();
  for (const ev of events) {
    const list = byEntity.get(ev.entity);
    if (list) list.push(ev);
    else byEntity.set(ev.entity, [ev]);
  }
  return ENTITY_ORDER.filter((e) => byEntity.has(e)).map((e) => ({
    label: ENTITY_LABEL[e],
    events: byEntity.get(e)!,
  }));
}

interface ActivityFeedProps {
  /** Max events to request. Default 40. */
  limit?: number;
  /** Denser styling for dashboard widgets. */
  compact?: boolean;
  className?: string;
  /** Optional date-range params forwarded to the backend (ISO from/to). */
  dateParams?: { from?: string; to?: string };
}

export function ActivityFeed({ limit = 40, compact, className, dateParams }: ActivityFeedProps) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [grouping, setGrouping] = useState<"day" | "type">("day");
  // Filter controls are for the full Activity page, not dense dashboard widgets.
  const showControls = !compact;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const data = await listActivity(limit, dateParams);
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
  }, [limit, reloadKey, dateParams?.from, dateParams?.to]);

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

  const availableEntities = ENTITY_ORDER.filter((e) =>
    events.some((ev) => ev.entity === e),
  );
  const visible =
    filter === "all" ? events : events.filter((ev) => ev.entity === filter);
  const groups =
    grouping === "type" ? groupByType(visible) : groupByDay(visible);

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      {showControls && (
        <div className="flex flex-col gap-3 border-b border-border/40 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <FilterChip
              label="All"
              active={filter === "all"}
              onClick={() => setFilter("all")}
            />
            {availableEntities.map((e) => (
              <FilterChip
                key={e}
                label={ENTITY_LABEL[e]}
                active={filter === e}
                onClick={() => setFilter(e)}
              />
            ))}
          </div>
          <div className="flex items-center gap-1 self-start rounded-lg border border-border/60 p-0.5">
            <GroupToggle
              icon={ListOrdered}
              label="By date"
              active={grouping === "day"}
              onClick={() => setGrouping("day")}
            />
            <GroupToggle
              icon={LayoutGrid}
              label="By type"
              active={grouping === "type"}
              onClick={() => setGrouping("type")}
            />
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No {filter === "all" ? "" : `${ENTITY_LABEL[filter].toLowerCase()} `}
          activity in this range.
        </p>
      ) : (
        groups.map((group) => (
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
                      <span className="min-w-0 break-words text-sm font-medium text-foreground">{ev.title}</span>
                      {ev.code && (
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">{ev.code}</span>
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
        ))
      )}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border/70 text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function GroupToggle({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}
