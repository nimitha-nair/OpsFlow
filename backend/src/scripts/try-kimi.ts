/**
 * Verification harness: run a real receipt through the real Kimi (NVIDIA Build)
 * call and print the raw response + parsed extraction, without needing Firestore
 * or a stored document. Uses the SAME image transform and request as production.
 *
 *   npm run try:kimi -- ./uploads/expenses/<file>.jpg
 *
 * Requires NVIDIA_API_KEY in backend/.env (and AI_PROVIDER=kimi to use it in-app).
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";

import { getAiConfig } from "../config/ai";
import { bytesToKimiJpegDataUri } from "../services/ai/document-image";
import { kimiExtractFromDataUri } from "../services/ai/kimi-extractor";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npm run try:kimi -- <path-to-receipt-image-or-pdf>");
    process.exit(1);
  }

  const cfg = getAiConfig();
  console.log(
    `config: provider=${cfg.provider} model=${cfg.nvidiaModel} base=${cfg.nvidiaBaseUrl} timeout=${cfg.nvidiaTimeoutMs}ms`,
  );
  if (cfg.provider !== "kimi") {
    console.warn(
      "⚠  AI_PROVIDER is not 'kimi'. This harness calls Kimi directly regardless, " +
        "but set AI_PROVIDER=kimi in backend/.env to route the app through it.",
    );
  }

  const mime = MIME[extname(filePath).toLowerCase()];
  if (!mime) {
    console.error(`✗ Unsupported file type: "${extname(filePath)}"`);
    process.exit(1);
  }

  // Real image prep — identical to production (pdf→png page 1, sharp transcode,
  // EXIF rotate, downscale to 1600px, JPEG q80).
  console.log(`\nReceipt: ${basename(filePath)} (${mime})`);
  const bytes = await readFile(filePath);
  const dataUri = await bytesToKimiJpegDataUri(bytes, mime);
  console.log(
    `prepared JPEG data URI: ${(dataUri.length / 1024).toFixed(1)} KB base64 (from ${(bytes.length / 1024).toFixed(1)} KB source)`,
  );

  if (!cfg.nvidiaApiKey) {
    console.error(
      "\n✗ NVIDIA_API_KEY is empty — cannot make a real NVIDIA Build call.\n" +
        "  Everything above this line ran for real; only the live call is blocked.\n" +
        "  Add NVIDIA_API_KEY to backend/.env and re-run to see the raw + parsed output.",
    );
    process.exit(2);
  }

  console.log("\ncalling NVIDIA Build…");
  const t0 = Date.now();
  const { rawResponse, content, result } = await kimiExtractFromDataUri(dataUri);
  const ms = Date.now() - t0;

  console.log(`\n=== RAW HTTP RESPONSE (${ms} ms) ===`);
  console.dir(rawResponse, { depth: 6 });
  console.log("\n=== RAW MODEL CONTENT (message.content) ===");
  console.log(content);
  console.log("\n=== PARSED EXTRACTION ===");
  console.dir(result, { depth: 4 });

  process.exit(0);
}

main().catch((err) => {
  console.error(
    "\n✗ FAILED:",
    err instanceof Error ? `${err.name}: ${err.message}` : err,
  );
  process.exit(1);
});
