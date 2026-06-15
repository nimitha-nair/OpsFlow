import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(__dirname, "../.env") });

import { ensureDefaultAdmin } from "../services/auth.service";

async function main(): Promise<void> {
  const { created, email } = await ensureDefaultAdmin();
  if (created) {
    console.log(`✓ Default admin created: ${email}`);
  } else {
    console.log(`• Default admin already exists: ${email}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Admin seed failed:", err);
  process.exit(1);
});
