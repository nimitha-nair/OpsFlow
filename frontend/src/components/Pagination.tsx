interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

/** Compact Prev / "Page X of Y" / Next control for paginated lists. */
export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;
  return (
    <nav className="flex items-center justify-center gap-3 py-3" aria-label="Pagination">
      <button
        type="button"
        className="rounded border px-3 py-1 text-sm disabled:opacity-40"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
      >
        Prev
      </button>
      <span className="text-sm text-muted-foreground">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        className="rounded border px-3 py-1 text-sm disabled:opacity-40"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
      >
        Next
      </button>
    </nav>
  );
}
