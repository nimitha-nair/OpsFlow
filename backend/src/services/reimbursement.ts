import {
  REIMBURSEMENT_STATUSES,
  type ReimbursementStatus,
} from "../types/expense.types";

/**
 * Reimbursement is a forward-only lifecycle: PENDING → PROCESSING → PAID. Once an
 * expense is PAID the status is locked. Any backward move (or a no-op) is invalid;
 * a genuine reversal must be a separate, audited action — not a status change.
 *
 * `REIMBURSEMENT_STATUSES` is declared in progression order, so the array index
 * is the rank.
 */
function rank(status: ReimbursementStatus): number {
  return REIMBURSEMENT_STATUSES.indexOf(status);
}

/** True only when `to` is strictly further along than `from`. */
export function isValidReimbursementTransition(
  from: ReimbursementStatus,
  to: ReimbursementStatus,
): boolean {
  return rank(to) > rank(from);
}

/** The statuses an expense may legally advance to from its current one. */
export function nextReimbursementStatuses(
  from: ReimbursementStatus,
): ReimbursementStatus[] {
  return REIMBURSEMENT_STATUSES.filter((s) =>
    isValidReimbursementTransition(from, s),
  );
}
