import { describe, expect, it } from "vitest";

import {
  buildAiAnalytics,
  buildMonthlyTrend,
  buildProjectRows,
  clampMonths,
  composeOverviewKpis,
  groupByCategory,
  monthKeys,
  normalizeCurrency,
  pickActiveCurrency,
  splitByScope,
  summarizeProjects,
  tallyByStatus,
  totalsByCurrency,
  type ProjectLike,
} from "./reports.aggregate";
import type {
  AiAnalysisRow,
  ApprovedExpenseRow,
  ProjectExpenseAgg,
} from "../types/reports.types";

function row(over: Partial<ApprovedExpenseRow> = {}): ApprovedExpenseRow {
  return {
    category: "SOFTWARE",
    amount: 100,
    scope: "PROJECT",
    expenseDate: "2026-06-10",
    ...over,
  };
}

describe("composeOverviewKpis", () => {
  it("maps each status group and derives pending + total", () => {
    const kpis = composeOverviewKpis({
      SUBMITTED: { count: 2, amount: 200 },
      PENDING_REVIEW: { count: 3, amount: 300 },
      APPROVED: { count: 10, amount: 1000 },
      REJECTED: { count: 1, amount: 50 },
    });
    expect(kpis.approved).toEqual({ count: 10, amount: 1000 });
    expect(kpis.rejected).toEqual({ count: 1, amount: 50 });
    // pending = SUBMITTED + PENDING_REVIEW
    expect(kpis.pending).toEqual({ count: 5, amount: 500 });
    // total = approved + pending + rejected
    expect(kpis.total).toEqual({ count: 16, amount: 1550 });
  });

  it("treats missing statuses as zero", () => {
    const kpis = composeOverviewKpis({ APPROVED: { count: 4, amount: 400 } });
    expect(kpis.approved).toEqual({ count: 4, amount: 400 });
    expect(kpis.pending).toEqual({ count: 0, amount: 0 });
    expect(kpis.rejected).toEqual({ count: 0, amount: 0 });
    expect(kpis.total).toEqual({ count: 4, amount: 400 });
  });

  it("excludes DRAFT from every KPI", () => {
    const kpis = composeOverviewKpis({
      DRAFT: { count: 99, amount: 9999 },
      APPROVED: { count: 1, amount: 100 },
    });
    expect(kpis.total).toEqual({ count: 1, amount: 100 });
    expect(kpis.pending.count).toBe(0);
  });

  it("rounds summed amounts to 2dp (no float drift)", () => {
    const kpis = composeOverviewKpis({
      APPROVED: { count: 1, amount: 0.1 },
      SUBMITTED: { count: 1, amount: 0.2 },
    });
    expect(kpis.total.amount).toBe(0.3); // 0.1 + 0.2 would be 0.30000000000000004
  });

  it("returns all-zero KPIs for no data", () => {
    const kpis = composeOverviewKpis({});
    for (const k of [kpis.total, kpis.approved, kpis.pending, kpis.rejected]) {
      expect(k).toEqual({ count: 0, amount: 0 });
    }
  });
});

describe("clampMonths", () => {
  it("clamps to 1–24 and rounds", () => {
    expect(clampMonths(0)).toBe(1);
    expect(clampMonths(-5)).toBe(1);
    expect(clampMonths(1)).toBe(1);
    expect(clampMonths(12)).toBe(12);
    expect(clampMonths(24)).toBe(24);
    expect(clampMonths(51)).toBe(24);
    expect(clampMonths(3.7)).toBe(4);
  });
  it("defaults junk to 12", () => {
    expect(clampMonths(NaN)).toBe(12);
    expect(clampMonths(Infinity)).toBe(12);
  });
});

describe("monthKeys", () => {
  it("returns trailing months oldest→newest", () => {
    expect(monthKeys(new Date(2026, 5, 15), 3)).toEqual([
      "2026-04",
      "2026-05",
      "2026-06",
    ]);
  });
  it("handles a single month", () => {
    expect(monthKeys(new Date(2026, 5, 15), 1)).toEqual(["2026-06"]);
  });
  it("crosses a year boundary", () => {
    expect(monthKeys(new Date(2026, 0, 10), 3)).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
    ]);
  });
});

