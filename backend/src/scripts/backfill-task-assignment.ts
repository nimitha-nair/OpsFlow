import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(__dirname, "../.env") });

import { db } from "../config/firebase";

const TASKS_COLLECTION = "tasks";

/**
 * One-time backfill: migrate legacy tasks from a single `assigneeId` string to
 * the structured `assignment` shape. For each task that still has `assigneeId`
 * and no `assignment`, write
 * `assignment = { type: "INDIVIDUAL", userIds: [assigneeId] }`.
 *
 * Idempotent — tasks that already carry `assignment` are skipped, so re-running
 * is safe. (The legacy `assigneeId` field is left in place; it is harmless and
 * no longer read.) Usage: `npm run backfill:task-assignment`.
 */
async function main(): Promise<void> {
  const snap = await db.collection(TASKS_COLLECTION).get();

  let filled = 0;
  let skipped = 0;
  for (const doc of snap.docs) {
    const data = doc.data() as {
      assigneeId?: unknown;
      assignment?: unknown;
    };
    if (data.assignment || typeof data.assigneeId !== "string" || !data.assigneeId) {
      skipped += 1;
      continue;
    }
    await doc.ref.update({
      assignment: { type: "INDIVIDUAL", userIds: [data.assigneeId] },
    });
    filled += 1;
  }

  console.log("✓ task assignment backfill complete:");
  console.log(`  filled:  ${filled}`);
  console.log(`  skipped: ${skipped} (already migrated or missing assigneeId)`);
  process.exit(0);
}

main().catch((err) => {
  console.error("task assignment backfill failed:", err);
  process.exit(1);
});
