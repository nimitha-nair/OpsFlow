import { getAiConfig } from "../../config/ai";
import type { ExpenseExtractor } from "./expense-extractor";
import { toKimiImageDataUri } from "./document-image";
import {
  parseModelJson,
  type ExtractionInput,
  type ExtractionResult,
} from "./extraction";

const SYSTEM_PROMPT =
  "You are an expense-receipt extraction engine. Read the receipt/invoice image " +
  "and return ONLY a strict JSON object — no prose, no markdown fences. Use this " +
  "exact shape, with null for any field you cannot read:\n" +
  `{"vendorName": string|null, "amount": number|null, "transactionDate": "YYYY-MM-DD"|null, ` +
  `"currency": string|null, "paymentMethod": string|null, "category": string|null, ` +
  `"taxInformation": string|null, "confidenceScore": number}\n` +
  "amount is the numeric total with no currency symbol. confidenceScore is an " +
  "integer 0-100 reflecting overall extraction certainty.";

/** Real extractor: NVIDIA Build / Kimi-K2.6 Vision. */
export const kimiExtractor: ExpenseExtractor = {
  async extract(input: ExtractionInput): Promise<ExtractionResult> {
    const cfg = getAiConfig();
    if (!cfg.nvidiaApiKey) {
      throw new Error("NVIDIA_API_KEY is not configured");
    }

    const dataUri = await toKimiImageDataUri(input.documentId);

    const res = await fetch(`${cfg.nvidiaBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${cfg.nvidiaApiKey}`,
      },
      body: JSON.stringify({
        model: cfg.nvidiaModel,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract the expense data from this receipt." },
              { type: "image_url", image_url: { url: dataUri } },
            ],
          },
        ],
        temperature: 0,
        max_tokens: 1024,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`NVIDIA Build error ${res.status}: ${detail.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("NVIDIA Build returned no message content");
    }
    return parseModelJson(content); // throws MalformedExtractionError on bad JSON
  },
};
