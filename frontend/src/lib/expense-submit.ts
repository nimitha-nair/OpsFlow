import { updateExpenseAnalysis } from "./expense-analysis-api";
import { submitExpense } from "./expenses-api";
import type { UpdateAnalysisPayload } from "../types/expenseAnalysis";

/**
 * Confirm the (optionally edited) analysis values back onto the expense and
 * submit it for approval. Shared by the verify form ("Edit" path) and the
 * analysis review page's fast-path "Submit" button so both go through the
 * exact same write sequence.
 */
export async function confirmAndSubmitExpense(
  id: string,
  values: Omit<UpdateAnalysisPayload, "confirm">,
): Promise<void> {
  await updateExpenseAnalysis(id, { ...values, confirm: true });
  await submitExpense(id);
}
