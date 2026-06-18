import express from "express";
import type { ErrorRequestHandler } from "express";
import helmet from "helmet";

import authRoutes from "./routes/auth.routes";
import exampleRoutes from "./routes/example.routes";
import expenseRoutes from "./routes/expense.routes";
import projectRoutes from "./routes/project.routes";
import taskRoutes from "./routes/task.routes";
import userRoutes from "./routes/user.routes";
import { authenticate } from "./middleware/auth.middleware";
import { apiRateLimiter } from "./middleware/rate-limit";

const app = express();

// Security headers (CSP, HSTS, no-sniff, frameguard, etc.) and hide the stack.
app.disable("x-powered-by");
app.use(helmet());

// Baseline rate limit across the whole API.
app.use(apiRateLimiter);

// Parse JSON with a strict size cap to limit payload-based abuse.
app.use(express.json({ limit: "100kb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.use("/projects", projectRoutes);
app.use("/tasks", taskRoutes);
app.use("/expenses", expenseRoutes);
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
