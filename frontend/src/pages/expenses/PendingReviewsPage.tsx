import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ClipboardCheck, Search } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "../../context/auth-context";
import { can, myExpensesPath } from "../../lib/permissions";
import { MultiSelectFilter } from "../../components/common/MultiSelectFilter";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActiveRangeBadge } from "../../components/common/ActiveRangeBadge";
import { DateBasisToggle } from "../../components/common/DateBasisToggle";
import { DateRangeFilter } from "../../components/common/DateRangeFilter";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { PageHeader } from "../../components/layout/PageHeader";
import { ExpensesTable } from "../../components/expenses/ExpensesTable";
import {
  makeRange,
  rangeLabel,
  rangeToParams,
  type DateRange,
} from "../../lib/date-range";
import { MobileFiltersSheet } from "../../components/mobile/MobileFiltersSheet";
import {
  MobileFilterChips,
  type FilterChip,
} from "../../components/mobile/MobileFilterChips";
import { apiErrorMessage, listReviewExpenses } from "../../lib/expenses-api";
import { Pagination } from "../../components/Pagination";
import { listProjects } from "../../lib/projects-api";
import { listUsers } from "../../lib/users-api";
import {
  CATEGORY_LABELS,
  EXPENSE_CATEGORIES,
  type Expense,
} from "../../types/expense";

type Tab = "PENDING" | "APPROVED" | "REJECTED" | "ALL";

const PENDING = ["SUBMITTED", "PENDING_REVIEW"];

/** High-risk receipts sort to the top of the review queue. */
const riskRank = (e: Expense): number =>
  e.riskLevel === "HIGH" ? 0 : e.riskLevel === "MEDIUM" ? 1 : 2;

function inTab(e: Expense, tab: Tab): boolean {
  if (tab === "ALL") return true;
  if (tab === "PENDING") return PENDING.includes(e.approvalStatus);
  return e.approvalStatus === tab;
}

