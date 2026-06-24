import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(__dirname, "../.env") });

import { db } from "../config/firebase";

const EXPENSES_COLLECTION = "expenses";

/**
 * One-time backfill: stamp `submittedAt` on existing non-DRAFT expenses that
 * predate the field, using `createdAt` as the closest proxy for submission
 * time. Lets admin queues (which window by submittedAt) surface historical
 * expenses. Idempotent — only fills rows missing `submittedAt`. Drafts are
 * skipped (they were never submitted). Usage: `npm run backfill:submitted-at`.
 */
async function main(): Promise<void> {
  const snap = await db.collection(EXPENSES_COLLECTION).get();

  let filled = 0;
  let skipped = 0;
  for (const doc of snap.docs) {
    const data = doc.data() as {
      approvalStatus?: string;
      submittedAt?: unknown;
      createdAt?: unknown;
    };
    if (data.approvalStatus === "DRAFT" || data.submittedAt || !data.createdAt) {
      skipped += 1;
      continue;
    }
    await doc.ref.update({ submittedAt: data.createdAt });
    filled += 1;
  }

  console.log("✓ submittedAt backfill complete:");
  console.log(`  filled:  ${filled}`);
  console.log(`  skipped: ${skipped} (draft, already set, or missing createdAt)`);
  process.exit(0);
}

main().catch((err) => {
  console.error("submittedAt backfill failed:", err);
  process.exit(1);
});
