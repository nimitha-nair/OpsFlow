export interface MentionMember {
  id: string;
  name: string;
}

/** Resolve @mentions in a comment body to member ids (matches full names). */
export function extractMentionIds(body: string, members: MentionMember[]): string[] {
  const ids = new Set<string>();
  for (const m of members) {
    if (m.name && body.includes(`@${m.name}`)) ids.add(m.id);
  }
  return [...ids];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Split a body into segments, marking @mention tokens. Known member names match
 * first (so multi-word names highlight); any other `@token` is highlighted too.
 */
export function splitMentions(
  body: string,
  names: string[],
): { text: string; mention: boolean }[] {
  const escaped = names
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp);
  const namePart = escaped.length ? `@(?:${escaped.join("|")})` : "";
  const generic = "@[A-Za-z0-9_.]+";
  const pattern = namePart ? `(${namePart}|${generic})` : `(${generic})`;
  const re = new RegExp(pattern, "g");
  return body
    .split(re)
    .filter((p) => p !== "")
    .map((p) => ({ text: p, mention: p.startsWith("@") }));
}
