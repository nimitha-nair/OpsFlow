import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  PencilLine,
  XCircle,
} from "lucide-react";

import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { SectionCard } from "../../components/common/SectionCard";
import { MetricCard } from "../../components/common/MetricCard";
import { DashboardHero } from "../../components/dashboard/DashboardHero";
import {
  ApprovalStatusBadge,
  CreationMethodBadge,
} from "../../components/expenses/ExpenseBadges";
import { apiErrorMessage, listReviewExpenses } from "../../lib/expenses-api";
import { listUsers } from "../../lib/users-api";
import { formatDate, formatMoney } from "../../lib/format";
import type { Expense } from "../../types/expense";

const PENDING = ["SUBMITTED", "PENDING_REVIEW"];
const today = () => new Date().toISOString().slice(0, 10);

export function HrDashboard() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [userNames, setUserNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [all, users] = await Promise.all([
          listReviewExpenses("ALL"),
          listUsers({ limit: 100 }),
        ]);
        if (cancelled) return;
        setExpenses(all);
        setUserNames(new Map(users.data.map((u) => [u.id, u.name])));
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, "Failed to load dashboard."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const employeeName = (id: string) => userNames.get(id) ?? "Unknown";

  const stats = useMemo(() => {
    const d = today();
    const s = { pending: 0, approvedToday: 0, rejectedToday: 0, manual: 0 };
    for (const e of expenses) {
      if (PENDING.includes(e.approvalStatus)) s.pending += 1;
      if (e.approvalStatus === "APPROVED" && e.reviewedAt?.slice(0, 10) === d)
        s.approvedToday += 1;
      if (e.approvalStatus === "REJECTED" && e.reviewedAt?.slice(0, 10) === d)
        s.rejectedToday += 1;
      if (e.creationMethod === "MANUAL") s.manual += 1;
    }
    return s;
  }, [expenses]);

  const queue = useMemo(
    () =>
      [...expenses]
        .filter((e) => PENDING.includes(e.approvalStatus))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 8),
    [expenses],
  );

  return (
    <>
      <DashboardHero
        title="Review queue"
        status={
          loading ? (
            "Loading the review queue…"
          ) : stats.pending === 0 ? (
            "You're all caught up — nothing awaiting review."
          ) : (
            <>
              <strong className="font-semibold text-foreground">
                {stats.pending}
              </strong>{" "}
              expense{stats.pending === 1 ? "" : "s"} need your review
              {stats.manual > 0 ? (
                <>
                  {" · "}
                  <strong className="font-semibold text-foreground">
                    {stats.manual}
                  </strong>{" "}
                  manual
                </>
              ) : null}
            </>
          )
        }
        primary={{
          label: "Go to Review",
          to: "/hr/expenses",
          icon: <ClipboardCheck className="size-4" />,
        }}
      />

      {loading ? (
        <LoadingState label="Loading dashboard…" />
      ) : error ? (
        <ErrorState
          title="Couldn't load dashboard"
          description={error}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
            <MetricCard
              index={0}
              accent="amber"
              icon={Clock}
              label="Pending Reviews"
              value={stats.pending}
              to="/hr/expenses"
            />
            <MetricCard
              index={1}
              accent="emerald"
              icon={CheckCircle2}
              label="Approved Today"
              value={stats.approvedToday}
            />
            <MetricCard
              index={2}
              accent="rose"
              icon={XCircle}
              label="Rejected Today"
              value={stats.rejectedToday}
            />
            <MetricCard
              index={3}
              accent="violet"
              icon={PencilLine}
              label="Manual Expenses"
              value={stats.manual}
              hint="entered without a receipt"
            />
          </div>

          <SectionCard
            title="Needs review now"
            description="Most recent submissions awaiting a decision."
            actions={
              <Link
                to="/hr/expenses"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Open review <ArrowRight className="size-3" />
              </Link>
            }
          >
            {queue.length === 0 ? (
              <EmptyState
                compact
                icon={ClipboardCheck}
                title="Nothing to review"
                description="New submissions will appear here for your decision."
              />
            ) : (
              <ul className="flex flex-col divide-y">
                {queue.map((e) => (
                  <li key={e.id}>
                    <Link
                      to={`/hr/expenses/${e.id}`}
                      className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 hover:bg-muted/50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {employeeName(e.employeeId)}
                          <span className="font-normal text-muted-foreground">
                            {" · "}
                            {e.description || "Untitled expense"}
                          </span>
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {formatMoney(e.amount, e.currency)} ·{" "}
                          {formatDate(e.createdAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <CreationMethodBadge method={e.creationMethod} />
                        <ApprovalStatusBadge status={e.approvalStatus} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      )}
    </>
  );
}
