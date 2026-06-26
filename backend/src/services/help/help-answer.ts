/**
 * Grounded Help Q&A — provider switch + HTTP call.
 *
 * Picks the real model (NVIDIA Build / Kimi) when AI_PROVIDER === "kimi" and a
 * key is set; otherwise falls back to the deterministic keyword retrieval in
 * `help-qa.ts` so dev/tests work without a key. Mirrors the provider-switch in
 * `expense-extractor.ts` and the fetch shape in `kimi-extractor.ts`.
 */

import { getAiConfig } from "../../config/ai";
import { getManualForRole, type ManualRole } from "./manual-content";
import {
  buildHelpMessages,
  retrieveMockAnswer,
  type HelpAnswer,
} from "./help-qa";

/** Pull the "Sources: a, b" line out of the model text. */
function parseSources(content: string, role: ManualRole): string[] {
  const match = content.match(/sources:\s*(.*)\s*$/im);
  if (!match || !match[1]) return [];
  const titles = match[1]
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  // Keep only titles that are real sections for this role — never surface a
  // section the model invented or one outside the user's role scope.
  const allowed = new Set(getManualForRole(role).map((s) => s.title.toLowerCase()));
  const real = getManualForRole(role);
  const out: string[] = [];
  for (const t of titles) {
    if (allowed.has(t.toLowerCase())) {
      const canonical = real.find((s) => s.title.toLowerCase() === t.toLowerCase());
      if (canonical && !out.includes(canonical.title)) out.push(canonical.title);
    }
  }
  return out;
}

/** Strip the trailing "Sources:" line from the displayed answer. */
function stripSourcesLine(content: string): string {
  return content.replace(/\n?\s*sources:\s*.*\s*$/im, "").trim();
}

/**
 * Answer a manual question for a role. Returns the grounded answer plus the
 * section titles it drew from. Never throws on a model/network failure — it
 * degrades to the deterministic retrieval fallback.
 */
export async function answerHelpQuestion(
  role: ManualRole,
  question: string,
): Promise<HelpAnswer> {
  const cfg = getAiConfig();

  if (cfg.provider !== "kimi" || !cfg.nvidiaApiKey) {
    return retrieveMockAnswer(role, question);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.nvidiaTimeoutMs);
  try {
    const res = await fetch(`${cfg.nvidiaBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${cfg.nvidiaApiKey}`,
      },
      body: JSON.stringify({
        model: cfg.nvidiaModel,
        messages: buildHelpMessages(role, question),
        temperature: 0,
        max_tokens: 700,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      // Any non-OK status degrades to the grounded fallback rather than erroring.
      return retrieveMockAnswer(role, question);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return retrieveMockAnswer(role, question);

    const sources = parseSources(content, role);
    const answer = stripSourcesLine(content) || content.trim();
    return { answer, sources };
  } catch {
    // Network failure / timeout (AbortError) — degrade gracefully.
    return retrieveMockAnswer(role, question);
  } finally {
    clearTimeout(timer);
  }
}
