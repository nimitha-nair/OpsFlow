import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(__dirname, "../.env") });

import { db } from "../config/firebase";

const EXPENSES_COLLECTION = "expenses";

/**
 * One-time backfill: stamp `reimbursedAt` on already-PAID expenses that predate
 * the paid-date field, using `updatedAt` (set when the reimbursement was marked
 * PAID) as the best available proxy. This lets the reimbursements date filter
 * surface historically-paid items. Idempotent — only fills rows missing
 * `reimbursedAt`. Usage: `npm run backfill:reimbursed-at`.
 */
async function main(): Promise<void> {
  const snap = await db
    .collection(EXPENSES_COLLECTION)
    .where("reimbursementStatus", "==", "PAID")
    .get();

  let filled = 0;
  let skipped = 0;
  for (const doc of snap.docs) {
    const data = doc.data() as { reimbursedAt?: unknown; updatedAt?: unknown };
    if (data.reimbursedAt || !data.updatedAt) {
      skipped += 1;
      continue;
    }
    await doc.ref.update({ reimbursedAt: data.updatedAt });
    filled += 1;
  }

  console.log("✓ reimbursedAt backfill complete:");
  console.log(`  filled:  ${filled}`);
  console.log(`  skipped: ${skipped} (already set or missing updatedAt)`);
  process.exit(0);
}

main().catch((err) => {
  console.error("reimbursedAt backfill failed:", err);
  process.exit(1);
});
