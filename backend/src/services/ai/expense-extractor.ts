import { getAiConfig } from "../../config/ai";
import type { ExtractionInput, ExtractionResult } from "./extraction";
import { mockExtractor } from "./mock-extractor";
import { kimiExtractor } from "./kimi-extractor";

export type { ExtractionInput, ExtractionResult } from "./extraction";

/** Provider-agnostic receipt extractor. The only seam Kimi plugs into. */
export interface ExpenseExtractor {
  extract(input: ExtractionInput): Promise<ExtractionResult>;
}

/** Pick the extractor implementation from AI_PROVIDER (default: mock). */
export function getExtractor(): ExpenseExtractor {
  return getAiConfig().provider === "kimi" ? kimiExtractor : mockExtractor;
}
