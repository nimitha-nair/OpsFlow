import type { SearchResult } from "../types/search";

/** Namespace for per-user recent-search history. The bare prefix (no suffix) is
 *  the legacy SHARED key that leaked across users; it is purged on read/clear. */
export const RECENT_SEARCH_PREFIX = "opsflow.search.recent";
const RECENT_MAX = 6;

export function recentSearchKey(userId: string): string {
  return `${RECENT_SEARCH_PREFIX}.${userId}`;
}

function purgeLegacy(): void {
  try {
    localStorage.removeItem(RECENT_SEARCH_PREFIX);
  } catch {
    /* ignore */
  }
}

export function loadRecent(userId: string): SearchResult[] {
  purgeLegacy();
  try {
    const raw = localStorage.getItem(recentSearchKey(userId));
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr)
      ? (arr as SearchResult[]).slice(0, RECENT_MAX)
      : [];
  } catch {
    return [];
  }
}

export function saveRecent(userId: string, items: SearchResult[]): void {
  try {
    localStorage.setItem(
      recentSearchKey(userId),
      JSON.stringify(items.slice(0, RECENT_MAX)),
    );
  } catch {
    /* ignore quota/availability errors */
  }
}

export function clearRecentSearches(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(RECENT_SEARCH_PREFIX)) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}
