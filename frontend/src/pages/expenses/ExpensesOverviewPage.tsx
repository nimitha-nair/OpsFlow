import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/auth-context";
import { can, expensesBasePath } from "../../lib/permissions";
import {
  CheckCircle2,
  Clock,
  Download,
  Search,
  Wallet,
  XCircle,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MultiSelectFilter } from "../../components/common/MultiSelectFilter";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { ActiveRangeBadge } from "../../components/common/ActiveRangeBadge";
import { DateBasisToggle } from "../../components/common/DateBasisToggle";
import { DateRangeFilter } from "../../components/common/DateRangeFilter";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { StateCard } from "../../components/common/StateCard";
import { PageHeader } from "../../components/layout/PageHeader";
import {
  makeRange,
  rangeLabel,
  rangeSlug,
  rangeToParams,
  type DateRange,
} from "../../lib/date-range";
import { StatCard } from "../../components/dashboard/StatCard";
import { ExpensesTable } from "../../components/expenses/ExpensesTable";
import { MobileSearch } from "../../components/mobile/MobileSearch";
import { MobileFiltersSheet } from "../../components/mobile/MobileFiltersSheet";
import {
  MobileFilterChips,
  type FilterChip,
} from "../../components/mobile/MobileFilterChips";
import { apiErrorMessage, listReviewExpensesPaged } from "../../lib/expenses-api";
import { Pagination } from "../../components/Pagination";
import { downloadCsv, toExpensesCsv } from "../../lib/expenses-csv";
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

const STATUS_OPTIONS = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];

