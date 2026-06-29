import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { LifeBuoy, Loader2, Plus, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MultiSelectFilter } from "../components/common/MultiSelectFilter";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ActiveRangeBadge } from "../components/common/ActiveRangeBadge";
import { DateRangeFilter } from "../components/common/DateRangeFilter";
import { EmptyState } from "../components/common/EmptyState";
import { ErrorState } from "../components/common/ErrorState";
import { LoadingState } from "../components/common/LoadingState";
import { PageHeader } from "../components/layout/PageHeader";
import { useAuth } from "../context/auth-context";
import { formatDateTime } from "../lib/format";
import { makeRange, rangeLabel, rangeToParams, type DateRange } from "../lib/date-range";
import { MobileFiltersSheet } from "../components/mobile/MobileFiltersSheet";
import {
  MobileFilterChips,
  type FilterChip,
} from "../components/mobile/MobileFilterChips";
import {
  addTicketMessage,
  apiErrorMessage,
  createTicket,
  getTicket,
  listTickets,
  updateTicket,
} from "../lib/tickets-api";
import { listUsers } from "../lib/users-api";
import type { User } from "../types/user";
import {
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
  TICKET_TEAMS,
  TICKET_TEAM_LABELS,
  TICKET_TEAM_SHORT,
  type Ticket,
  type TicketCategory,
  type TicketMessage,
  type TicketPriority,
  type TicketStatus,
  type TicketTeam,
} from "../types/ticket";

const STATUS_STYLE: Record<TicketStatus, string> = {
  OPEN: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
  IN_PROGRESS: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
  WAITING: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
  RESOLVED: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  CLOSED: "bg-slate-500/12 text-slate-600 dark:text-slate-400",
};

function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_STYLE[status])}>
      {TICKET_STATUS_LABELS[status]}
    </span>
  );
}

