/**
 * Pure, unit-testable building blocks for the grounded Help Q&A.
 *
 * Kept separate from the HTTP call (see `help-answer.ts`) so the prompt shape and
 * the keyword-retrieval fallback can be tested in isolation and never drift —
 * mirrors how `kimi-request.ts` is split from `kimi-extractor.ts`.
 */

import {
  getManualForRole,
  type ManualRole,
  type ManualSection,
} from "./manual-content";

/** Shape returned to the client by every code path (real model or fallback). */
export interface HelpAnswer {
  answer: string;
  /** Section titles the answer was drawn from. */
  sources: string[];
}

/**
 * System prompt: hard-constrains the model to the supplied manual only. It must
 * not invent OpsFlow features, must cite the section titles it used, and must
 * say plainly when the manual does not cover something.
 */
export const HELP_SYSTEM_PROMPT =
  "You are the OpsFlow User Manual assistant. Answer the user's question USING ONLY " +
  "the manual sections provided below. These sections are already scoped to the " +
  "user's role — treat them as the complete set of features this user can see. " +
  "Rules:\n" +
  "1. Do NOT invent, assume, or describe any OpsFlow feature, page, button, or " +
  "behaviour that is not stated in the provided manual. No outside knowledge.\n" +
  "2. If the manual does not cover the question, say so explicitly (e.g. \"The user " +
  "manual doesn't cover that.\") and, if helpful, point to the closest topic it does " +
  "cover. Never guess.\n" +
  "3. Be concise and practical — prefer the steps/tips already in the manual.\n" +
  "4. End your answer with a line \"Sources: <comma-separated section titles you " +
  "used>\". If you used none because the manual doesn't cover it, write \"Sources: \".";

/** Render a role's manual sections as plain text for the prompt body. */
export function renderManualText(sections: ManualSection[]): string {
  return sections
    .map(
      (s) =>
        `## ${s.title}\n` + s.points.map((p) => `- ${p}`).join("\n"),
    )
    .join("\n\n");
}

export interface HelpChatMessage {
  role: "system" | "user";
  content: string;
}

/**
 * Build the grounded chat messages for a role + question. Pure: assembles the
 * role-scoped manual into the prompt — admin-only sections are absent for an
 * employee because `getManualForRole` never returns them.
 */
export function buildHelpMessages(
  role: ManualRole,
  question: string,
): HelpChatMessage[] {
  const manual = renderManualText(getManualForRole(role));
  return [
    { role: "system", content: HELP_SYSTEM_PROMPT },
    {
      role: "user",
      content:
        `Manual sections available to this user:\n\n${manual}\n\n` +
        `Question: ${question.trim()}`,
    },
  ];
}

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "is", "are",
  "do", "does", "how", "can", "i", "my", "me", "what", "where", "when", "with",
  "you", "your", "it", "this", "that", "from", "by", "be", "as", "at", "we",
]);

/** Split text into lowercase, de-noised content tokens for keyword overlap. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Deterministic, no-network fallback used when the AI provider is not "kimi" or
 * no API key is configured. Scores each role-scoped section by keyword overlap
 * with the question and returns the best section's points as the answer. When
 * nothing meaningfully overlaps, it returns a "not covered" answer with no
 * sources — preserving the grounded contract even without a model.
 */
export function retrieveMockAnswer(
  role: ManualRole,
  question: string,
): HelpAnswer {
  const qTokens = new Set(tokenize(question));
  const sections = getManualForRole(role);

  let best: { section: ManualSection; score: number } | null = null;
  for (const section of sections) {
    const haystack = tokenize(`${section.title} ${section.points.join(" ")}`);
    let score = 0;
    for (const token of haystack) if (qTokens.has(token)) score += 1;
    if (best === null || score > best.score) best = { section, score };
  }

  if (!best || best.score === 0) {
    return {
      answer:
        "The user manual doesn't cover that. Try rephrasing, or browse the " +
        "guide cards below for the topics it does cover.",
      sources: [],
    };
  }

  const { section } = best;
  const answer =
    `Here's what the manual says about “${section.title}”:\n` +
    section.points.map((p) => `• ${p}`).join("\n");
  return { answer, sources: [section.title] };
}
