import { Link } from "react-router-dom";
import { Eye } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ApprovalStatusBadge,
  CreationMethodBadge,
  ExpenseTypeBadge,
  ReimbursementBadge,
} from "./ExpenseBadges";
import { RiskBadge } from "./RiskAssessment";
import { formatDate, formatMoney } from "../../lib/format";
import { CATEGORY_LABELS, type Expense } from "../../types/expense";

interface ExpensesTableProps {
  expenses: Expense[];
  getEmployeeName: (id: string) => string;
  getProjectName: (id: string) => string;
  /** Path prefix for the View link, e.g. "/hr/expenses". */
  basePath: string;
  /** Show the reimbursement column (admin overview). */
  showReimbursement?: boolean;
}

export function ExpensesTable({
  expenses,
  getEmployeeName,
  getProjectName,
  basePath,
  showReimbursement,
}: ExpensesTableProps) {
  return (
    <>
    <div className="hidden overflow-x-auto md:block">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead>Ref</TableHead>
            <TableHead>Expense date</TableHead>
            <TableHead>Submitted</TableHead>
            <TableHead>Employee</TableHead>
            <TableHead>Project</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Status</TableHead>
            {showReimbursement && <TableHead>Reimbursement</TableHead>}
            <TableHead className="text-right">Actions</TableHead>
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
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {expense.submittedAt ? formatDate(expense.submittedAt) : "—"}
              </TableCell>
              <TableCell className="text-foreground">
                {getEmployeeName(expense.employeeId)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {expense.scope === "GENERAL"
                  ? "General"
                  : getProjectName(expense.projectId ?? "")}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {CATEGORY_LABELS[expense.category]}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-1">
                  <ExpenseTypeBadge type={expense.type} />
                  <CreationMethodBadge method={expense.creationMethod} />
                </div>
              </TableCell>
              <TableCell className="tabular-nums font-medium text-foreground">
                {formatMoney(expense.amount, expense.currency)}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-1">
                  <ApprovalStatusBadge status={expense.approvalStatus} />
                  {expense.riskLevel && expense.riskLevel !== "LOW" && (
                    <RiskBadge level={expense.riskLevel} />
                  )}
                </div>
              </TableCell>
              {showReimbursement && (
                <TableCell>
                  <ReimbursementBadge status={expense.reimbursementStatus} />
                </TableCell>
              )}
              <TableCell className="text-right">
                <Link
                  to={`${basePath}/${expense.id}`}
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  <Eye className="size-4" />
                  View
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>

    {/* Mobile: expense cards */}
    <ul className="flex flex-col divide-y md:hidden">
      {expenses.map((expense) => (
        <li key={expense.id}>
          <Link
            to={`${basePath}/${expense.id}`}
            className="flex flex-col gap-2 p-4 transition-colors hover:bg-muted/40"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 truncate font-medium text-foreground">
                {getEmployeeName(expense.employeeId)}
              </span>
              <span className="shrink-0 tabular-nums font-semibold text-foreground">
                {formatMoney(expense.amount, expense.currency)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {expense.code && <span className="font-mono">{expense.code}</span>}
              <span>Expense {formatDate(expense.expenseDate)}</span>
              <span>·</span>
              <span>
                Submitted{" "}
                {expense.submittedAt ? formatDate(expense.submittedAt) : "—"}
              </span>
              <span>·</span>
              <span>{CATEGORY_LABELS[expense.category]}</span>
              <span>·</span>
              <span>
                {expense.scope === "GENERAL"
                  ? "General"
                  : getProjectName(expense.projectId ?? "")}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <ApprovalStatusBadge status={expense.approvalStatus} />
              {expense.riskLevel && expense.riskLevel !== "LOW" && (
                <RiskBadge level={expense.riskLevel} />
              )}
              <CreationMethodBadge method={expense.creationMethod} />
              {showReimbursement && (
                <ReimbursementBadge status={expense.reimbursementStatus} />
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
    </>
  );
}
