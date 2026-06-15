import express from "express";

import authRoutes from "./routes/auth.routes";

const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/auth", authRoutes);

import { authenticate } from "./middleware/auth.middleware";

app.get("/test-protected", authenticate, (req, res) => {
  res.json({
    success: true,
    user: req.user,
  });
});

export default app;
