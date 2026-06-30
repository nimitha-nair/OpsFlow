import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/auth-context";
import { can, expensesBasePath } from "../../lib/permissions";
import { Check, Eye, Pencil, Plus, Trash2, Wallet, X } from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ActiveRangeBadge } from "../../components/common/ActiveRangeBadge";
import { DateBasisToggle } from "../../components/common/DateBasisToggle";
import { DateRangeFilter } from "../../components/common/DateRangeFilter";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { PageHeader } from "../../components/layout/PageHeader";
import {
  ApprovalStatusBadge,
  ReimbursementBadge,
} from "../../components/expenses/ExpenseBadges";
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
import { MobileBottomActionBar } from "../../components/mobile/MobileBottomActionBar";
import { formatDate, formatMoney } from "../../lib/format";
import {
  apiErrorMessage,
  deleteExpense,
  listMyExpenses,
} from "../../lib/expenses-api";
import { listMyProjects } from "../../lib/projects-api";
import { CATEGORY_LABELS, type Expense } from "../../types/expense";

function CheckBox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onChange}
      className={cn(
        "flex size-4 items-center justify-center rounded border transition-colors",
        checked
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-transparent hover:border-primary/60",
      )}
    >
      <Check className="size-3" />
    </button>
  );
}

type DeleteTarget = { kind: "single"; id: string; code: string } | { kind: "bulk" } | null;

