import { z } from "zod";

/** GET /activity?limit= — lenient: invalid/missing falls back to 40. */
export const listActivityQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).catch(40),
});
