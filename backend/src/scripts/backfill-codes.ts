import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(__dirname, "../.env") });

import { backfillEntityCodes } from "../services/code-generator";

/**
 * One-time backfill that assigns human-readable codes (EXP/PRJ/TSK) to existing
 * documents. Idempotent — safe to re-run. Usage: `npm run backfill:codes`.
 */
async function main(): Promise<void> {
  const assigned = await backfillEntityCodes();
  console.log("✓ Code backfill complete:");
  console.log(`  projects: ${assigned.project} assigned`);
  console.log(`  tasks:    ${assigned.task} assigned`);
  console.log(`  expenses: ${assigned.expense} assigned`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Code backfill failed:", err);
  process.exit(1);
});
