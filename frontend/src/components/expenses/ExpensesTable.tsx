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
  ExpenseTypeBadge,
  ReimbursementBadge,
} from "./ExpenseBadges";
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
    <div className="overflow-x-auto">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead>Date</TableHead>
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
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {formatDate(expense.expenseDate)}
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
                <ExpenseTypeBadge type={expense.type} />
              </TableCell>
              <TableCell className="tabular-nums font-medium text-foreground">
                {formatMoney(expense.amount, expense.currency)}
              </TableCell>
              <TableCell>
                <ApprovalStatusBadge status={expense.approvalStatus} />
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
  );
}
