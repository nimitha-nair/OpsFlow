import rateLimit from "express-rate-limit";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Limiter for authentication endpoints.
 *
 * Production: 10 attempts / IP / 15 min — slows brute-force / credential
 * stuffing. Development: effectively unlimited (1000) so normal testing with a
 * few wrong passwords does not lock the developer out. Override the dev cap with
 * AUTH_RATE_LIMIT if needed.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isProduction
    ? 10
    : Number(process.env.AUTH_RATE_LIMIT ?? 1000),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again later." },
});

/**
 * Broad limiter applied to the whole API as a baseline DoS guard.
 * Higher in development to avoid throttling local work.
 */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isProduction ? 300 : 5000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});
