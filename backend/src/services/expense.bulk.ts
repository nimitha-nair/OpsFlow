import type { Expense, ExpenseScope } from "../types/expense.types";
import { addExpenseDocumentId, createExpense } from "./expense.service";
import { saveExpenseDocument } from "./expense-document.service";

export interface BulkDraftFile {
  filename: string;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface BulkDraftInput {
  employeeId: string;
  scope: ExpenseScope;
  projectId?: string;
  currency: string;
}

export interface BulkDraftResult {
  created: Expense[];
  failed: { fileName: string; error: string }[];
}

/**
 * Create one DRAFT expense per uploaded receipt and attach that receipt to it.
 * Each file is independent: a failure on one file is recorded and the rest still
 * proceed. Amount/category/date are left as draft placeholders — the per-draft
 * AI analyze + verify step fills them in, exactly like the single-receipt flow.
 */
export async function createBulkDrafts(
  input: BulkDraftInput,
  files: BulkDraftFile[],
): Promise<BulkDraftResult> {
  const created: Expense[] = [];
  const failed: { fileName: string; error: string }[] = [];

  for (const file of files) {
    try {
      const expense = await createExpense({
        employeeId: input.employeeId,
        scope: input.scope,
        ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
        type: "DOCUMENT",
        currency: input.currency,
        isDraft: true,
      });
      const view = await saveExpenseDocument({
        expenseId: expense.id,
        uploadedBy: input.employeeId,
        fileName: file.filename,
        originalFileName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
      });
      await addExpenseDocumentId(expense.id, view.id);
      created.push(expense);
    } catch (err) {
      failed.push({
        fileName: file.originalname,
        error: err instanceof Error ? err.message : "Failed to create draft",
      });
    }
  }

  return { created, failed };
}