export function MyExpensesPage() {
  const { user } = useAuth();
  const base = user ? expensesBasePath(user.role) : "/employee/expenses";
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [projectNames, setProjectNames] = useState<Map<string, string>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Skeleton shows only on the first load; later refreshes update in place.
  const loadedOnce = useRef(false);
  const [range, setRange] = useState<DateRange>(() => makeRange("all"));
  // Default to submission date so "Today" shows what you submitted today.
  const [basis, setBasis] = useState<"expenseDate" | "submittedAt">(
    "submittedAt",
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [mine, projects] = await Promise.all([
          listMyExpenses({ ...rangeToParams(range), basis }),
          listMyProjects(),
        ]);
        if (cancelled) return;
        setExpenses(mine);
        setProjectNames(new Map(projects.map((p) => [p.id, p.name])));
      } catch (err) {
        if (!cancelled) {
          setError(apiErrorMessage(err, "Failed to load expenses."));
        }
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

  const projectLabel = useMemo(
    () => (expense: Expense) =>
      expense.scope === "GENERAL"
        ? "General"
        : (projectNames.get(expense.projectId ?? "") ?? "—"),
    [projectNames],
  );

  // Selection only applies to drafts (the only deletable status).
  const visibleDraftIds = useMemo(
    () =>
      expenses.filter((e) => e.approvalStatus === "DRAFT").map((e) => e.id),
    [expenses],
  );
  const selectedDraftIds = visibleDraftIds.filter((id) => selectedIds.has(id));
  const allDraftsSelected =
    visibleDraftIds.length > 0 &&
    selectedDraftIds.length === visibleDraftIds.length;

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allDraftsSelected) visibleDraftIds.forEach((id) => next.delete(id));
      else visibleDraftIds.forEach((id) => next.add(id));
      return next;
    });
  }

  async function deleteOne(id: string) {
    try {
      await deleteExpense(id);
      setExpenses((prev) => prev.filter((e) => e.id !== id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.success("Draft deleted.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't delete the draft."));
    }
  }

  async function deleteSelected() {
    const ids = [...selectedDraftIds];
    const results = await Promise.allSettled(ids.map((id) => deleteExpense(id)));
    const deleted = ids.filter((_, i) => results[i]!.status === "fulfilled");
    setExpenses((prev) => prev.filter((e) => !deleted.includes(e.id)));
    setSelectedIds(new Set());
    if (deleted.length) {
      toast.success(
        `${deleted.length} draft${deleted.length === 1 ? "" : "s"} deleted.`,
      );
    }
    if (deleted.length < ids.length) {
      toast.error(`${ids.length - deleted.length} couldn't be deleted.`);
    }
  }

  // Active-filter summary, shared by the mobile Filters sheet + chips.
  const filterChips: FilterChip[] = [];
  if (range.preset !== "all")
    filterChips.push({
      key: "range",
      label: rangeLabel(range),
      onRemove: () => setRange(makeRange("all")),
    });
  const activeFilterCount = filterChips.length;
  function clearFilters() {
    setRange(makeRange("all"));
  }

  return (
    <>
      <PageHeader
        title="My Expenses"
        description="Track your submitted expenses and their status."
        breadcrumbs={[{ label: "Expenses" }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Desktop / tablet filter toolbar (unchanged) */}
            <div className="hidden flex-wrap items-center gap-2 md:flex">
              <ActiveRangeBadge
                range={range}
                basisLabel={basis === "submittedAt" ? "Submitted" : "Expense date"}
              />
              <DateBasisToggle value={basis} onChange={setBasis} />
              <DateRangeFilter value={range} onChange={setRange} />
            </div>
            {/* Mobile: Filters bottom sheet */}
            <MobileFiltersSheet
              activeCount={activeFilterCount}
              onClear={clearFilters}
              className="md:hidden"
            >
              <FilterField label="Date basis">
                <DateBasisToggle value={basis} onChange={setBasis} />
              </FilterField>
              <FilterField label="Date">
                <DateRangeFilter value={range} onChange={setRange} />
              </FilterField>
            </MobileFiltersSheet>
            {can(user?.role, "expense:create") && (
              <Link
                to={`${base}/new`}
                className={buttonVariants({ size: "sm" })}
              >
                <Plus className="size-4" />
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

      {/* Mobile: active-filter chips */}
      <div className="md:hidden">
        <MobileFilterChips chips={filterChips} />
      </div>

      <Card className="overflow-hidden p-0">
        {error ? (
          <div className="p-6">
            <ErrorState
              title="Couldn't load expenses"
              description={error}
              onRetry={() => setReloadKey((k) => k + 1)}
            />
          </div>
        ) : loading && !loadedOnce.current ? (
          <LoadingState label="Loading expenses…" />
        ) : expenses.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Wallet}
              title={range.preset !== "all" ? "No expenses in range" : "No expenses yet"}
              description={
                range.preset !== "all"
                  ? "No expenses match the selected date range. Try widening the range or switching to All time."
                  : "Submit your first expense to get started."
              }
            />
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="w-10">
                    {visibleDraftIds.length > 0 && (
                      <CheckBox
                        checked={allDraftsSelected}
                        onChange={toggleSelectAll}
                        label="Select all drafts"
                      />
                    )}
                  </TableHead>
                  <TableHead>Ref</TableHead>
                  <TableHead>Expense date</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Approval</TableHead>
                  <TableHead>Reimbursement</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((expense) => {
                  const isDraft = expense.approvalStatus === "DRAFT";
                  return (
                    <TableRow
                      key={expense.id}
                      className={cn(
                        isDraft && selectedIds.has(expense.id) && "bg-primary/[0.04]",
                      )}
                    >
                      <TableCell className="w-10">
                        {isDraft && (
                          <CheckBox
                            checked={selectedIds.has(expense.id)}
                            onChange={() => toggleSelect(expense.id)}
                            label="Select draft"
                          />
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                        {expense.code ?? "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDate(expense.expenseDate)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {expense.submittedAt ? formatDate(expense.submittedAt) : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {projectLabel(expense)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {CATEGORY_LABELS[expense.category]}
                      </TableCell>
                      <TableCell className="tabular-nums font-medium text-foreground">
                        {formatMoney(expense.amount, expense.currency)}
                      </TableCell>
                      <TableCell>
                        <ApprovalStatusBadge status={expense.approvalStatus} />
                      </TableCell>
                      <TableCell>
                        <ReimbursementBadge status={expense.reimbursementStatus} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {isDraft && (
                            <>
                              <Link
                                to={`${base}/${expense.id}/edit`}
                                className={buttonVariants({ variant: "ghost", size: "sm" })}
                              >
                                <Pencil className="size-4" />
                                Edit
                              </Link>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() =>
                                  setDeleteTarget({
                                    kind: "single",
                                    id: expense.id,
                                    code: expense.code ?? "this draft",
                                  })
                                }
                              >
                                <Trash2 className="size-4" />
                                Delete
                              </Button>
                            </>
                          )}
                          <Link
                            to={`${base}/${expense.id}`}
                            className={buttonVariants({ variant: "ghost", size: "sm" })}
                          >
                            <Eye className="size-4" />
                            View
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>

            {/* Mobile: expense cards */}
            <ul className="flex flex-col divide-y md:hidden">
              {expenses.map((expense) => {
                const isDraft = expense.approvalStatus === "DRAFT";
                return (
                  <li key={expense.id} className="flex gap-3 p-4">
                    {isDraft && (
                      <CheckBox
                        checked={selectedIds.has(expense.id)}
                        onChange={() => toggleSelect(expense.id)}
                        label="Select draft"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 truncate tabular-nums font-semibold text-foreground">
                          {formatMoney(expense.amount, expense.currency)}
                        </span>
                        <span className="shrink-0">
                          <ApprovalStatusBadge status={expense.approvalStatus} />
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        {expense.code && (
                          <span className="font-mono">{expense.code}</span>
                        )}
                        <span>Expense {formatDate(expense.expenseDate)}</span>
                        <span>·</span>
                        <span>
                          Submitted{" "}
                          {expense.submittedAt
                            ? formatDate(expense.submittedAt)
                            : "—"}
                        </span>
                        <span>·</span>
                        <span>{CATEGORY_LABELS[expense.category]}</span>
                        <span>·</span>
                        <span>{projectLabel(expense)}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        {isDraft && (
                          <>
                            <Link
                              to={`${base}/${expense.id}/edit`}
                              className={buttonVariants({ variant: "outline", size: "sm" })}
                            >
                              <Pencil className="size-4" />
                              Edit
                            </Link>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() =>
                                setDeleteTarget({
                                  kind: "single",
                                  id: expense.id,
                                  code: expense.code ?? "this draft",
                                })
                              }
                            >
                              <Trash2 className="size-4" />
                              Delete
                            </Button>
                          </>
                        )}
                        <Link
                          to={`${base}/${expense.id}`}
                          className={buttonVariants({ variant: "outline", size: "sm" })}
                        >
                          <Eye className="size-4" />
                          View
                        </Link>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>

      {/* Bulk action bar */}
      {selectedDraftIds.length > 0 && (
        <>
          {/* Desktop: centered floating pill (unchanged). */}
          <div className="no-print fixed inset-x-0 bottom-6 z-40 hidden justify-center px-4 md:flex">
            <div className="flex items-center gap-3 rounded-xl border border-border bg-popover px-4 py-2.5 shadow-lg ring-1 ring-foreground/10">
              <span className="text-sm font-medium text-foreground">
                {selectedDraftIds.length} selected
              </span>
              <span className="text-muted-foreground">·</span>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteTarget({ kind: "bulk" })}
              >
                <Trash2 className="size-4" />
                Delete drafts
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Clear selection"
                onClick={() => setSelectedIds(new Set())}
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>

          {/* Mobile: full-width bottom action bar above the nav + safe area. */}
          <MobileBottomActionBar>
            <span className="text-sm font-medium text-foreground">
              {selectedDraftIds.length} selected
            </span>
            <Button
              variant="destructive"
              size="sm"
              className="ml-auto"
              onClick={() => setDeleteTarget({ kind: "bulk" })}
            >
              <Trash2 className="size-4" />
              Delete drafts
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Clear selection"
              onClick={() => setSelectedIds(new Set())}
            >
              <X className="size-4" />
            </Button>
          </MobileBottomActionBar>
        </>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        destructive
        title={
          deleteTarget?.kind === "bulk"
            ? `Delete ${selectedDraftIds.length} draft${selectedDraftIds.length === 1 ? "" : "s"}?`
            : "Delete draft?"
        }
        description={
          deleteTarget?.kind === "bulk"
            ? "These draft expenses will be permanently removed. This can't be undone."
            : `${deleteTarget?.kind === "single" ? deleteTarget.code : "This draft"} will be permanently removed. This can't be undone.`
        }
        confirmLabel="Delete"
        onConfirm={() =>
          deleteTarget?.kind === "bulk"
            ? deleteSelected()
            : deleteTarget?.kind === "single"
              ? deleteOne(deleteTarget.id)
              : undefined
        }
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
