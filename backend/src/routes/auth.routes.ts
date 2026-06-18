import { Router } from "express";

import { login } from "../controllers/auth.controller";
import { authRateLimiter } from "../middleware/rate-limit";
import { validate } from "../middleware/validate";
import { loginBody } from "../validation/auth.schema";

const router = Router();

router.post(
  "/login",
  authRateLimiter,
  validate({ body: loginBody }),
  login,
);

export default router;
