export interface AiConfig {
  provider: "mock" | "kimi";
  nvidiaApiKey: string;
  nvidiaBaseUrl: string;
  nvidiaModel: string;
  /** Integer 0–100; results with confidence below this are LOW_CONFIDENCE. */
  confidenceThreshold: number;
}

/** Read AI extractor config from the environment (dotenv-loaded). */
export function getAiConfig(): AiConfig {
  const provider = process.env.AI_PROVIDER === "kimi" ? "kimi" : "mock";
  const threshold = Number.parseInt(
    process.env.AI_CONFIDENCE_THRESHOLD ?? "70",
    10,
  );
  return {
    provider,
    nvidiaApiKey: process.env.NVIDIA_API_KEY ?? "",
    nvidiaBaseUrl:
      process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1",
    nvidiaModel: process.env.NVIDIA_MODEL ?? "moonshotai/kimi-k2.6",
    confidenceThreshold: Number.isFinite(threshold) ? threshold : 70,
  };
}