export function ExpensesOverviewPage() {
  const { user } = useAuth();
  const base = user ? expensesBasePath(user.role) : "/admin/expenses";
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [userNames, setUserNames] = useState<Map<string, string>>(new Map());
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Skeleton shows only on the first load; later refreshes update in place.
  const loadedOnce = useRef(false);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  // Multi-select filters: empty array = no filter (all); several = OR within field.
  const [status, setStatus] = useState<string[]>([]);
  const [category, setCategory] = useState<string[]>([]);
  const [projectId, setProjectId] = useState<string[]>([]);
  // q is sent server-side; status/category/projectId are filtered client-side.
  const [q, setQ] = useState("");
  const [range, setRange] = useState<DateRange>(() => makeRange("all"));
  const [basis, setBasis] = useState<"expenseDate" | "submittedAt">("submittedAt");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [resp, users, projs] = await Promise.all([
          listReviewExpensesPaged("ALL", { page, q, ...rangeToParams(range), basis }),
          listUsers({ limit: 100 }),
          listProjects({ limit: 100 }),
        ]);
        if (cancelled) return;
        setExpenses(resp.data);
        setTotalPages(resp.pagination.totalPages);
        setUserNames(new Map(users.data.map((u) => [u.id, u.name])));
        setProjects(projs.data);
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, "Failed to load expenses."));
      } finally {
        if (!cancelled) {
          setLoading(false);
          loadedOnce.current = true;
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey, range, basis, page, q]);

  // Near-live: silently refetch on an interval + when the tab refocuses.
  useAutoRefresh(() => setReloadKey((k) => k + 1));

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

  // q is filtered server-side; status/category/projectId remain client-side on the current page.
  const visible = useMemo(() => {
    return expenses.filter((e) => {
      if (status.length && !status.some((s) => matchesStatus(e, s as StatusFilter))) return false;
      if (category.length && !category.includes(e.category)) return false;
      if (projectId.length && !projectId.includes(e.projectId ?? "")) return false;
      return true;
    });
  }, [expenses, status, category, projectId]);

  function handleExport() {
    const csv = toExpensesCsv(visible, {
      employee: getEmployeeName,
      project: (pid) => (pid ? getProjectName(pid) : "General"),
    });
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`expenses_${rangeSlug(range)}_${stamp}.csv`, csv);
  }

  const statusLabel: Record<StatusFilter, string> = {
    ALL: "All",
    PENDING: "Pending",
    APPROVED: "Approved",
    REJECTED: "Rejected",
  };

  // Reset page whenever any filter changes.
  function handleStatusChange(s: string[]) { setStatus(s); setPage(1); }
  function handleCategoryChange(c: string[]) { setCategory(c); setPage(1); }
  function handleProjectIdChange(p: string[]) { setProjectId(p); setPage(1); }
  function handleRangeChange(r: DateRange) { setRange(r); setPage(1); }
  function handleBasisChange(b: "expenseDate" | "submittedAt") { setBasis(b); setPage(1); }

  // Active-filter summary, shared by the mobile Filters sheet + chips.
  const filterChips: FilterChip[] = [];
  if (status.length)
    filterChips.push({
      key: "status",
      label: status.length === 1 ? statusLabel[status[0] as StatusFilter] : `${status.length} statuses`,
      onRemove: () => handleStatusChange([]),
    });
  if (category.length)
    filterChips.push({
      key: "category",
      label:
        category.length === 1
          ? CATEGORY_LABELS[category[0] as ExpenseCategory]
          : `${category.length} categories`,
      onRemove: () => handleCategoryChange([]),
    });
  if (projectId.length)
    filterChips.push({
      key: "project",
      label: projectId.length === 1 ? getProjectName(projectId[0]!) : `${projectId.length} projects`,
      onRemove: () => handleProjectIdChange([]),
    });
  if (range.preset !== "all")
    filterChips.push({ key: "range", label: rangeLabel(range), onRemove: () => handleRangeChange(makeRange("all")) });
  const activeFilterCount = filterChips.length;
  function clearFilters() {
    handleStatusChange([]);
    setCategory([]);
    setProjectId([]);
    handleRangeChange(makeRange("all"));
  }

  return (
    <>
      <PageHeader
        title="All Expenses"
        description="Complete expense lifecycle across the organization."
        breadcrumbs={[{ label: "Admin", to: "/admin" }, { label: "Expenses" }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={visible.length === 0}
            >
              <Download className="size-4" />
              Export CSV
            </Button>
            <Link
              to="/admin/expenses/projects"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Project Spending
            </Link>
            {can(user?.role, "expense:create") && (
              <Link
                to={`${base}/new`}
                className={buttonVariants({ size: "sm" })}
              >
                Submit Expense
              </Link>
            )}
            {can(user?.role, "expense:bulk-upload") && (
              <Link
                to={`${base}/bulk`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Bulk Upload
              </Link>
            )}
          </div>
        }
      />

      {error ? (
        <StateCard>
          <ErrorState
            title="Couldn't load expenses"
            description={error}
            onRetry={() => setReloadKey((k) => k + 1)}
          />
        </StateCard>
      ) : loading && !loadedOnce.current ? (
        <StateCard>
          <LoadingState label="Loading expenses…" />
        </StateCard>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Total Expenses" value={summary.total} icon={Wallet} />
            <StatCard label="Pending Review" value={summary.pending} icon={Clock} />
            <StatCard label="Approved" value={summary.approved} icon={CheckCircle2} />
            <StatCard label="Rejected" value={summary.rejected} icon={XCircle} />
          </div>

          {/* Desktop / tablet filter toolbar (unchanged) */}
          <div className="hidden gap-2 md:flex md:flex-wrap md:items-center lg:flex-nowrap">
            <div className="relative w-full sm:min-w-48 sm:flex-1">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search employee, category, description…"
                value={q}
                onChange={(e) => { setQ(e.target.value); setPage(1); }}
              />
            </div>
            <MultiSelectFilter
              label="Status"
              options={STATUS_OPTIONS}
              selected={status}
              onChange={handleStatusChange}
              className="w-full sm:w-40"
            />
            <MultiSelectFilter
              label="Category"
              options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))}
              selected={category}
              onChange={handleCategoryChange}
              className="w-full sm:w-44"
            />
            <MultiSelectFilter
              label="Project"
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
              selected={projectId}
              onChange={handleProjectIdChange}
              className="w-full sm:w-48"
            />
            <ActiveRangeBadge
              range={range}
              basisLabel={basis === "submittedAt" ? "Submitted" : "Expense date"}
            />
            <DateBasisToggle value={basis} onChange={handleBasisChange} />
            <DateRangeFilter value={range} onChange={handleRangeChange} />
          </div>

          {/* Mobile: native search + Filters bottom sheet + active-filter chips */}
          <div className="flex flex-col gap-2 md:hidden">
            <div className="flex items-center gap-2">
              <MobileSearch
                value={q}
                onChange={(v) => { setQ(v); setPage(1); }}
                placeholder="Search expenses…"
                className="flex-1"
              />
              <MobileFiltersSheet
                activeCount={activeFilterCount}
                onClear={clearFilters}
                className="shrink-0"
              >
                <FilterField label="Status">
                  <MultiSelectFilter
                    label="Status"
                    options={STATUS_OPTIONS}
                    selected={status}
                    onChange={handleStatusChange}
                    className="w-full"
                  />
                </FilterField>
                <FilterField label="Category">
                  <MultiSelectFilter
                    label="Category"
                    options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))}
                    selected={category}
                    onChange={handleCategoryChange}
                    className="w-full"
                  />
                </FilterField>
                <FilterField label="Project">
                  <MultiSelectFilter
                    label="Project"
                    options={projects.map((p) => ({ value: p.id, label: p.name }))}
                    selected={projectId}
                    onChange={handleProjectIdChange}
                    className="w-full"
                  />
                </FilterField>
                <FilterField label="Date">
                  <div className="flex flex-col gap-2">
                    <DateBasisToggle value={basis} onChange={handleBasisChange} />
                    <DateRangeFilter value={range} onChange={handleRangeChange} />
                  </div>
                </FilterField>
              </MobileFiltersSheet>
            </div>
            <MobileFilterChips chips={filterChips} />
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
              <>
                <ExpensesTable
                  expenses={visible}
                  getEmployeeName={getEmployeeName}
                  getProjectName={getProjectName}
                  basePath="/admin/expenses"
                  showReimbursement
                />
                <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
              </>
            )}
          </Card>
        </div>
      )}
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
