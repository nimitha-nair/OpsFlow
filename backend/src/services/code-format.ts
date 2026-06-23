/**
 * Pure (Firestore-free) helpers for human-readable entity codes, so they can be
 * unit-tested without initializing Firebase. The stateful allocator lives in
 * code-generator.ts.
 */

export type CodeEntity = "expense" | "project" | "task" | "ticket";

export const CODE_PREFIX: Record<CodeEntity, string> = {
  expense: "EXP",
  project: "PRJ",
  task: "TSK",
  ticket: "TKT",
};

const PAD: Record<CodeEntity, number> = {
  expense: 4,
  project: 3,
  task: 3,
  ticket: 4,
};

/** Format a sequence number as the entity's display code (e.g. EXP-0001). */
export function formatCode(entity: CodeEntity, n: number): string {
  return `${CODE_PREFIX[entity]}-${String(n).padStart(PAD[entity], "0")}`;
}

/** Parse a display code back to its entity + number, or null if malformed. */
export function parseCode(code: string): { entity: CodeEntity; n: number } | null {
  const m = /^([A-Z]{3})-(\d+)$/.exec(code.trim().toUpperCase());
  if (!m) return null;
  const entity = (Object.keys(CODE_PREFIX) as CodeEntity[]).find(
    (e) => CODE_PREFIX[e] === m[1],
  );
  if (!entity) return null;
  return { entity, n: Number(m[2]) };
}
