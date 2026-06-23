import { Router } from "express";

import { login } from "../controllers/auth.controller";
import { authRateLimiter } from "../middleware/rate-limit";
import { validate } from "../middleware/validate";
import { loginBody } from "../validation/auth.schema";

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

export default router;
