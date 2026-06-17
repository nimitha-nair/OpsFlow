import type { ExtractionInput, ExtractionResult } from "./extraction";
import { mockExtractor } from "./mock-extractor";

export type { ExtractionInput, ExtractionResult } from "./extraction";

/** Provider-agnostic receipt extractor. The only seam Kimi plugs into. */
export interface ExpenseExtractor {
  extract(input: ExtractionInput): Promise<ExtractionResult>;
}

/** Pick the extractor implementation from AI_PROVIDER (default: mock). */
export function getExtractor(): ExpenseExtractor {
  // Only the mock exists at this point; the kimi branch is wired in Task 6.
  return mockExtractor;
}