export function PendingReviewsPage() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [userNames, setUserNames] = useState<Map<string, string>>(new Map());
  const [projectNames, setProjectNames] = useState<Map<string, string>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Skeleton shows only on the first load; later refreshes update in place.
  const loadedOnce = useRef(false);

  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<Tab>("PENDING");
  // q, tab, category, method are all filtered client-side over the full dataset.
  const [q, setQ] = useState("");
  // Multi-select: empty = all; several = OR within field.
  const [category, setCategory] = useState<string[]>([]);
  const [method, setMethod] = useState<string[]>([]);
  const [range, setRange] = useState<DateRange>(() => makeRange("all"));
  const [basis, setBasis] = useState<"expenseDate" | "submittedAt">("submittedAt");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [rows, users, projects] = await Promise.all([
          listReviewExpenses("ALL", { ...rangeToParams(range), basis }),
          listUsers({ limit: 100 }),
          listProjects({ limit: 100 }),
        ]);
        if (cancelled) return;
        setExpenses(rows);
        setUserNames(new Map(users.data.map((u) => [u.id, u.name])));
        setProjectNames(new Map(projects.data.map((p) => [p.id, p.name])));
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, "Failed to load reviews."));
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
  }, [reloadKey, range, basis]);

  // Near-live: silently refetch on an interval + when the tab refocuses.
  useAutoRefresh(() => setReloadKey((k) => k + 1));

  const getEmployeeName = useMemo(
    () => (id: string) => userNames.get(id) ?? "Unknown",
    [userNames],
  );
  const getProjectName = useMemo(
    () => (id: string) => projectNames.get(id) ?? "—",
    [projectNames],
  );

  const counts = useMemo(
    () => ({
      PENDING: expenses.filter((e) => inTab(e, "PENDING")).length,
      APPROVED: expenses.filter((e) => inTab(e, "APPROVED")).length,
      REJECTED: expenses.filter((e) => inTab(e, "REJECTED")).length,
      ALL: expenses.length,
    }),
    [expenses],
  );

  const PAGE_SIZE = 20;

  // All filters (q, tab, category, method) run client-side over the full dataset.
  const visible = useMemo(() => {
    const qLower = q.toLowerCase();
    const rows = expenses.filter((e) => {
      if (!inTab(e, tab)) return false;
      if (q && ![
        getEmployeeName(e.employeeId),
        CATEGORY_LABELS[e.category],
      ].some((s) => s.toLowerCase().includes(qLower))) return false;
      if (category.length && !category.includes(e.category)) return false;
      if (method.length && !method.includes(e.creationMethod ?? "AI")) return false;
      return true;
    });
    // High-risk receipts first (stable within the same risk band).
    return rows.sort((a, b) => riskRank(a) - riskRank(b));
  }, [expenses, tab, category, method, q, getEmployeeName]);

  const totalPages = Math.ceil(visible.length / PAGE_SIZE);
  const pageRows = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset page whenever any filter changes.
  function handleRangeChange(r: DateRange) { setRange(r); setPage(1); }
  function handleBasisChange(b: "expenseDate" | "submittedAt") { setBasis(b); setPage(1); }
  function handleTabChange(t: Tab) { setTab(t); setPage(1); }
  function handleCategoryChange(c: string[]) { setCategory(c); setPage(1); }
  function handleMethodChange(m: string[]) { setMethod(m); setPage(1); }

  // Active-filter summary for the mobile Filters sheet + chips (date controls).
  const filterChips: FilterChip[] = [];
  if (range.preset !== "all")
    filterChips.push({
      key: "range",
      label: rangeLabel(range),
      onRemove: () => handleRangeChange(makeRange("all")),
    });
  const activeFilterCount = filterChips.length;
  function clearFilters() {
    handleRangeChange(makeRange("all"));
  }

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Review submitted expenses and browse approval history."
        breadcrumbs={[{ label: "Expenses" }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {can(user?.role, "expense:view-own") && (
              <Link
                to={myExpensesPath(user!.role)}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                My Expenses
              </Link>
            )}
            {/* Desktop / tablet filter toolbar (unchanged) */}
            <div className="hidden flex-wrap items-center gap-2 md:flex">
              <ActiveRangeBadge
                range={range}
                basisLabel={basis === "submittedAt" ? "Submitted" : "Expense date"}
              />
              <DateBasisToggle value={basis} onChange={handleBasisChange} />
              <DateRangeFilter value={range} onChange={handleRangeChange} />
            </div>
            {/* Mobile: Filters bottom sheet */}
            <MobileFiltersSheet
              activeCount={activeFilterCount}
              onClear={clearFilters}
              className="md:hidden"
            >
              <FilterField label="Date basis">
                <DateBasisToggle value={basis} onChange={handleBasisChange} />
              </FilterField>
              <FilterField label="Date">
                <DateRangeFilter value={range} onChange={handleRangeChange} />
              </FilterField>
            </MobileFiltersSheet>
          </div>
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
      ) : loading && !loadedOnce.current ? (
        <Card className="p-6">
          <LoadingState label="Loading expenses…" />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Tabs
              value={tab}
              onValueChange={(v) => handleTabChange(v as Tab)}
              className="-mx-1 max-w-full overflow-x-auto px-1"
            >
              <TabsList className="w-max">
                <TabsTrigger value="PENDING">
                  Pending ({counts.PENDING})
                </TabsTrigger>
                <TabsTrigger value="APPROVED">
                  Approved ({counts.APPROVED})
                </TabsTrigger>
                <TabsTrigger value="REJECTED">
                  Rejected ({counts.REJECTED})
                </TabsTrigger>
                <TabsTrigger value="ALL">All ({counts.ALL})</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex flex-1 flex-col gap-2 sm:max-w-md sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search employee, category…"
                  value={q}
                  onChange={(e) => { setQ(e.target.value); setPage(1); }}
                />
              </div>
              <MultiSelectFilter
                label="Category"
                options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))}
                selected={category}
                onChange={handleCategoryChange}
                className="sm:w-44"
              />
              <MultiSelectFilter
                label="Entry"
                options={[
                  { value: "AI", label: "AI Extracted" },
                  { value: "MANUAL", label: "Manual Entry" },
                ]}
                selected={method}
                onChange={handleMethodChange}
                className="sm:w-40"
              />
            </div>
          </div>

          {/* Mobile: active-filter chips */}
          <div className="md:hidden">
            <MobileFilterChips chips={filterChips} />
          </div>

          <Card className="overflow-hidden p-0">
            {visible.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={ClipboardCheck}
                  title="No expenses found"
                  description={
                    tab === "PENDING"
                      ? "There are no expenses awaiting review."
                      : "No expenses match the current filters."
                  }
                />
              </div>
            ) : (
              <ExpensesTable
                expenses={pageRows}
                getEmployeeName={getEmployeeName}
                getProjectName={getProjectName}
                basePath="/hr/expenses"
              />
            )}
          </Card>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
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
