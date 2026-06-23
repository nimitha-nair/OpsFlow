import express from "express";
import type { ErrorRequestHandler } from "express";
import helmet from "helmet";

import activityRoutes from "./routes/activity.routes";
import authRoutes from "./routes/auth.routes";
import exampleRoutes from "./routes/example.routes";
import expenseRoutes from "./routes/expense.routes";
import notificationRoutes from "./routes/notification.routes";
import projectRoutes from "./routes/project.routes";
import reportsRoutes from "./routes/reports.routes";
import searchRoutes from "./routes/search.routes";
import taskRoutes from "./routes/task.routes";
import ticketRoutes from "./routes/ticket.routes";
import userRoutes from "./routes/user.routes";
import { authenticate } from "./middleware/auth.middleware";
import { apiRateLimiter } from "./middleware/rate-limit";
import { cors } from "./middleware/cors";

const app = express();

// Trust the reverse proxy in front of us (Cloudflare Tunnel / cloudflared) so
// `req.ip` and rate limiting use the real client IP from X-Forwarded-For rather
// than the tunnel's loopback address. Configurable: TRUST_PROXY may be a hop
// count (e.g. "1"), "true"/"false", or an express trust-proxy string. Defaults to
// 1 in production (one proxy hop = cloudflared) and off in development.
const trustProxyEnv = process.env.TRUST_PROXY;
const trustProxy =
  trustProxyEnv === undefined
    ? process.env.NODE_ENV === "production"
      ? 1
      : false
    : trustProxyEnv === "true"
      ? 1
      : trustProxyEnv === "false"
        ? false
        : /^\d+$/.test(trustProxyEnv)
          ? Number(trustProxyEnv)
          : trustProxyEnv;
app.set("trust proxy", trustProxy);

// Hide the stack and apply security headers. CORP is relaxed to cross-origin so
// the Cloudflare Pages frontend (a different origin) can fetch API resources.
app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

// CORS first: answers preflight and sets headers before auth/rate-limit/routes.
app.use(cors);

// Health check (before the rate limiter so uptime/tunnel probes never throttle).
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Baseline rate limit across the whole API.
app.use(apiRateLimiter);

// Parse JSON with a strict size cap to limit payload-based abuse.
app.use(express.json({ limit: "100kb" }));

app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.use("/projects", projectRoutes);
app.use("/tasks", taskRoutes);
app.use("/expenses", expenseRoutes);
app.use("/reports", reportsRoutes);
app.use("/search", searchRoutes);
app.use("/notifications", notificationRoutes);
app.use("/tickets", ticketRoutes);
app.use("/activity", activityRoutes);
app.use("/example", exampleRoutes);

app.get("/test-protected", authenticate, (req, res) => {
  res.json({
    success: true,
    user: req.user,
  });
});

// Consistent error responses for body-parser and unexpected failures.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const e = err as { type?: string; status?: number; statusCode?: number };
  if (e?.type === "entity.parse.failed" || err instanceof SyntaxError) {
    res.status(400).json({ error: "Malformed JSON in request body" });
    return;
  }
  if (e?.type === "entity.too.large" || e?.status === 413) {
    res.status(413).json({ error: "Request body too large" });
    return;
  }
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
};
app.use(errorHandler);

export default app;
