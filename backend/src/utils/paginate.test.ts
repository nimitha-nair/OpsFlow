import { describe, expect, it } from "vitest";
import { paginate } from "./paginate";

const items = Array.from({ length: 25 }, (_, i) => i + 1);

describe("paginate", () => {
  it("returns the first page and correct totals", () => {
    const r = paginate(items, 1, 10);
    expect(r.data).toEqual([1,2,3,4,5,6,7,8,9,10]);
    expect(r.pagination).toEqual({ page: 1, limit: 10, total: 25, totalPages: 3 });
  });

  it("returns the last (partial) page", () => {
    const r = paginate(items, 3, 10);
    expect(r.data).toEqual([21,22,23,24,25]);
    expect(r.pagination.totalPages).toBe(3);
  });

  it("returns empty data for a page past the end", () => {
    const r = paginate(items, 99, 10);
    expect(r.data).toEqual([]);
    expect(r.pagination.total).toBe(25);
  });

  it("reports 0 totalPages for an empty list", () => {
    const r = paginate([], 1, 10);
    expect(r.pagination).toEqual({ page: 1, limit: 10, total: 0, totalPages: 0 });
  });
});
