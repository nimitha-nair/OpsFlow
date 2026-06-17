import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, Pencil, Plus, Wallet } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { PageHeader } from "../../components/layout/PageHeader";
import {
  ApprovalStatusBadge,
  ReimbursementBadge,
} from "../../components/expenses/ExpenseBadges";
import { formatDate, formatMoney } from "../../lib/format";
import { apiErrorMessage, listMyExpenses } from "../../lib/expenses-api";
import { listMyProjects } from "../../lib/projects-api";
import { CATEGORY_LABELS, type Expense } from "../../types/expense";

export function MyExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [projectNames, setProjectNames] = useState<Map<string, string>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [mine, projects] = await Promise.all([
          listMyExpenses(),
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
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const projectLabel = useMemo(
    () => (expense: Expense) =>
      expense.scope === "GENERAL"
        ? "General"
        : (projectNames.get(expense.projectId ?? "") ?? "—"),
    [projectNames],
  );

  return (
    <>
      <PageHeader
        title="My Expenses"
        description="Track your submitted expenses and their status."
        breadcrumbs={[{ label: "Expenses" }]}
        actions={
          <Link
            to="/employee/expenses/new"
            className={buttonVariants({ size: "sm" })}
          >
            <Plus className="size-4" />
            Submit Expense
          </Link>
        }
      />

      <Card className="overflow-hidden p-0">
        {error ? (
          <div className="p-6">
            <ErrorState
              title="Couldn't load expenses"
              description={error}
              onRetry={() => setReloadKey((k) => k + 1)}
            />
          </div>
        ) : loading ? (
          <LoadingState label="Loading expenses…" />
        ) : expenses.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Wallet}
              title="No expenses yet"
              description="Submit your first expense to get started."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Approval</TableHead>
                  <TableHead>Reimbursement</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(expense.expenseDate)}
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
                        {expense.approvalStatus === "DRAFT" && (
                          <Link
                            to={`/employee/expenses/${expense.id}/edit`}
                            className={buttonVariants({ variant: "ghost", size: "sm" })}
                          >
                            <Pencil className="size-4" />
                            Edit
                          </Link>
                        )}
                        <Link
                          to={`/employee/expenses/${expense.id}`}
                          className={buttonVariants({ variant: "ghost", size: "sm" })}
                        >
                          <Eye className="size-4" />
                          View
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </>
  );
}
