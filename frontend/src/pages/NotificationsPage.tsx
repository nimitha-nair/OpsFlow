import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ActiveRangeBadge } from "../components/common/ActiveRangeBadge";
import { DateRangeFilter } from "../components/common/DateRangeFilter";
import { EmptyState } from "../components/common/EmptyState";
import { ErrorState } from "../components/common/ErrorState";
import { LoadingState } from "../components/common/LoadingState";
import { PageHeader } from "../components/layout/PageHeader";
import { useAuth } from "../context/auth-context";
import { roleBasePath } from "../lib/navigation";
import { formatDateTime } from "../lib/format";
import { makeRange, rangeToParams, type DateRange } from "@/lib/date-range";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../lib/notifications-api";
import type { Notification, NotificationType } from "../types/notification";

type Category = "all" | "tasks" | "tickets" | "discussion" | "expenses";

const CATEGORY_OF: Record<NotificationType, Exclude<Category, "all">> = {
  TASK_ASSIGNED: "tasks",
  TASK_UPDATED: "tasks",
  TASK_STATUS: "tasks",
  TASK_DUE_DATE: "tasks",
  TICKET_UPDATE: "tickets",
  COMMENT: "discussion",
  REPLY: "discussion",
  MENTION: "discussion",
  EXPENSE_SUBMITTED: "expenses",
  EXPENSE_APPROVED: "expenses",
  EXPENSE_REJECTED: "expenses",
  EXPENSE_PAID: "expenses",
};

const CATEGORY_LABELS: Record<Category, string> = {
  all: "All",
  tasks: "Tasks",
  tickets: "Tickets",
  discussion: "Comments & mentions",
  expenses: "Expenses",
};

export function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [category, setCategory] = useState<Category>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [range, setRange] = useState<DateRange>(() => makeRange("all"));

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const r = await listNotifications(rangeToParams(range));
        if (!cancelled) {
          setItems(r.data);
          setError(null);
        }
      } catch {
        if (!cancelled) setError("We couldn't load your notifications.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey, range]);

  const filtered = useMemo(
    () =>
      items.filter(
        (n) =>
          (category === "all" || CATEGORY_OF[n.type] === category) &&
          (!unreadOnly || !n.read),
      ),
    [items, category, unreadOnly],
  );

  const unread = items.filter((n) => !n.read).length;

  function onItem(n: Notification) {
    if (!n.read) {
      markNotificationRead(n.id).catch(() => {});
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    }
    if (user) {
      if (n.ticketId) navigate(`${roleBasePath[user.role]}/helpdesk`);
      else if (n.taskId) navigate(`${roleBasePath[user.role]}/kanban`);
    }
  }

  function onMarkAll() {
    markAllNotificationsRead().catch(() => {});
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
  }

  return (
    <>
      <PageHeader
        title="Notifications"
        description={
          unread > 0 ? `${unread} unread` : "You're all caught up."
        }
        breadcrumbs={[{ label: "Notifications" }]}
        actions={
          unread > 0 ? (
            <Button variant="outline" size="sm" onClick={onMarkAll}>
              <CheckCheck className="size-4" />
              Mark all read
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              category === c
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {CATEGORY_LABELS[c]}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setUnreadOnly((v) => !v)}
          className={cn(
            "rounded-full border px-3 py-1 text-sm transition-colors",
            unreadOnly
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          Unread only
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <ActiveRangeBadge range={range} />
          <DateRangeFilter value={range} onChange={setRange} hideIcon />
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        {loading ? (
          <LoadingState label="Loading notifications…" />
        ) : error ? (
          <div className="p-6">
            <ErrorState
              title="Couldn't load notifications"
              description={error}
              onRetry={() => setReloadKey((k) => k + 1)}
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Bell}
              title="Nothing here"
              description={
                unreadOnly
                  ? "No unread notifications in this view."
                  : "Notifications about your tasks, tickets and mentions will appear here."
              }
            />
          </div>
        ) : (
          <ul className="flex flex-col">
            {filtered.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => onItem(n)}
                  className={cn(
                    "flex w-full flex-col gap-0.5 border-b border-border/60 px-4 py-3 text-left transition-colors last:border-0 hover:bg-muted/50",
                    !n.read && "bg-primary/[0.04]",
                  )}
                >
                  <div className="flex items-center gap-2">
                    {!n.read && (
                      <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                    )}
                    <span className="min-w-0 break-words text-sm font-medium text-foreground">{n.title}</span>
                  </div>
                  <span className="break-words text-sm text-muted-foreground">{n.body}</span>
                  <span className="text-xs text-muted-foreground/70">
                    {formatDateTime(n.createdAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