describe("groupByCategory", () => {
  it("sums + counts per category, descending by amount", () => {
    const out = groupByCategory([
      row({ category: "TRAVEL", amount: 50 }),
      row({ category: "SOFTWARE", amount: 200 }),
      row({ category: "TRAVEL", amount: 100 }),
    ]);
    expect(out).toEqual([
      { category: "SOFTWARE", amount: 200, count: 1 },
      { category: "TRAVEL", amount: 150, count: 2 },
    ]);
  });
  it("breaks amount ties by category name", () => {
    const out = groupByCategory([
      row({ category: "HARDWARE", amount: 100 }),
      row({ category: "FOOD", amount: 100 }),
    ]);
    expect(out.map((c) => c.category)).toEqual(["FOOD", "HARDWARE"]);
  });
  it("returns [] for no rows", () => {
    expect(groupByCategory([])).toEqual([]);
  });
});

describe("buildMonthlyTrend", () => {
  const ref = new Date(2026, 5, 15); // Jun 2026
  it("zero-pads empty months and buckets by YYYY-MM, oldest→newest", () => {
    const out = buildMonthlyTrend(
      [
        row({ amount: 100, expenseDate: "2026-06-01" }),
        row({ amount: 50, expenseDate: "2026-06-20" }),
        row({ amount: 30, expenseDate: "2026-04-15" }),
      ],
      3,
      ref,
    );
    expect(out).toEqual([
      { month: "2026-04", amount: 30, count: 1 },
      { month: "2026-05", amount: 0, count: 0 },
      { month: "2026-06", amount: 150, count: 2 },
    ]);
  });
  it("ignores rows outside the window", () => {
    const out = buildMonthlyTrend(
      [row({ amount: 999, expenseDate: "2025-01-01" })],
      3,
      ref,
    );
    expect(out.every((m) => m.amount === 0)).toBe(true);
  });
});

describe("splitByScope", () => {
  it("splits amount + count by scope", () => {
    expect(
      splitByScope([
        row({ scope: "PROJECT", amount: 100 }),
        row({ scope: "PROJECT", amount: 50 }),
        row({ scope: "GENERAL", amount: 25 }),
      ]),
    ).toEqual({
      project: 150,
      general: 25,
      projectCount: 2,
      generalCount: 1,
    });
  });
  it("returns zeros for no rows", () => {
    expect(splitByScope([])).toEqual({
      project: 0,
      general: 0,
      projectCount: 0,
      generalCount: 0,
    });
  });
});

describe("normalizeCurrency", () => {
  it("uppercases, trims, and defaults blank/non-string to INR", () => {
    expect(normalizeCurrency(" usd ")).toBe("USD");
    expect(normalizeCurrency("inr")).toBe("INR");
    expect(normalizeCurrency("")).toBe("INR");
    expect(normalizeCurrency(undefined)).toBe("INR");
    expect(normalizeCurrency(42)).toBe("INR");
  });
});

describe("totalsByCurrency", () => {
  it("tallies count + amount per currency, descending by amount", () => {
    const rows = [
      { currency: "INR", amount: 100 },
      { currency: "usd", amount: 50 },
      { currency: "INR", amount: 200 },
      { currency: "USD", amount: 25 },
      { currency: undefined, amount: 10 }, // counts as INR
    ];
    expect(totalsByCurrency(rows)).toEqual([
      { currency: "INR", count: 3, amount: 310 },
      { currency: "USD", count: 2, amount: 75 },
    ]);
  });

  it("breaks amount ties by currency code ascending", () => {
    const rows = [
      { currency: "USD", amount: 100 },
      { currency: "EUR", amount: 100 },
    ];
    expect(totalsByCurrency(rows).map((t) => t.currency)).toEqual(["EUR", "USD"]);
  });

  it("returns an empty array for no rows", () => {
    expect(totalsByCurrency([])).toEqual([]);
  });
});

describe("pickActiveCurrency", () => {
  const totals = [
    { currency: "INR", count: 3, amount: 310 },
    { currency: "USD", count: 2, amount: 75 },
  ];

  it("honors a requested currency that has data in range", () => {
    expect(pickActiveCurrency(totals, "usd")).toBe("USD");
  });

  it("falls back to the dominant currency when the request is absent/unknown", () => {
    expect(pickActiveCurrency(totals)).toBe("INR");
    expect(pickActiveCurrency(totals, "GBP")).toBe("INR");
  });

  it("falls back to INR when there is no data at all", () => {
    expect(pickActiveCurrency([], "USD")).toBe("INR");
  });
});

