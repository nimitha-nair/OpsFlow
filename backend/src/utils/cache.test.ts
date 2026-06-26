import { describe, expect, it, vi } from "vitest";

import { TtlCache } from "./cache";

describe("TtlCache", () => {
  it("loads once and serves the cached value within the TTL", async () => {
    const cache = new TtlCache();
    const loader = vi.fn().mockResolvedValue(42);
    expect(await cache.getOrLoad("k", 1000, loader)).toBe(42);
    expect(await cache.getOrLoad("k", 1000, loader)).toBe(42);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("reloads after the TTL expires", async () => {
    vi.useFakeTimers();
    try {
      const cache = new TtlCache();
      const loader = vi.fn().mockResolvedValueOnce("a").mockResolvedValueOnce("b");
      expect(await cache.getOrLoad("k", 1000, loader)).toBe("a");
      vi.advanceTimersByTime(1001);
      expect(await cache.getOrLoad("k", 1000, loader)).toBe("b");
      expect(loader).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("coalesces concurrent loads into a single call (stampede guard)", async () => {
    const cache = new TtlCache();
    let resolve!: (v: number) => void;
    const loader = vi.fn(() => new Promise<number>((r) => (resolve = r)));
    const a = cache.getOrLoad("k", 1000, loader);
    const b = cache.getOrLoad("k", 1000, loader);
    resolve(7);
    expect(await a).toBe(7);
    expect(await b).toBe(7);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("invalidatePrefix drops matching keys so the next read reloads", async () => {
    const cache = new TtlCache();
    const loader = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    expect(await cache.getOrLoad("expenses:all", 10_000, loader)).toBe(1);
    cache.invalidatePrefix("expenses:");
    expect(await cache.getOrLoad("expenses:all", 10_000, loader)).toBe(2);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("bounds its size by evicting oldest entries", async () => {
    const cache = new TtlCache(2);
    await cache.getOrLoad("a", 10_000, async () => 1);
    await cache.getOrLoad("b", 10_000, async () => 2);
    await cache.getOrLoad("c", 10_000, async () => 3); // evicts "a"
    const reload = vi.fn().mockResolvedValue(99);
    await cache.getOrLoad("a", 10_000, reload);
    expect(reload).toHaveBeenCalledTimes(1); // "a" was evicted
  });
});
