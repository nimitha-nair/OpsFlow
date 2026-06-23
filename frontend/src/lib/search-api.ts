import { api } from "./api";
import type { SearchResult } from "../types/search";

/** GET /search?q= — cross-entity, RBAC-scoped results. */
export async function globalSearch(q: string): Promise<SearchResult[]> {
  const query = q.trim();
  if (!query) return [];
  const { data } = await api.get<{ results: SearchResult[] }>("/search", {
    params: { q: query },
  });
  return data.results;
}
