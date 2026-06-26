import { z } from "zod";

/** POST /help/ask — a single natural-language question about the user manual. */
export const askHelpBody = z
  .object({
    question: z
      .string()
      .trim()
      .min(3, "question is too short")
      .max(500, "question is too long"),
  })
  .strict();

export type AskHelpInput = z.infer<typeof askHelpBody>;
