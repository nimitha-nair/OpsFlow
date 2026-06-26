import { z } from "zod";

import { dateRangeQuery } from "./common";

/** The date field that date-range filtering is applied to. */
export const basisSchema = z
  .enum(["expenseDate", "submittedAt"])
  .optional();

/**
 * Optional currency to scope analytics to (group-by-currency reporting). When
 * omitted or not present in range, the service falls back to the dominant
 * currency. Normalized to an uppercase code on the service layer.
 */
export const currencySchema = z
  .string()
  .trim()
  .min(1)
  .max(8)
  .optional();

/**
 * GET /reports/overview?from&to&basis — optional inclusive ISO date window.
 * `basis` selects which date field (expenseDate | submittedAt) is windowed.
 * Defaults to expenseDate on the service layer.
 */
export const overviewQuery = z
  .object({ basis: basisSchema, currency: currencySchema })
  .merge(dateRangeQuery)
  .strip();

export type OverviewQuery = z.infer<typeof overviewQuery>;

/**
 * GET /reports/expenses?from&to&basis — optional inclusive ISO date window.
 * The monthly-trend month count is derived from the window internally; there is
 * no `months` param anymore.
 */
export const expensesQuery = z
  .object({ basis: basisSchema, currency: currencySchema })
  .merge(dateRangeQuery)
  .strip();

export type ExpensesQuery = z.infer<typeof expensesQuery>;

/** GET /reports/projects?from&to&basis — optional inclusive ISO date window. */
export const projectsQuery = z
  .object({ basis: basisSchema, currency: currencySchema })
  .merge(dateRangeQuery)
  .strip();

export type ProjectsQuery = z.infer<typeof projectsQuery>;

/** GET /reports/ai?from&to — optional inclusive ISO date window. */
export const aiQuery = dateRangeQuery.strip();

export type AiQuery = z.infer<typeof aiQuery>;
