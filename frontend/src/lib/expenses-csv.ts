import {
  APPROVAL_LABELS,
  CATEGORY_LABELS,
  REIMBURSEMENT_LABELS,
  TYPE_LABELS,
  type Expense,
} from "../types/expense";

/**
 * Build a CSV export of expenses for the admin overview.
 *
 * NOTE: This is a client-side export over the rows already loaded in the table.
 * A future server-side endpoint (e.g. `GET /expenses/export?format=csv`) should
 * replace this for full, filter-aware, streamed exports that aren't bounded by
 * what the page has fetched. Keep the column order in sync if/when that lands.
 */
const HEADER = [
  "Ref",
  "Date",
  "Employee",
  "Project",
  "Category",
  "Type",
  "Entry",
  "Description",
  "Amount",
  "Currency",
  "Status",
  "Reimbursement",
  "Created",
];

/** RFC-4180 escape: wrap in quotes and double internal quotes when needed. */
function cell(value: string | number): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface CsvLookups {
  employee: (id: string) => string;
  project: (id?: string) => string;
}

export function toExpensesCsv(rows: Expense[], lookups: CsvLookups): string {
  const lines = [HEADER.map(cell).join(",")];
  for (const e of rows) {
    lines.push(
      [
        e.code ?? "",
        e.expenseDate,
        lookups.employee(e.employeeId),
        e.scope === "GENERAL" ? "General" : lookups.project(e.projectId),
        CATEGORY_LABELS[e.category],
        TYPE_LABELS[e.type],
        e.creationMethod === "MANUAL"
          ? "Manual Entry"
          : e.creationMethod === "AI"
            ? "AI Extracted"
            : "",
        e.description,
        e.amount,
        e.currency,
        APPROVAL_LABELS[e.approvalStatus],
        REIMBURSEMENT_LABELS[e.reimbursementStatus],
        e.createdAt.slice(0, 10),
      ]
        .map(cell)
        .join(","),
    );
  }
  return lines.join("\n");
}

/** Trigger a client-side download of the given CSV text. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
