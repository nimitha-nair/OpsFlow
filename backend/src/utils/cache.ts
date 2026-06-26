/**
 * A tiny in-process TTL cache for expensive analytics/report datasets. Goals:
 *   - cut Firestore reads when pages are refreshed repeatedly (short TTL),
 *   - coalesce concurrent identical loads into ONE Firestore read (stampede
 *     guard — also how several report endpoints in one page load share a fetch),
 *   - invalidate immediately on writes via collection-prefixed keys.
 *
 * In-process is sufficient: OpsFlow runs a single backend. A future multi-node
 * deploy would swap this for a shared cache without changing call sites.
 */

interface Entry {
  value: unknown;
  expiresAt: number;
}

export class TtlCache {
  private store = new Map<string, Entry>();
  private pending = new Map<string, Promise<unknown>>();

  constructor(private readonly maxEntries = 200) {}

  /**
   * Return the cached value for `key`, or run `loader` once and cache it for
   * `ttlMs`. Concurrent callers for the same key await a single in-flight load.
   */
  async getOrLoad<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const hit = this.store.get(key);
    if (hit && hit.expiresAt > now) {
      return hit.value as T;
    }
    const inflight = this.pending.get(key);
    if (inflight) {
      return inflight as Promise<T>;
    }
    const load = (async () => {
      try {
        const value = await loader();
        this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
        this.evict();
        return value;
      } finally {
        this.pending.delete(key);
      }
    })();
    this.pending.set(key, load);
    return load as Promise<T>;
  }

  /** Drop every cached entry whose key starts with `prefix` (write invalidation). */
  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  clear(): void {
    this.store.clear();
  }

  /** Evict the oldest-inserted entry once over capacity (simple FIFO bound). */
  private evict(): void {
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }
}

/** Shared cache for analytics/report datasets. */
export const analyticsCache = new TtlCache();

/** Default TTL for cached analytics datasets (ms). Short — writes also invalidate. */
export const ANALYTICS_TTL_MS = Number.parseInt(
  process.env.ANALYTICS_CACHE_TTL_MS ?? "30000",
  10,
);

/**
 * Cache namespaces. Loaders key as `${ns}:...`; write paths call
 * `invalidateCollection(ns)` so the names must match — using these constants on
 * both sides prevents drift (e.g. the analysis dataset lives under "analysis"
 * even though its Firestore collection is "expenseAnalysis").
 */
export const CACHE_NS = {
  expenses: "expenses",
  projects: "projects",
  analysis: "analysis",
} as const;

/**
 * Invalidate all cached datasets derived from a collection after a write. Call
 * this from create/update/delete paths so analytics never serve stale money.
 */
export function invalidateCollection(collection: string): void {
  analyticsCache.invalidatePrefix(`${collection}:`);
}
