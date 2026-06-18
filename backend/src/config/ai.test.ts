import { afterEach, describe, expect, it } from "vitest";
import { getAiConfig } from "./ai";

const KEYS = [
  "AI_PROVIDER", "NVIDIA_API_KEY", "NVIDIA_BASE_URL",
  "NVIDIA_MODEL", "AI_CONFIDENCE_THRESHOLD", "NVIDIA_TIMEOUT_MS",
];

afterEach(() => {
  for (const k of KEYS) delete process.env[k];
});

describe("getAiConfig", () => {
  it("defaults to the mock provider and documented values", () => {
    const cfg = getAiConfig();
    expect(cfg.provider).toBe("kimi");
    expect(cfg.nvidiaBaseUrl).toBe("https://integrate.api.nvidia.com/v1");
    expect(cfg.nvidiaModel).toBe("moonshotai/kimi-k2.6");
    expect(cfg.confidenceThreshold).toBe(70);
  });

  it("reads kimi provider and overrides from env", () => {
    process.env.AI_PROVIDER = "kimi";
    process.env.NVIDIA_API_KEY = "nvapi-test";
    process.env.AI_CONFIDENCE_THRESHOLD = "85";
    const cfg = getAiConfig();
    expect(cfg.provider).toBe("kimi");
    expect(cfg.nvidiaApiKey).toBe("nvapi-test");
    expect(cfg.confidenceThreshold).toBe(85);
  });

  it("falls back to mock for an unknown provider", () => {
    process.env.AI_PROVIDER = "openai";
    expect(getAiConfig().provider).toBe("mock");
  });
});
