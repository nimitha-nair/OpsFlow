import type { ExtractionResult, TokenUsage } from "./extraction";

/** First non-null value across the documents (primary-document-wins). */
function firstNonNull<T>(values: (T | null)[]): T | null {
  for (const v of values) {
    if (v != null) return v;
  }
  return null;
}

function sumUsage(results: ExtractionResult[]): TokenUsage | null {
  const present = results
    .map((r) => r.usage)
    .filter((u): u is TokenUsage => u != null);
  if (present.length === 0) return null;
  return present.reduce(
    (acc, u) => ({
      promptTokens: acc.promptTokens + u.promptTokens,
      completionTokens: acc.completionTokens + u.completionTokens,
      totalTokens: acc.totalTokens + u.totalTokens,
    }),
    { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  );
}

/**
 * Combine per-document extractions into one result representing the expense as a
 * whole (per the confirmed "sensible defaults" rule):
 *   - amount: SUM of per-document amounts (null only if every document is null)
 *   - transactionDate: earliest
 *   - vendor / category / currency / paymentMethod: primary (first) document
 *   - taxInformation: distinct values concatenated
 *   - confidenceScore: lowest (most conservative)
 * A single-document list passes through effectively unchanged.
 */
export function aggregateExtractions(
  results: ExtractionResult[],
): ExtractionResult {
  if (results.length === 1) {
    return results[0]!;
  }

  const amounts = results
    .map((r) => r.amount)
    .filter((a): a is number => typeof a === "number");
  const amount = amounts.length > 0 ? amounts.reduce((a, b) => a + b, 0) : null;

  const dates = results
    .map((r) => r.transactionDate)
    .filter((d): d is string => !!d)
    .sort();
  const transactionDate = dates[0] ?? null;

  const taxes = [
    ...new Set(
      results.map((r) => r.taxInformation).filter((t): t is string => !!t),
    ),
  ];
  const taxInformation = taxes.length > 0 ? taxes.join("; ") : null;

  const confidenceScore = Math.min(...results.map((r) => r.confidenceScore));

  return {
    vendorName: firstNonNull(results.map((r) => r.vendorName)),
    amount,
    transactionDate,
    currency: firstNonNull(results.map((r) => r.currency)),
    paymentMethod: firstNonNull(results.map((r) => r.paymentMethod)),
    category: firstNonNull(results.map((r) => r.category)),
    taxInformation,
    lowConfidenceReason: firstNonNull(results.map((r) => r.lowConfidenceReason)),
    confidenceScore,
    // Authenticity is the most conservative (lowest) across docs; risk reasons
    // are the union — any suspicious document flags the whole expense.
    authenticityScore: Math.min(...results.map((r) => r.authenticityScore ?? 100)),
    riskReasons: [...new Set(results.flatMap((r) => r.riskReasons ?? []))],
    rawOutput: JSON.stringify(results.map((r) => r.rawOutput)),
    usage: sumUsage(results),
  };
}
