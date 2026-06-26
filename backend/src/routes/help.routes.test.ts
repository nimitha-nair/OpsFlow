import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import helpRoutes from "./help.routes";

// Mount only the help router on a throwaway app so the route's auth/validation
// chain is exercised end-to-end without booting the whole backend (no supertest
// dependency in this repo).
const app = express();
app.use(express.json());
app.use("/help", helpRoutes);

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("POST /help/ask", () => {
  it("returns 401 when unauthenticated (no Authorization header)", async () => {
    const res = await fetch(`${baseUrl}/help/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "How do I submit an expense?" }),
    });
    expect(res.status).toBe(401);
  });
});
