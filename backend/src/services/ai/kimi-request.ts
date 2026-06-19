/**
 * Pure builder for the Kimi (NVIDIA Build) chat request. Kept separate from the
 * HTTP call so the message/prompt shape can be unit-tested and never drifts
 * between the production extractor and the CLI verification harness.
 */

export const SYSTEM_PROMPT =
  "You are an expense-receipt extraction engine. You may receive MULTIPLE images " +
  "or pages for a SINGLE expense (a multi-page invoice, or a receipt plus a " +
  "supporting document). Reconcile them into ONE result. Return ONLY a strict JSON " +
  "object — no prose, no markdown fences. Use this exact shape, with null for any " +
  "field you cannot read:\n" +
  `{"vendorName": string|null, "amount": number|null, "transactionDate": "YYYY-MM-DD"|null, ` +
  `"currency": string|null, "paymentMethod": string|null, "category": string|null, ` +
  `"taxInformation": string|null, "lowConfidenceReason": string|null, "confidenceScore": number}\n` +
  "amount is the single grand total across all pages, numeric with no currency " +
  "symbol. confidenceScore is an integer 0-100 reflecting overall extraction " +
  "certainty. When confidenceScore is below 70, set lowConfidenceReason to a brief " +
  "explanation of what made the documents hard to read (e.g. blur, glare, " +
  "cropping); otherwise set it to null.";

export interface ChatMessage {
  role: "system" | "user";
  content: string | Array<Record<string, unknown>>;
}

/** Build the chat messages for a multi-image extraction request. */
export function buildKimiMessages(dataUris: string[]): ChatMessage[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "Extract the expense data from these document image(s).",
        },
        ...dataUris.map((url) => ({ type: "image_url", image_url: { url } })),
      ],
    },
  ];
}
