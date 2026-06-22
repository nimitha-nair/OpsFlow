import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  Banknote,
  Receipt,
  Timer,
  Users,
  Wallet,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { EmptyState } from "../components/common/EmptyState";
import { ErrorState } from "../components/common/ErrorState";
import { LoadingState } from "../components/common/LoadingState";
import { MetricCard } from "../components/common/MetricCard";
import { PageHeader } from "../components/layout/PageHeader";
import { Sparkline, ACCENT_TEXT } from "../components/reports/bi";
import {
  deriveDepartments,
  type DepartmentMetric,
} from "../components/reports/workspace/derive";
import { apiErrorMessage, listUsers } from "../lib/users-api";
import { listReviewExpenses } from "../lib/expenses-api";
import { formatCompactMoney } from "../lib/format";
import type { Expense } from "../types/expense";
import type { User } from "../types/user";

export function DepartmentsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [records, setRecords] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [usersResp, recs] = await Promise.all([
          listUsers({ limit: 1000 }),
          listReviewExpenses("ALL"),
        ]);
        if (!cancelled) {
          setUsers(usersResp.data);
          setRecords(recs);
        }
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, "Failed to load data."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const departments = useMemo(
    () => deriveDepartments(records, users),
    [records, users],
  );
  const named = departments.filter((d) => d.name !== "Unassigned");
  const totalSpend = departments.reduce((s, d) => s + d.totalSpend, 0);
  const totalOutstanding = departments.reduce(
    (s, d) => s + d.reimbursementPending,
    0,
  );

  return (
    <>
      <PageHeader
        title="Departments"
        description="Operational performance across every department."
        breadcrumbs={[{ label: "Admin", to: "/admin" }, { label: "Departments" }]}
      />

      {loading ? (
        <LoadingState label="Loading departments…" />
      ) : error ? (
        <ErrorState
          title="Couldn't load departments"
          description={error}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      ) : users.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={Building2}
            title="No users yet"
            description="Department analytics will appear once users exist."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              index={0}
              accent="indigo"
              icon={Building2}
              label="Departments"
              value={named.length}
            />
            <MetricCard
              index={1}
              accent="violet"
              icon={Users}
              label="People tracked"
              value={users.length}
              hint={`${users.filter((u) => u.isActive).length} active`}
            />
            <MetricCard
              index={2}
              emphasize
              accent="emerald"
              icon={Wallet}
              label="Total approved spend"
              value={formatCompactMoney(totalSpend)}
            />
            <MetricCard
              index={3}
              accent="amber"
              icon={Banknote}
              label="Reimbursement outstanding"
              value={formatCompactMoney(totalOutstanding)}
            />
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {departments.map((d, i) => (
              <DepartmentCard key={d.name} dept={d} index={i} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

const ACCENTS_CYCLE = ["indigo", "violet", "emerald", "amber", "sky", "rose"] as const;

function DepartmentCard({ dept, index }: { dept: DepartmentMetric; index: number }) {
  const accent = ACCENTS_CYCLE[index % ACCENTS_CYCLE.length]!;
  const to = `/admin/departments/${encodeURIComponent(dept.name)}`;
  const risk = dept.risk >= 0.5 ? "high" : dept.risk >= 0.25 ? "med" : "low";
  const riskCls =
    risk === "high"
      ? "bg-rose-500/12 text-rose-600 dark:text-rose-400"
      : risk === "med"
        ? "bg-amber-500/12 text-amber-600 dark:text-amber-400"
        : "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400";

  return (
    <Link to={to} className="block h-full">
      <Card
        style={{ ["--r-i" as string]: index }}
        className="r-card r-rise h-full gap-0 p-0"
      >
        <div className="flex items-start justify-between gap-3 p-5 pb-4">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold tracking-tight text-foreground">
              {dept.name}
            </h3>
            <p className="text-xs text-muted-foreground">
              {dept.activeHeadcount}/{dept.headcount} active ·{" "}
              {dept.projectsEngaged} project{dept.projectsEngaged === 1 ? "" : "s"}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${riskCls}`}
          >
            {risk === "high" ? "High risk" : risk === "med" ? "Watch" : "Healthy"}
          </span>
        </div>

        <div className="flex items-end justify-between gap-3 px-5">
          <div>
            <div className="text-2xl font-bold tabular-nums tracking-tight text-foreground">
              {formatCompactMoney(dept.totalSpend)}
            </div>
            <div className="text-xs text-muted-foreground">
              approved spend · {Math.round(dept.shareOfSpend * 100)}% of org
            </div>
          </div>
          <div className={`h-10 w-24 ${ACCENT_TEXT[accent]}`}>
            <Sparkline points={dept.spark.length > 1 ? dept.spark : [0, 0]} height={40} />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 divide-x divide-border/60 border-t border-border/60">
          <CardStat
            icon={Receipt}
            label="Expenses"
            value={String(dept.expenseCount)}
          />
          <CardStat
            icon={Timer}
            label="Turnaround"
            value={
              dept.avgProcessingDays === null
                ? "—"
                : `${dept.avgProcessingDays.toFixed(1)}d`
            }
          />
          <CardStat
            icon={Banknote}
            label="Reimb. due"
            value={formatCompactMoney(dept.reimbursementPending)}
          />
        </div>

        <div className="flex items-center justify-between border-t border-border/60 px-5 py-3 text-sm font-medium text-muted-foreground transition-colors group-hover/card:text-foreground">
          <span>View details</span>
          <ArrowRight className="size-4" />
        </div>
      </Card>
    </Link>
  );
}

function CardStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Receipt;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-2 py-3 text-center">
      <Icon className="size-4 text-muted-foreground" />
      <div className="text-sm font-semibold tabular-nums text-foreground">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}
