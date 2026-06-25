import type { RiskLevel, RiskReason } from "../../types/expenseAnalysis.types";

/** Indicators that, on their own, push a receipt to HIGH risk. */
const HIGH_RISK_REASONS: ReadonlySet<RiskReason> = new Set([
  "EDITED",
  "SYNTHETIC",
  "DUPLICATE",
]);

/**
 * Derive the receipt's risk level from its authenticity score and detected
 * indicators. Deliberately conservative — when in doubt it leans toward MEDIUM so
 * HR takes a second look. This assists HR; it never auto-rejects.
 *
 *   HIGH   — a strong indicator (edited/synthetic/duplicate) OR very low authenticity
 *   MEDIUM — any indicator present OR below-par authenticity
 *   LOW    — clean original, high authenticity
 */
export function deriveRiskLevel(
  authenticityScore: number,
  reasons: readonly RiskReason[],
): RiskLevel {
  if (reasons.some((r) => HIGH_RISK_REASONS.has(r)) || authenticityScore < 50) {
    return "HIGH";
  }
  if (reasons.length > 0 || authenticityScore < 75) {
    return "MEDIUM";
  }
  return "LOW";
}
