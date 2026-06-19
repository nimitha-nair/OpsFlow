import { z } from "zod";

import { dateString } from "./common";

/** PATCH /expenses/:id/analysis — employee edits + optional confirm. */
export const updateAnalysisBody = z
  .object({
    vendorName: z.string().trim().max(200).optional(),
    amount: z.number().finite().positive().optional(),
    transactionDate: dateString.optional(),
    currency: z.string().trim().min(1).max(8).optional(),
    paymentMethod: z.string().trim().max(50).optional(),
    category: z.string().trim().max(50).optional(),
    taxInformation: z.string().trim().max(200).optional(),
    /** Verified description; written back to the expense on confirm. */
    description: z.string().trim().max(2000).optional(),
    confirm: z.boolean().optional().default(false),
  })
  .strict();