describe("buildProjectRows", () => {
  const projects: ProjectLike[] = [
    { id: "p1", name: "Apollo", status: "ACTIVE", budget: 1000, archived: false },
    { id: "p2", name: "Helios", status: "ACTIVE", budget: 0, archived: false }, // no budget
    { id: "p3", name: "Zephyr", status: "ON_HOLD", budget: 500, archived: true },
  ];
  const spent = new Map<string, ProjectExpenseAgg>([
    ["p1", { amount: 850, count: 4 }],
    ["p2", { amount: 200, count: 2 }],
    ["p3", { amount: 600, count: 3 }], // over budget
  ]);

  it("computes utilization + remaining and sorts by spend desc", () => {
    const rows = buildProjectRows(projects, spent);
    expect(rows.map((r) => r.projectId)).toEqual(["p1", "p3", "p2"]);
    const apollo = rows.find((r) => r.projectId === "p1")!;
    expect(apollo).toMatchObject({
      totalSpent: 850,
      remaining: 150,
      utilization: 85,
      hasBudget: true,
      expenseCount: 4,
    });
  });

  it("handles projects without a budget (null remaining/utilization)", () => {
    const rows = buildProjectRows(projects, spent);
    const helios = rows.find((r) => r.projectId === "p2")!;
    expect(helios.hasBudget).toBe(false);
    expect(helios.remaining).toBeNull();
    expect(helios.utilization).toBeNull();
    expect(helios.totalSpent).toBe(200);
  });

  it("reports over-budget utilization above 100%", () => {
    const rows = buildProjectRows(projects, spent);
    const zephyr = rows.find((r) => r.projectId === "p3")!;
    expect(zephyr.utilization).toBe(120); // 600 / 500
    expect(zephyr.remaining).toBe(-100);
    expect(zephyr.archived).toBe(true);
  });

  it("treats projects with no expenses as zero spend", () => {
    const rows = buildProjectRows(
      [{ id: "x", name: "X", status: "ACTIVE", budget: 100, archived: false }],
      new Map(),
    );
    expect(rows[0]).toMatchObject({ totalSpent: 0, utilization: 0, remaining: 100 });
  });

  it("stamps rows with the active currency (defaults to INR)", () => {
    expect(buildProjectRows(projects, spent)[0]!.currency).toBe("INR");
    expect(buildProjectRows(projects, spent, "USD")[0]!.currency).toBe("USD");
  });
});

describe("summarizeProjects", () => {
  it("rolls up totals and flags near-limit (>=80) and over-budget (>100)", () => {
    const rows = buildProjectRows(
      [
        { id: "a", name: "A", status: "ACTIVE", budget: 1000, archived: false },
        { id: "b", name: "B", status: "ACTIVE", budget: 1000, archived: false },
        { id: "c", name: "C", status: "ACTIVE", budget: 0, archived: false },
      ],
      new Map<string, ProjectExpenseAgg>([
        ["a", { amount: 850, count: 1 }], // 85% near-limit
        ["b", { amount: 1200, count: 1 }], // 120% over-budget
        ["c", { amount: 300, count: 1 }], // no budget — excluded from flags
      ]),
    );
    const totals = summarizeProjects(rows);
    expect(totals.projectCount).toBe(3);
    expect(totals.budget).toBe(2000);
    expect(totals.spent).toBe(2350);
    expect(totals.nearLimitCount).toBe(1);
    expect(totals.overBudgetCount).toBe(1);
  });
});

