import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
} from "../../types/expense.types";

/** Substring → canonical category. First match wins; order matters. */
const SYNONYMS: ReadonlyArray<[string, ExpenseCategory]> = [
  ["cloud", "CLOUD_SERVICES"],
  ["aws", "CLOUD_SERVICES"],
  ["azure", "CLOUD_SERVICES"],
  ["software", "SOFTWARE"],
  ["subscription", "SOFTWARE"],
  ["saas", "SOFTWARE"],
  ["hardware", "HARDWARE"],
  ["laptop", "HARDWARE"],
  ["device", "HARDWARE"],
  ["travel", "TRAVEL"],
  ["taxi", "TRAVEL"],
  ["uber", "TRAVEL"],
  ["flight", "TRAVEL"],
  ["hotel", "TRAVEL"],
  ["food", "FOOD"],
  ["meal", "FOOD"],
  ["restaurant", "FOOD"],
  ["training", "TRAINING"],
  ["course", "TRAINING"],
  ["office", "OFFICE_SUPPLIES"],
  ["stationery", "OFFICE_SUPPLIES"],
  ["supplies", "OFFICE_SUPPLIES"],
];

/** Map free-text model category to a valid ExpenseCategory, or undefined. */
export function mapToExpenseCategory(
  raw: string | null | undefined,
): ExpenseCategory | undefined {
  if (!raw) return undefined;
  const norm = raw.trim().toUpperCase().replace(/\s+/g, "_");
  if ((EXPENSE_CATEGORIES as readonly string[]).includes(norm)) {
    return norm as ExpenseCategory;
  }
  const lower = raw.toLowerCase();
  for (const [needle, cat] of SYNONYMS) {
    if (lower.includes(needle)) return cat;
  }
  return undefined;
}
