import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(__dirname, "../.env") });

import app from "./app";
import { ensureDefaultAdmin } from "./services/auth.service";

const port = Number(process.env.PORT ?? 5000);

async function start(): Promise<void> {
  // Default-admin seeding is a one-time convenience, not essential to serve
  // requests. Run it best-effort: a transient Firestore error (e.g. quota
  // exhausted) must NOT take the whole backend down. Skip entirely with
  // SKIP_ADMIN_SEED=1 once the admin exists, to avoid a read on every boot.
  if (process.env.SKIP_ADMIN_SEED !== "1") {
    try {
      const { created, email } = await ensureDefaultAdmin();
      if (created) {
        console.log(`✓ Default admin created: ${email}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `⚠ Skipping default-admin check (database unavailable): ${message}`,
      );
    }
  }

  // Always start listening — the server stays up and recovers once Firestore is
  // reachable again, instead of crashing on a transient database error.
  app.listen(port, () => {
    console.log(`OpsFlow backend listening on port ${port}`);
  });
}

void start().catch((err) => {
  // Only a non-recoverable error (e.g. failed to bind the port) reaches here.
  console.error("Backend failed to start:", err);
  process.exit(1);
});
