import type { ExpenseExtractor } from "./expense-extractor";
import type { ExtractionInput, ExtractionResult } from "./extraction";

const VENDORS = ["Uber", "Amazon", "Starbucks", "AWS", "Office Depot"];
const CATEGORIES = ["Travel", "Software", "Food", "Cloud", "Office"];
const METHODS = ["UPI", "CARD", "CASH", "NETBANKING"];

/** Small stable hash so mock output is deterministic per expenseId. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Deterministic mock extractor — ignores the actual document and derives stable
 * fake data from the expenseId. Confidence spans 50–99 so both COMPLETED and
 * LOW_CONFIDENCE states are reachable for demo/testing.
 */
export const mockExtractor: ExpenseExtractor = {
  async extract(input: ExtractionInput): Promise<ExtractionResult> {
    const h = hash(input.expenseId);
    const amount = 100 + (h % 9900) / 10; // 100.0 – 1090.0
    const day = (h % 28) + 1;
    const transactionDate = `2026-06-${String(day).padStart(2, "0")}`;
    // Spread 50–99 must straddle the default 70 threshold for the mock test's
    // single-char ids (a–h, hashes 97–104): a–c → 97–99, d–h → 50–54. If you
    // change this formula, re-check mock-extractor.test.ts "varies confidence".
    const confidenceScore = 50 + (h % 50); // 50 – 99
    const result = {
      // Non-null assertions: the arrays are constant and non-empty, so the
      // modulo index is always in range (tsconfig has noUncheckedIndexedAccess).
      vendorName: VENDORS[h % VENDORS.length]!,
      amount: Math.round(amount * 100) / 100,
      transactionDate,
      currency: "INR",
      paymentMethod: METHODS[h % METHODS.length]!,
      category: CATEGORIES[h % CATEGORIES.length]!,
      taxInformation: h % 2 === 0 ? "GST 18%" : null,
      confidenceScore,
    };
    return { ...result, rawOutput: JSON.stringify(result) };
  },
};