export function HelpDeskPage() {
  const { user } = useAuth();
  const isStaff = user?.role === "ADMIN" || user?.role === "HR";

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Multi-select status, filtered client-side (empty = all).
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [range, setRange] = useState<DateRange>(() => makeRange("all"));
  const [createOpen, setCreateOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Skeleton shows only on the first load; later refreshes update in place.
  const loadedOnce = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const data = await listTickets(undefined, rangeToParams(range));
        if (!cancelled) setError(null);
        if (!cancelled) setTickets(data);
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, "Failed to load tickets."));
      } finally {
        if (!cancelled) {
          setLoading(false);
          loadedOnce.current = true;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [range, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  // Near-live: silently refetch on an interval + when the tab refocuses.
  useAutoRefresh(reload);

  // Status is filtered client-side so several can be selected at once.
  const visibleTickets = statusFilter.length
    ? tickets.filter((t) => statusFilter.includes(t.status))
    : tickets;

  // Active-filter summary, shared by the mobile Filters sheet + chips.
  const filterChips: FilterChip[] = [];
  if (statusFilter.length)
    filterChips.push({
      key: "status",
      label:
        statusFilter.length === 1
          ? TICKET_STATUS_LABELS[statusFilter[0] as TicketStatus]
          : `${statusFilter.length} statuses`,
      onRemove: () => setStatusFilter([]),
    });
  if (range.preset !== "all")
    filterChips.push({
      key: "range",
      label: rangeLabel(range),
      onRemove: () => setRange(makeRange("all")),
    });
  const activeFilterCount = filterChips.length;
  function clearFilters() {
    setStatusFilter([]);
    setRange(makeRange("all"));
  }

  return (
    <>
      <PageHeader
        title="Help Desk"
        description={
          isStaff
            ? "Support tickets raised across the organization."
            : "Raise a support request or ask a question."
        }
        breadcrumbs={[{ label: "Help Desk" }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Desktop / tablet filter toolbar (unchanged) */}
            <div className="hidden flex-wrap items-center gap-2 md:flex">
              <ActiveRangeBadge range={range} />
              <DateRangeFilter value={range} onChange={setRange} hideIcon />
              <MultiSelectFilter
                label="Status"
                options={TICKET_STATUSES.map((s) => ({ value: s, label: TICKET_STATUS_LABELS[s] }))}
                selected={statusFilter}
                onChange={setStatusFilter}
                className="w-36"
              />
            </div>
            {/* Mobile: Filters bottom sheet */}
            <MobileFiltersSheet
              activeCount={activeFilterCount}
              onClear={clearFilters}
              className="md:hidden"
            >
              <FilterField label="Status">
                <MultiSelectFilter
                  label="Status"
                  options={TICKET_STATUSES.map((s) => ({ value: s, label: TICKET_STATUS_LABELS[s] }))}
                  selected={statusFilter}
                  onChange={setStatusFilter}
                  className="w-full"
                />
              </FilterField>
              <FilterField label="Date">
                <DateRangeFilter value={range} onChange={setRange} />
              </FilterField>
            </MobileFiltersSheet>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              New Ticket
            </Button>
          </div>
        }
      />

      {/* Mobile: active-filter chips */}
      <div className="md:hidden">
        <MobileFilterChips chips={filterChips} />
      </div>

      {error ? (
        <Card className="p-6">
          <ErrorState title="Couldn't load tickets" description={error} onRetry={reload} />
        </Card>
      ) : loading && !loadedOnce.current ? (
        <Card className="p-6">
          <LoadingState label="Loading tickets…" />
        </Card>
      ) : visibleTickets.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={LifeBuoy}
            title="No tickets yet"
            description={
              isStaff
                ? "Support requests will appear here."
                : "Raise your first request and the team will respond."
            }
            action={
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" />
                New Ticket
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead>Ref</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Category</TableHead>
                  {isStaff && <TableHead>Team</TableHead>}
                  {isStaff && <TableHead>Requester</TableHead>}
                  <TableHead>Status</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleTickets.map((t) => (
                  <TableRow
                    key={t.id}
                    className="cursor-pointer"
                    onClick={() => setOpenId(t.id)}
                  >
                    <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                      {t.code ?? "—"}
                    </TableCell>
                    <TableCell className="font-medium text-foreground">{t.subject}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {TICKET_CATEGORY_LABELS[t.category]}
                    </TableCell>
                    {isStaff && (
                      <TableCell>
                        <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {TICKET_TEAM_SHORT[t.team]}
                        </span>
                      </TableCell>
                    )}
                    {isStaff && (
                      <TableCell className="text-muted-foreground">{t.createdByName}</TableCell>
                    )}
                    <TableCell>
                      <StatusBadge status={t.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateTime(t.updatedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <ul className="flex flex-col divide-y md:hidden">
            {visibleTickets.map((t) => (
              <li
                key={t.id}
                role="button"
                tabIndex={0}
                onClick={() => setOpenId(t.id)}
                onKeyDown={(e) => e.key === "Enter" && setOpenId(t.id)}
                className="flex cursor-pointer flex-col gap-2 p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {t.code && (
                      <p className="font-mono text-xs text-muted-foreground">
                        {t.code}
                      </p>
                    )}
                    <p className="break-words font-medium text-foreground">{t.subject}</p>
                  </div>
                  <span className="shrink-0">
                    <StatusBadge status={t.status} />
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{TICKET_CATEGORY_LABELS[t.category]}</span>
                  {isStaff && (
                    <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {TICKET_TEAM_SHORT[t.team]}
                    </span>
                  )}
                  {isStaff && <span>{t.createdByName}</span>}
                  <span>{formatDateTime(t.updatedAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <CreateTicketDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={reload}
      />
      <TicketDialog
        ticketId={openId}
        isStaff={isStaff}
        isAdmin={user?.role === "ADMIN"}
        onOpenChange={(o) => !o && setOpenId(null)}
        onChanged={reload}
      />
    </>
  );
}

/** Labelled control wrapper used inside the mobile Filters sheet. */
function FilterField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function CreateTicketDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open && <CreateTicketBody onOpenChange={onOpenChange} onCreated={onCreated} />}
      </DialogContent>
    </Dialog>
  );
}

function CreateTicketBody({
  onOpenChange,
  onCreated,
}: {
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const { user } = useAuth();
  // HR can only file into their own queue; they can't route to the platform
  // (SYSTEM) team. The picker is locked to HR for them.
  const isHr = user?.role === "HR";
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<TicketCategory>("QUESTION");
  const [team, setTeam] = useState<TicketTeam>(isHr ? "HR" : "SYSTEM");
  const [priority, setPriority] = useState<TicketPriority>("MEDIUM");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = subject.trim() !== "" && description.trim() !== "";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await createTicket({ subject, description, category, team, priority });
      toast.success("Ticket raised.");
      onOpenChange(false);
      onCreated();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't raise ticket."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>New Ticket</DialogTitle>
        <DialogDescription>Describe your request and the team will respond.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4 py-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="t-subject">Subject</Label>
          <Input id="t-subject" value={subject} onChange={(e) => setSubject(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="t-desc">Description</Label>
          <Textarea id="t-desc" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="t-team">Who can help?</Label>
          {isHr ? (
            <p
              id="t-team"
              className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground"
            >
              {TICKET_TEAM_LABELS.HR} — HR tickets stay in your queue.
            </p>
          ) : (
            <Select value={team} onValueChange={(v) => setTeam((v ?? "SYSTEM") as TicketTeam)}>
              <SelectTrigger id="t-team" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TICKET_TEAMS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TICKET_TEAM_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="t-cat">Category</Label>
            <Select value={category} onValueChange={(v) => setCategory((v ?? "QUESTION") as TicketCategory)}>
              <SelectTrigger id="t-cat" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TICKET_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {TICKET_CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="t-pri">Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority((v ?? "MEDIUM") as TicketPriority)}>
              <SelectTrigger id="t-pri" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TICKET_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {TICKET_PRIORITY_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit || submitting}>
          {submitting && <Loader2 className="size-4 animate-spin" />}
          Raise Ticket
        </Button>
      </DialogFooter>
    </form>
  );
}

function TicketDialog({
  ticketId,
  isStaff,
  isAdmin,
  onOpenChange,
  onChanged,
}: {
  ticketId: string | null;
  isStaff: boolean;
  isAdmin?: boolean;
  onOpenChange: (o: boolean) => void;
  onChanged: () => void;
}) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [staff, setStaff] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ticketId) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setReply("");
      try {
        const data = await getTicket(ticketId);
        if (!cancelled) {
          setTicket(data.ticket);
          setMessages(data.messages);
        }
      } catch (err) {
        if (!cancelled) toast.error(apiErrorMessage(err, "Couldn't load ticket."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  // Staff list for the assignee picker (responders are ADMIN/HR). Loaded once
  // when a staff member opens a ticket.
  useEffect(() => {
    if (!isStaff || !ticketId || staff.length > 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const [admins, hr] = await Promise.all([
          listUsers({ role: "ADMIN", isActive: true, limit: 100 }),
          listUsers({ role: "HR", isActive: true, limit: 100 }),
        ]);
        if (!cancelled) setStaff([...admins.data, ...hr.data]);
      } catch {
        // Non-fatal: the picker simply stays empty.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isStaff, ticketId, staff.length]);

  async function applyUpdate(
    patch: {
      status?: TicketStatus;
      priority?: TicketPriority;
      team?: TicketTeam;
      assignedTo?: string;
    },
    failMsg: string,
  ) {
    if (!ticket) return;
    setBusy(true);
    try {
      const updated = await updateTicket(ticket.id, patch);
      setTicket(updated);
      onChanged();
    } catch (err) {
      toast.error(apiErrorMessage(err, failMsg));
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!ticket || reply.trim() === "") return;
    setBusy(true);
    try {
      const msg = await addTicketMessage(ticket.id, reply.trim());
      setMessages((prev) => [...prev, msg]);
      setReply("");
      onChanged();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't send reply."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={ticketId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {loading || !ticket ? (
          <div className="py-10">
            <LoadingState label="Loading ticket…" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 break-words">{ticket.subject}</span>
                <span className="shrink-0">
                  <StatusBadge status={ticket.status} />
                </span>
              </DialogTitle>
              <DialogDescription>
                {ticket.code ? `${ticket.code} · ` : ""}
                {TICKET_CATEGORY_LABELS[ticket.category]} ·{" "}
                {TICKET_TEAM_SHORT[ticket.team]} team ·{" "}
                {TICKET_PRIORITY_LABELS[ticket.priority]} priority · raised by{" "}
                {ticket.createdByName}
              </DialogDescription>
            </DialogHeader>

            <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm text-foreground">
              {ticket.description}
            </p>

            {isStaff && (
              <div className="grid grid-cols-1 gap-3 rounded-md border border-border/60 bg-muted/20 p-3 sm:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <Select
                    value={ticket.status}
                    onValueChange={(v) => v && applyUpdate({ status: v as TicketStatus }, "Couldn't update status.")}
                  >
                    <SelectTrigger size="sm" className="w-full" disabled={busy}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TICKET_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {TICKET_STATUS_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">Priority</Label>
                  <Select
                    value={ticket.priority}
                    onValueChange={(v) => v && applyUpdate({ priority: v as TicketPriority }, "Couldn't update priority.")}
                  >
                    <SelectTrigger size="sm" className="w-full" disabled={busy}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TICKET_PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {TICKET_PRIORITY_LABELS[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">Assignee</Label>
                  <Select
                    value={ticket.assignedTo ?? "unassigned"}
                    onValueChange={(v) =>
                      v && v !== (ticket.assignedTo ?? "unassigned") &&
                      applyUpdate({ assignedTo: v }, "Couldn't update assignee.")
                    }
                  >
                    <SelectTrigger size="sm" className="w-full" disabled={busy}>
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      {ticket.assignedTo === undefined && (
                        <SelectItem value="unassigned" disabled>
                          Unassigned
                        </SelectItem>
                      )}
                      {staff.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {isAdmin && (
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">Team</Label>
                    <Select
                      value={ticket.team}
                      onValueChange={(v) =>
                        v &&
                        v !== ticket.team &&
                        applyUpdate({ team: v as TicketTeam }, "Couldn't reassign team.")
                      }
                    >
                      <SelectTrigger size="sm" className="w-full" disabled={busy}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TICKET_TEAMS.map((t) => (
                          <SelectItem key={t} value={t}>
                            {TICKET_TEAM_LABELS[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            <div className="flex max-h-56 flex-col gap-3 overflow-y-auto border-t border-border/60 pt-3">
              {messages.length === 0 ? (
                <p className="py-2 text-center text-xs text-muted-foreground">
                  No replies yet.
                </p>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 truncate text-sm font-medium text-foreground">{m.authorName}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatDateTime(m.createdAt)}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                      {m.body}
                    </p>
                  </div>
                ))
              )}
            </div>

            <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
              <Textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Write a reply…"
                rows={2}
              />
              <div className="flex justify-end">
                <Button size="sm" onClick={send} disabled={busy || reply.trim() === ""}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  Reply
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
