import { z } from "zod";

/** GET /search?q= */
export const searchQuery = z.object({
  q: z.string().trim().max(100).optional(),
});
