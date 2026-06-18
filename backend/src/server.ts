import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(__dirname, "../.env") });

import app from "./app";
import { ensureDefaultAdmin } from "./services/auth.service";

const port = Number(process.env.PORT ?? 5000);

async function start(): Promise<void> {
  try {
    const { created, email } = await ensureDefaultAdmin();
    if (created) {
      console.log(`✓ Default admin created: ${email}`);
    }

    app.listen(port, () => {
      console.log(`OpsFlow backend listening on port ${port}`);
    });
  } catch (err) {
    console.error("Backend startup failed:", err);
    process.exit(1);
  }
}

void start();
