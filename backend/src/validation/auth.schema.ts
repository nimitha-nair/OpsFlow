import { z } from "zod";

/** POST /auth/login */
export const loginBody = z
  .object({
    email: z.string().trim().min(1).email(),
    password: z.string().min(1),
  })
  .strict();

export type LoginInput = z.infer<typeof loginBody>;

/** POST /auth/qr/exchange — swap a scanned QR token for a session. */
export const qrExchangeBody = z
  .object({
    token: z.string().trim().min(10).max(256),
  })
  .strict();

export type QrExchangeInput = z.infer<typeof qrExchangeBody>;
