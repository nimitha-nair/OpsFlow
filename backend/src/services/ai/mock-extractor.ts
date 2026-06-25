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
    // Vary by the document being analyzed (per-document extraction) so a
    // multi-document expense gets a distinct, summable amount per file. Falls
    // back to expenseId when no document id is supplied.
    const docKey = input.documentIds?.[0] ?? input.documentId ?? "";
    const h = hash(`${input.expenseId}:${docKey}`);
    const amount = 100 + (h % 9900) / 10; // 100.0 – 1090.0
    const day = (h % 28) + 1;
    const transactionDate = `2026-06-${String(day).padStart(2, "0")}`;
    // Spread 50–99 so both COMPLETED and LOW_CONFIDENCE states are reachable.
    const confidenceScore = 50 + (h % 50); // 50 – 99
    // Make ~1 in 4 mock receipts look risky so HR's risk surfacing is demoable.
    const RISKY = ["BLURRY", "SCREENSHOT", "CROPPED", "LOW_RESOLUTION"] as const;
    const risky = h % 4 === 0;
    const authenticityScore = risky ? 55 + (h % 18) : 86 + (h % 14); // risky 55–72, clean 86–99
    const riskReasons = risky ? [RISKY[(h >> 3) % RISKY.length]!] : [];
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
      lowConfidenceReason:
        confidenceScore < 70
          ? "Receipt image was blurry; some fields were only partially legible."
          : null,
      confidenceScore,
      authenticityScore,
      riskReasons,
    };
    return { ...result, rawOutput: JSON.stringify(result) };
  },
};
