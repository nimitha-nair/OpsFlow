import { Router } from "express";

import { login, qrExchange, qrStart } from "../controllers/auth.controller";
import { authenticate } from "../middleware/auth.middleware";
import { authRateLimiter } from "../middleware/rate-limit";
import { validate } from "../middleware/validate";
import { loginBody, qrExchangeBody } from "../validation/auth.schema";

const router = Router();

// TEMP DEBUG (login trace) — remove after diagnosis. Proves a request reached
// the backend auth router (vs. being swallowed by the Cloudflare Pages layer).
router.use((req, _res, next) => {
  console.log("[auth-route-debug] reached backend", {
    method: req.method,
    path: req.path,
    origin: req.headers.origin,
    via: req.headers["x-forwarded-host"] ?? req.headers.host,
  });
  next();
});

router.post(
  "/login",
  authRateLimiter,
  validate({ body: loginBody }),
  login,
);

// Authenticated device mints a short-lived QR token for cross-device login.
router.post("/qr/start", authenticate, qrStart);

// The scanning device swaps the token for a real session (rate-limited, public).
router.post(
  "/qr/exchange",
  authRateLimiter,
  validate({ body: qrExchangeBody }),
  qrExchange,
);

export default router;
