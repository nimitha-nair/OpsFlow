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

/**
 * Sort document views oldest-first by their ISO `uploadedAt`. Done in memory so
 * the listing query needs only a single-field (`expenseId`) equality filter — no
 * composite Firestore index — making the receipt viewer robust regardless of
 * index deployment.
 */
export function sortByUploadedAtAsc<T extends { uploadedAt: string }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
}
