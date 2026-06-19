import { z } from "zod";

/**
 * GET /reports/overview takes no parameters today. A strict empty object keeps
 * the contract explicit and gives later range filters (from/to/months) a home
 * without changing the route wiring.
 */
export const overviewQuery = z.object({}).strip();

export type OverviewQuery = z.infer<typeof overviewQuery>;

/**
 * GET /reports/expenses?months=N. Coerces to an int (defaulting to 12 for
 * missing/invalid input); the service clamps the final value to 1–24.
 */
export const expensesQuery = z
  .object({ months: z.coerce.number().int().catch(12) })
  .strip();

export type ExpensesQuery = z.infer<typeof expensesQuery>;

/** GET /reports/projects — no parameters today. */
export const projectsQuery = z.object({}).strip();

/** GET /reports/ai?months=N — trailing window for the low-confidence trend. */
export const aiQuery = z
  .object({ months: z.coerce.number().int().catch(12) })
  .strip();

export type AiQuery = z.infer<typeof aiQuery>;
