import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, LifeBuoy } from "lucide-react";

import { cn } from "@/lib/utils";
import { SectionCard } from "../common/SectionCard";
import { EmptyState } from "../common/EmptyState";
import { LoadingState } from "../common/LoadingState";
import { formatRelativeTime } from "../../lib/format";
import { apiErrorMessage, listTickets } from "../../lib/tickets-api";
import {
  TICKET_STATUS_LABELS,
  type Ticket,
  type TicketStatus,
} from "../../types/ticket";

const STATUS_STYLE: Record<TicketStatus, string> = {
  OPEN: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
  IN_PROGRESS: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
  WAITING: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
  RESOLVED: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  CLOSED: "bg-slate-500/12 text-slate-600 dark:text-slate-400",
};

const ACTIVE: TicketStatus[] = ["OPEN", "IN_PROGRESS", "WAITING"];

interface TicketsWidgetProps {
  /** Role base path, e.g. "/employee" | "/admin" | "/hr". */
  basePath: string;
  title?: string;
  /** Shown for staff to surface who raised each ticket. */
  showRequester?: boolean;
}

/**
 * Dashboard widget for help-desk tickets. The backend scopes the list by role
 * (employees see their own, staff see all), so this works for every dashboard.
 */
export function TicketsWidget({
  basePath,
  title = "Support tickets",
  showRequester,
}: TicketsWidgetProps) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await listTickets();
        if (!cancelled) setTickets(data);
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, "Failed to load tickets."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const active = tickets.filter((t) => ACTIVE.includes(t.status));
  const recent = [...tickets]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);

  return (
    <SectionCard
      title={title}
      description={loading ? "Loading…" : `${active.length} open`}
      actions={
        <Link
          to={`${basePath}/helpdesk`}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Open Help Desk <ArrowRight className="size-3" />
        </Link>
      }
    >
      {loading ? (
        <LoadingState compact label="Loading tickets…" />
      ) : error ? (
        <p className="py-4 text-center text-xs text-muted-foreground">{error}</p>
      ) : recent.length === 0 ? (
        <EmptyState
          compact
          icon={LifeBuoy}
          title="No tickets yet"
          description="Support requests will appear here."
        />
      ) : (
        <ul className="flex flex-col divide-y">
          {recent.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {t.subject}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {showRequester ? `${t.createdByName} · ` : ""}
                  {formatRelativeTime(t.updatedAt)}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
                  STATUS_STYLE[t.status],
                )}
              >
                {TICKET_STATUS_LABELS[t.status]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
