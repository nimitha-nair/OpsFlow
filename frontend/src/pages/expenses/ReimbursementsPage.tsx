import { useEffect, useMemo, useState } from "react";
import { Wallet } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ActiveRangeBadge } from "../../components/common/ActiveRangeBadge";
import { DateRangeFilter } from "../../components/common/DateRangeFilter";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { PageHeader } from "../../components/layout/PageHeader";
import { ReimbursementBadge } from "../../components/expenses/ExpenseBadges";
import { makeRange, rangeToParams, type DateRange } from "../../lib/date-range";
import {
  apiErrorMessage,
  listReimbursements,
  updateReimbursementStatus,
} from "../../lib/expenses-api";
import { listProjects } from "../../lib/projects-api";
import { listUsers } from "../../lib/users-api";
import { formatDate, formatMoney } from "../../lib/format";
import { Lock } from "lucide-react";

import {
  REIMBURSEMENT_LABELS,
  REIMBURSEMENT_STATUSES,
  type Expense,
  type ReimbursementStatus,
} from "../../types/expense";

/**
 * Forward-only lifecycle: PENDING → PROCESSING → PAID. Mirrors the backend rule
 * (`isValidReimbursementTransition`) so the UI only offers valid next statuses.
 */
function forwardStatuses(from: ReimbursementStatus): ReimbursementStatus[] {
  const fromRank = REIMBURSEMENT_STATUSES.indexOf(from);
  return REIMBURSEMENT_STATUSES.filter(
    (s) => REIMBURSEMENT_STATUSES.indexOf(s) > fromRank,
  );
}

/**
 * Admin-only reimbursement management — the dedicated home for reimbursement
 * status changes (moved off the expense detail/overview). Lists APPROVED expenses
 * and lets an admin advance each to PENDING / PROCESSING / PAID.
 */
export function ReimbursementsPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [userNames, setUserNames] = useState<Map<string, string>>(new Map());
  const [projectNames, setProjectNames] = useState<Map<string, string>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange>(() => makeRange("all"));

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [approved, users, projects] = await Promise.all([
          listReimbursements(rangeToParams(range)),
          listUsers({ limit: 100 }),
          listProjects({ limit: 100 }),
        ]);
        if (cancelled) return;
        setExpenses(approved);
        setUserNames(new Map(users.data.map((u) => [u.id, u.name])));
        setProjectNames(new Map(projects.data.map((p) => [p.id, p.name])));
      } catch (err) {
        if (!cancelled)
          setError(apiErrorMessage(err, "Failed to load reimbursements."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey, range]);

  const getEmployeeName = useMemo(
    () => (id: string) => userNames.get(id) ?? "Unknown",
    [userNames],
  );
  const getProjectName = useMemo(
    () => (id?: string) => (id ? (projectNames.get(id) ?? "—") : "General"),
    [projectNames],
  );

  async function changeStatus(expense: Expense, status: ReimbursementStatus) {
    if (status === expense.reimbursementStatus) return;
    setSavingId(expense.id);
    try {
      const updated = await updateReimbursementStatus(expense.id, status);
      setExpenses((rows) =>
        rows.map((e) => (e.id === expense.id ? updated : e)),
      );
      toast.success("Reimbursement status updated.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to update reimbursement."));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Reimbursements"
        description="Manage reimbursement status for approved expenses."
        breadcrumbs={[
          { label: "Expenses", to: "/admin/expenses" },
          { label: "Reimbursements" },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <ActiveRangeBadge range={range} />
            <DateRangeFilter value={range} onChange={setRange} />
          </div>
        }
      />

      {error ? (
        <Card className="p-6">
          <ErrorState
            title="Couldn't load reimbursements"
            description={error}
            onRetry={() => setReloadKey((k) => k + 1)}
          />
        </Card>
      ) : loading ? (
        <Card className="p-6">
          <LoadingState label="Loading reimbursements…" />
        </Card>
      ) : expenses.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={Wallet}
            title={range.preset !== "all" ? "No reimbursements in range" : "No approved expenses"}
            description={
              range.preset !== "all"
                ? "No approved expenses match the selected date range. Try widening the range or switching to All time."
                : "Approved expenses awaiting reimbursement will appear here."
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead>Ref</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Current</TableHead>
                  <TableHead>Set status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                      {expense.code ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(expense.expenseDate)}
                    </TableCell>
                    <TableCell className="text-foreground">
                      {getEmployeeName(expense.employeeId)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {expense.scope === "GENERAL"
                        ? "General"
                        : getProjectName(expense.projectId)}
                    </TableCell>
                    <TableCell className="tabular-nums font-medium text-foreground">
                      {formatMoney(expense.amount, expense.currency)}
                    </TableCell>
                    <TableCell>
                      <ReimbursementBadge
                        status={expense.reimbursementStatus}
                      />
                    </TableCell>
                    <TableCell>
                      {expense.reimbursementStatus === "PAID" ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Lock className="size-3" />
                          Paid 
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {forwardStatuses(expense.reimbursementStatus).map(
                            (s) => (
                              <Button
                                key={s}
                                variant="outline"
                                size="sm"
                                disabled={savingId === expense.id}
                                onClick={() => changeStatus(expense, s)}
                              >
                                Mark {REIMBURSEMENT_LABELS[s]}
                              </Button>
                            ),
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </>
  );
}
