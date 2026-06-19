import { z } from "zod";

import {
  dateString,
  firestoreId,
  limitQuery,
  pageQuery,
} from "./common";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_SCOPES,
  EXPENSE_TYPES,
  REIMBURSEMENT_STATUSES,
} from "../types/expense.types";

const categorySchema = z.enum(EXPENSE_CATEGORIES);
const typeSchema = z.enum(EXPENSE_TYPES);
const scopeSchema = z.enum(EXPENSE_SCOPES);

/**
 * POST /expenses (EMPLOYEE)
 *
 * AI-first flow: amount/category/expenseDate/description are optional at creation
 * — they are extracted by AI and confirmed in the verification step (which writes
 * them back). `type` defaults to DOCUMENT. The manual fallback still sends all
 * fields. A submit-time gate (see `assertSubmittable`) enforces completeness
 * before the expense leaves DRAFT/REJECTED.
 */
export const createExpenseBody = z
  .object({
    scope: scopeSchema,
    projectId: firestoreId.optional(),
    type: typeSchema.default("DOCUMENT"),
    category: categorySchema.optional(),
    amount: z.number().finite().positive().optional(),
    currency: z.string().trim().min(1).max(8).default("INR"),
    description: z.string().trim().max(2000).optional(),
    expenseDate: dateString.optional(),
    /** Save as a draft instead of submitting for review. */
    isDraft: z.boolean().optional().default(false),
  })
  .strict();
// Note: projectId is NOT required for PROJECT scope at creation. AI-first drafts
// defer project allocation to the verify step; the submit gate (submitExpense)
// enforces a project before a PROJECT expense leaves DRAFT.

/** PATCH /expenses/:id (EMPLOYEE — edit own DRAFT) */
export const updateExpenseBody = z
  .object({
    scope: scopeSchema.optional(),
    projectId: firestoreId.optional(),
    type: typeSchema.optional(),
    category: categorySchema.optional(),
    amount: z.number().finite().positive().optional(),
    currency: z.string().trim().min(1).max(8).optional(),
    description: z.string().trim().min(1).max(2000).optional(),
    expenseDate: dateString.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: "Provide at least one field to update",
  })
  .refine(
    (v) => v.scope !== "PROJECT" || (!!v.projectId && v.projectId.length > 0),
    { message: "projectId is required for PROJECT expenses", path: ["projectId"] },
  );

/** PATCH /expenses/:id/approve — remarks optional. */
export const approveExpenseBody = z
  .object({
    remarks: z
      .string()
      .trim()
      .max(1000)
      .optional()
      .transform((v) => (v && v.length > 0 ? v : "")),
  })
  .strict();

/** PATCH /expenses/:id/reject — remarks required (reason). */
export const rejectExpenseBody = z
  .object({
    remarks: z.string().trim().min(1, "A reason is required").max(1000),
  })
  .strict();

/** PATCH /expenses/:id/reimbursement (ADMIN) */
export const reimbursementBody = z
  .object({ reimbursementStatus: z.enum(REIMBURSEMENT_STATUSES) })
  .strict();

/** GET /expenses/review (HR/ADMIN) — lifecycle list, filterable by status. */
export const reviewExpensesQuery = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "ALL"]).optional(),
});

/** GET /expenses (ADMIN) — approved expenses, filterable. */
export const listExpensesQuery = z.object({
  page: pageQuery,
  limit: limitQuery,
  projectId: firestoreId.optional(),
  category: categorySchema.optional(),
});

/** Params for /expenses/project/:projectId */
export const expenseProjectParams = z.object({ projectId: firestoreId });

/** Params for /expenses/:id/documents/:docId */
export const expenseDocParams = z.object({ id: firestoreId, docId: firestoreId });