describe("buildAiAnalytics", () => {
  const ref = new Date(2026, 5, 15);
  function aiRow(over: Partial<AiAnalysisRow> = {}): AiAnalysisRow {
    return {
      status: "COMPLETED",
      provider: "kimi",
      confidenceScore: 90,
      confirmed: false,
      corrected: false,
      createdAt: "2026-06-10T00:00:00.000Z",
      ...over,
    };
  }

  it("computes status mix, confidence, and rates", () => {
    const out = buildAiAnalytics(
      [
        aiRow({ status: "COMPLETED", confidenceScore: 95, confirmed: true, corrected: true }),
        aiRow({ status: "LOW_CONFIDENCE", confidenceScore: 55, confirmed: true, corrected: false }),
        // FAILED run has no confidence score — build without the field.
        {
          status: "FAILED",
          provider: "kimi",
          confirmed: false,
          corrected: false,
          createdAt: "2026-06-10T00:00:00.000Z",
        },
      ],
      ref,
    );
    expect(out.totals.total).toBe(3);
    expect(out.totals.completed).toBe(1);
    expect(out.totals.lowConfidence).toBe(1);
    expect(out.totals.failed).toBe(1);
    expect(out.totals.averageConfidence).toBe(75); // (95+55)/2
    expect(out.totals.lowConfidencePct).toBe(50); // 1 of 2 scored
    expect(out.totals.successRate).toBeCloseTo(66.67, 1); // 2 of 3 terminal
    expect(out.totals.confirmed).toBe(2);
    expect(out.totals.corrected).toBe(1);
    expect(out.totals.manualCorrectionRate).toBe(50); // 1 of 2 confirmed
  });

  it("returns null for unavailable processing time / tokens, present when set", () => {
    const none = buildAiAnalytics([aiRow()], ref);
    expect(none.totals.averageProcessingMs).toBeNull();
    expect(none.kimiUsage).toBeNull();

    const withData = buildAiAnalytics(
      [aiRow({ processingMs: 1000, tokensUsed: 500 }), aiRow({ processingMs: 3000, tokensUsed: 700 })],
      ref,
    );
    expect(withData.totals.averageProcessingMs).toBe(2000);
    expect(withData.kimiUsage).toEqual({
      analysesWithTokens: 2,
      totalTokens: 1200,
      averageTokens: 600,
    });
  });

  it("buckets confidence and distributes providers", () => {
    const out = buildAiAnalytics(
      [
        aiRow({ confidenceScore: 95, provider: "kimi" }),
        aiRow({ confidenceScore: 72, provider: "kimi" }),
        aiRow({ confidenceScore: 40, provider: "mock" }),
      ],
      ref,
    );
    const b = Object.fromEntries(out.confidenceDistribution.map((x) => [x.label, x.count]));
    expect(b["90–100"]).toBe(1);
    expect(b["70–79"]).toBe(1);
    expect(b["0–59"]).toBe(1);
    expect(out.providerDistribution).toEqual([
      { provider: "kimi", count: 2 },
      { provider: "mock", count: 1 },
    ]);
  });

  it("returns safe nulls/zeros for an empty collection", () => {
    const out = buildAiAnalytics([], ref);
    expect(out.totals.total).toBe(0);
    expect(out.totals.averageConfidence).toBeNull();
    expect(out.totals.successRate).toBeNull();
    expect(out.totals.manualCorrectionRate).toBeNull();
    expect(out.lowConfidenceTrend).toHaveLength(12);
  });
});

describe("buildAiAnalytics adoption", () => {
  const REF = new Date("2026-06-19T00:00:00Z");
  function aiRow(over: Partial<AiAnalysisRow> = {}): AiAnalysisRow {
    return {
      status: "COMPLETED",
      confidenceScore: 90,
      provider: "kimi",
      createdAt: "2026-06-10T00:00:00Z",
      confirmed: true,
      corrected: false,
      documentCount: 1,
      ...over,
    };
  }

  it("counts multi-document analyses and the creation-method split", () => {
    const rows = [aiRow({ documentCount: 3 }), aiRow({ documentCount: 1 })];
    const r = buildAiAnalytics(rows, REF, 12, ["AI", "MANUAL", undefined]);
    expect(r.adoption.multiDocExpenses).toBe(1);
    expect(r.adoption.aiCreated).toBe(1);
    expect(r.adoption.manualCreated).toBe(1);
    expect(r.adoption.unknownCreated).toBe(1);
    // AI / (AI + MANUAL), unknown excluded from the denominator
    expect(r.adoption.aiCreatedPct).toBeCloseTo(50);
    expect(r.adoption.multiDocPct).toBeCloseTo(50);
  });

  it("returns null pct for empty inputs", () => {
    const r = buildAiAnalytics([], REF, 12, []);
    expect(r.adoption.aiCreatedPct).toBeNull();
    expect(r.adoption.multiDocPct).toBeNull();
    expect(r.adoption.multiDocExpenses).toBe(0);
  });

  it("treats rows without documentCount as single-document", () => {
    const legacy: AiAnalysisRow = {
      status: "COMPLETED",
      createdAt: "2026-06-10T00:00:00Z",
      confirmed: false,
      corrected: false,
    };
    const r = buildAiAnalytics([legacy], REF, 12, ["AI"]);
    expect(r.adoption.multiDocExpenses).toBe(0);
  });
});

describe("tallyByStatus", () => {
  const REPORTED = ["SUBMITTED", "PENDING_REVIEW", "APPROVED", "REJECTED"] as const;

  it("tallies count + amount per reported status and excludes DRAFT", () => {
    const out = tallyByStatus(
      [
        { approvalStatus: "APPROVED", amount: 100 },
        { approvalStatus: "APPROVED", amount: 50 },
        { approvalStatus: "REJECTED", amount: 20 },
        { approvalStatus: "DRAFT", amount: 999 },
        { approvalStatus: "APPROVED" }, // missing amount → 0
      ],
      REPORTED,
    );
    expect(out.APPROVED).toEqual({ count: 3, amount: 150 });
    expect(out.REJECTED).toEqual({ count: 1, amount: 20 });
    expect(out.DRAFT).toBeUndefined();
  });

  it("returns an empty object for no rows", () => {
    expect(tallyByStatus([], REPORTED)).toEqual({});
  });
});
