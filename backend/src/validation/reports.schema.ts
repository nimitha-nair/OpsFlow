import { z } from "zod";

import { dateRangeQuery } from "./common";

/**
 * GET /reports/overview?from&to — optional inclusive ISO date window. The
 * service filters expenses by `expenseDate` in memory (no composite index).
 */
export const overviewQuery = z.object({}).merge(dateRangeQuery).strip();

export type OverviewQuery = z.infer<typeof overviewQuery>;

/**
 * GET /reports/expenses?from&to — optional inclusive ISO date window. The
 * monthly-trend month count is derived from the window internally; there is no
 * `months` param anymore.
 */
export const expensesQuery = dateRangeQuery.strip();

export type ExpensesQuery = z.infer<typeof expensesQuery>;

/** GET /reports/projects?from&to — optional inclusive ISO date window. */
export const projectsQuery = z.object({}).merge(dateRangeQuery).strip();

export type ProjectsQuery = z.infer<typeof projectsQuery>;

/** GET /reports/ai?from&to — optional inclusive ISO date window. */
export const aiQuery = dateRangeQuery.strip();

export type AiQuery = z.infer<typeof aiQuery>;
