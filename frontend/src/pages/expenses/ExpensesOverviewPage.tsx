import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  Clock,
  Search,
  Wallet,
  XCircle,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { PageHeader } from "../../components/layout/PageHeader";
import { StatCard } from "../../components/dashboard/StatCard";
import { ExpensesTable } from "../../components/expenses/ExpensesTable";
import { apiErrorMessage, listReviewExpenses } from "../../lib/expenses-api";
import { listProjects } from "../../lib/projects-api";
import { listUsers } from "../../lib/users-api";
import {
  CATEGORY_LABELS,
  EXPENSE_CATEGORIES,
  type Expense,
  type ExpenseCategory,
} from "../../types/expense";
import type { Project } from "../../types/project";

type StatusFilter = "ALL" | "PENDING" | "APPROVED" | "REJECTED";

const PENDING = ["SUBMITTED", "PENDING_REVIEW"];

function matchesStatus(e: Expense, f: StatusFilter): boolean {
  if (f === "ALL") return true;
  if (f === "PENDING") return PENDING.includes(e.approvalStatus);
  return e.approvalStatus === f;
}

export function ExpensesOverviewPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [userNames, setUserNames] = useState<Map<string, string>>(new Map());
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [category, setCategory] = useState<ExpenseCategory | "ALL">("ALL");
  const [projectId, setProjectId] = useState<string>("ALL");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [all, users, projs] = await Promise.all([
          listReviewExpenses("ALL"),
          listUsers({ limit: 100 }),
          listProjects({ limit: 100 }),
        ]);
        if (cancelled) return;
        setExpenses(all);
        setUserNames(new Map(users.data.map((u) => [u.id, u.name])));
        setProjects(projs.data);
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, "Failed to load expenses."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const getEmployeeName = useMemo(
    () => (id: string) => userNames.get(id) ?? "Unknown",
    [userNames],
  );
  const projectNames = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects],
  );
  const getProjectName = useMemo(
    () => (id: string) => projectNames.get(id) ?? "—",
    [projectNames],
  );

  const summary = useMemo(
    () => ({
      total: expenses.length,
      pending: expenses.filter((e) => matchesStatus(e, "PENDING")).length,
      approved: expenses.filter((e) => e.approvalStatus === "APPROVED").length,
      rejected: expenses.filter((e) => e.approvalStatus === "REJECTED").length,
    }),
    [expenses],
  );

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return expenses.filter((e) => {
      if (!matchesStatus(e, status)) return false;
      if (category !== "ALL" && e.category !== category) return false;
      if (projectId !== "ALL" && e.projectId !== projectId) return false;
      if (!needle) return true;
      const haystack = [
        getEmployeeName(e.employeeId),
        CATEGORY_LABELS[e.category],
        e.description,
        e.projectId ? getProjectName(e.projectId) : "general",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [expenses, status, category, projectId, search, getEmployeeName, getProjectName]);

  return (
    <>
      <PageHeader
        title="All Expenses"
        description="Complete expense lifecycle across the organization."
        breadcrumbs={[{ label: "Admin", to: "/admin" }, { label: "Expenses" }]}
        actions={
          <Link
            to="/admin/expenses/projects"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Project Spending
          </Link>
        }
      />

      {error ? (
        <Card className="p-6">
          <ErrorState
            title="Couldn't load expenses"
            description={error}
            onRetry={() => setReloadKey((k) => k + 1)}
          />
        </Card>
      ) : loading ? (
        <Card className="p-6">
          <LoadingState label="Loading expenses…" />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Total Expenses" value={summary.total} icon={Wallet} />
            <StatCard label="Pending Review" value={summary.pending} icon={Clock} />
            <StatCard label="Approved" value={summary.approved} icon={CheckCircle2} />
            <StatCard label="Rejected" value={summary.rejected} icon={XCircle} />
          </div>

          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search employee, category, description…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={status} onValueChange={(v) => setStatus((v ?? "ALL") as StatusFilter)}>
              <SelectTrigger className="lg:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={category}
              onValueChange={(v) => setCategory((v ?? "ALL") as ExpenseCategory | "ALL")}
            >
              <SelectTrigger className="lg:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All categories</SelectItem>
                {EXPENSE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={projectId} onValueChange={(v) => setProjectId(v ?? "ALL")}>
              <SelectTrigger className="lg:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All projects</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Card className="overflow-hidden p-0">
            {visible.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={Wallet}
                  title="No expenses found"
                  description="No expenses match the current filters."
                />
              </div>
            ) : (
              <ExpensesTable
                expenses={visible}
                getEmployeeName={getEmployeeName}
                getProjectName={getProjectName}
                basePath="/admin/expenses"
              />
            )}
          </Card>
        </div>
      )}
    </>
  );
}
