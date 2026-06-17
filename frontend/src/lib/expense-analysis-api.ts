import { api } from "./api";
import type {
  ExpenseAnalysis,
  UpdateAnalysisPayload,
} from "../types/expenseAnalysis";

/** Trigger (or re-run) AI analysis. Returns the row in PENDING/PROCESSING/FAILED. */
export async function analyzeExpense(id: string): Promise<ExpenseAnalysis> {
  const { data } = await api.post<ExpenseAnalysis>(`/expenses/${id}/analyze`, {});
  return data;
}

/** Read the analysis (null if none yet). */
export async function getExpenseAnalysis(
  id: string,
): Promise<ExpenseAnalysis | null> {
  const { data } = await api.get<ExpenseAnalysis | null>(`/expenses/${id}/analysis`);
  return data;
}

/** Save edits / confirm. confirm=true writes verified values back to the expense. */
export async function updateExpenseAnalysis(
  id: string,
  payload: UpdateAnalysisPayload,
): Promise<ExpenseAnalysis> {
  const { data } = await api.patch<ExpenseAnalysis>(
    `/expenses/${id}/analysis`,
    payload,
  );
  return data;
}
