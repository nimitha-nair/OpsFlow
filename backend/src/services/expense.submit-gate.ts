import { ApiError } from "../utils/errors";

/**
 * Guard a draft before it leaves DRAFT/REJECTED. AI-first drafts may be created
 * without amount/category/date (those come from extraction + verification), so we
 * enforce completeness here rather than at creation time.
 */
export function assertSubmittable(expense: {
  amount?: number;
  category?: string;
  expenseDate?: string;
}): void {
  if (typeof expense.amount !== "number" || expense.amount <= 0) {
    throw new ApiError(
      400,
      "An amount greater than zero is required before submitting.",
    );
  }
  if (!expense.category) {
    throw new ApiError(400, "A category is required before submitting.");
  }
  if (!expense.expenseDate) {
    throw new ApiError(400, "An expense date is required before submitting.");
  }
}
