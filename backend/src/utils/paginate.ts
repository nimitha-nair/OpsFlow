export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paged<T> {
  data: T[];
  pagination: Pagination;
}

/**
 * Slice an in-memory, already-filtered array into one page. Mirrors the shape
 * used by listApprovedExpenses so every list endpoint returns the same envelope.
 */
export function paginate<T>(items: T[], page: number, limit: number): Paged<T> {
  const total = items.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  const start = (page - 1) * limit;
  return {
    data: items.slice(start, start + limit),
    pagination: { page, limit, total, totalPages },
  };
}
