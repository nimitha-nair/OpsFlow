import { z } from "zod";

/** POST /auth/login */
export const loginBody = z
  .object({
    email: z.string().trim().min(1).email(),
    password: z.string().min(1),
  })
  .strict();

export type LoginInput = z.infer<typeof loginBody>;
