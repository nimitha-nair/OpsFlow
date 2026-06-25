import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Search } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActiveRangeBadge } from "../../components/common/ActiveRangeBadge";
import { DateBasisToggle } from "../../components/common/DateBasisToggle";
import { DateRangeFilter } from "../../components/common/DateRangeFilter";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { PageHeader } from "../../components/layout/PageHeader";
import { ExpensesTable } from "../../components/expenses/ExpensesTable";
import { makeRange, rangeToParams, type DateRange } from "../../lib/date-range";
import { apiErrorMessage, listReviewExpenses } from "../../lib/expenses-api";
import { listProjects } from "../../lib/projects-api";
import { listUsers } from "../../lib/users-api";
import {
  CATEGORY_LABELS,
  EXPENSE_CATEGORIES,
  type Expense,
  type ExpenseCategory,
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
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [userNames, setUserNames] = useState<Map<string, string>>(new Map());
  const [projectNames, setProjectNames] = useState<Map<string, string>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [tab, setTab] = useState<Tab>("PENDING");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<ExpenseCategory | "ALL">("ALL");
  const [method, setMethod] = useState<"ALL" | "AI" | "MANUAL">("ALL");
  const [range, setRange] = useState<DateRange>(() => makeRange("all"));
  const [basis, setBasis] = useState<"expenseDate" | "submittedAt">("submittedAt");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [all, users, projects] = await Promise.all([
          listReviewExpenses("ALL", { ...rangeToParams(range), basis }),
          listUsers({ limit: 100 }),
          listProjects({ limit: 100 }),
        ]);
        if (cancelled) return;
        setExpenses(all);
        setUserNames(new Map(users.data.map((u) => [u.id, u.name])));
        setProjectNames(new Map(projects.data.map((p) => [p.id, p.name])));
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, "Failed to load reviews."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey, range, basis]);

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

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = expenses.filter((e) => {
      if (!inTab(e, tab)) return false;
      if (category !== "ALL" && e.category !== category) return false;
      if (method !== "ALL" && (e.creationMethod ?? "AI") !== method) return false;
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
    // High-risk receipts first (stable within the same risk band).
    return rows.sort((a, b) => riskRank(a) - riskRank(b));
  }, [expenses, tab, category, method, search, getEmployeeName, getProjectName]);

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Review submitted expenses and browse approval history."
        breadcrumbs={[{ label: "Expenses" }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ActiveRangeBadge
              range={range}
              basisLabel={basis === "submittedAt" ? "Submitted" : "Expense date"}
            />
            <DateBasisToggle value={basis} onChange={setBasis} />
            <DateRangeFilter value={range} onChange={setRange} />
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
      ) : loading ? (
        <Card className="p-6">
          <LoadingState label="Loading expenses…" />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Tabs
              value={tab}
              onValueChange={(v) => setTab(v as Tab)}
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
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select
                value={category}
                onValueChange={(v) =>
                  setCategory((v ?? "ALL") as ExpenseCategory | "ALL")
                }
              >
                <SelectTrigger className="sm:w-44">
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
              <Select
                value={method}
                onValueChange={(v) =>
                  setMethod((v ?? "ALL") as "ALL" | "AI" | "MANUAL")
                }
              >
                <SelectTrigger className="sm:w-40" aria-label="Entry method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All entries</SelectItem>
                  <SelectItem value="AI">AI Extracted</SelectItem>
                  <SelectItem value="MANUAL">Manual Entry</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
                expenses={visible}
                getEmployeeName={getEmployeeName}
                getProjectName={getProjectName}
                basePath="/hr/expenses"
              />
            )}
          </Card>
        </div>
      )}
    </>
  );
}
