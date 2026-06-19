/**
 * Resolve the effective document-id list for an expense, backward-compatible with
 * the legacy single `documentId`. Prefers `documentIds`; falls back to
 * `[documentId]` when only the legacy pointer is set; otherwise returns `[]`.
 */
export function deriveDocumentIds(expense: {
  documentId?: string;
  documentIds?: string[];
}): string[] {
  if (expense.documentIds && expense.documentIds.length > 0) {
    return expense.documentIds;
  }
  return expense.documentId ? [expense.documentId] : [];
}
