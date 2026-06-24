import { afterEach, describe, expect, it } from "vitest";
import {
  RECENT_SEARCH_PREFIX,
  clearRecentSearches,
  loadRecent,
  saveRecent,
} from "./recent-search";
import type { SearchResult } from "../types/search";

const r = (id: string): SearchResult => ({ entity: "task", id, title: `T-${id}` });

afterEach(() => localStorage.clear());

describe("recent-search storage", () => {
  it("isolates history per user", () => {
    saveRecent("u1", [r("a"), r("b")]);
    expect(loadRecent("u1").map((x) => x.id)).toEqual(["a", "b"]);
    expect(loadRecent("u2")).toEqual([]);
  });

  it("purges the legacy shared key on load", () => {
    localStorage.setItem(RECENT_SEARCH_PREFIX, JSON.stringify([r("leak")]));
    expect(loadRecent("u1")).toEqual([]);
    expect(localStorage.getItem(RECENT_SEARCH_PREFIX)).toBeNull();
  });

  it("caps stored history at 6 entries", () => {
    saveRecent("u1", [r("1"), r("2"), r("3"), r("4"), r("5"), r("6"), r("7")]);
    expect(loadRecent("u1")).toHaveLength(6);
  });

  it("clearRecentSearches removes legacy and all per-user keys", () => {
    localStorage.setItem(RECENT_SEARCH_PREFIX, "[]");
    saveRecent("u1", [r("a")]);
    saveRecent("u2", [r("b")]);
    localStorage.setItem("opsflow_theme", "dark");
    clearRecentSearches();
    expect(localStorage.getItem(RECENT_SEARCH_PREFIX)).toBeNull();
    expect(loadRecent("u1")).toEqual([]);
    expect(loadRecent("u2")).toEqual([]);
    expect(localStorage.getItem("opsflow_theme")).toBe("dark");
  });
});
