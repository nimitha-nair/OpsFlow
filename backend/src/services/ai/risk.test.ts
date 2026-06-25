import { describe, it, expect } from "vitest";

import { deriveRiskLevel } from "./risk";

describe("deriveRiskLevel", () => {
  it("treats a clean, high-authenticity receipt as LOW", () => {
    expect(deriveRiskLevel(95, [])).toBe("LOW");
    expect(deriveRiskLevel(75, [])).toBe("LOW");
  });

  it("flags soft indicators or below-par authenticity as MEDIUM", () => {
    expect(deriveRiskLevel(95, ["BLURRY"])).toBe("MEDIUM");
    expect(deriveRiskLevel(60, [])).toBe("MEDIUM");
    expect(deriveRiskLevel(95, ["SCREENSHOT"])).toBe("MEDIUM");
  });

  it("flags strong indicators or very low authenticity as HIGH", () => {
    expect(deriveRiskLevel(95, ["EDITED"])).toBe("HIGH");
    expect(deriveRiskLevel(95, ["SYNTHETIC"])).toBe("HIGH");
    expect(deriveRiskLevel(95, ["DUPLICATE"])).toBe("HIGH");
    expect(deriveRiskLevel(30, [])).toBe("HIGH");
    expect(deriveRiskLevel(40, ["BLURRY", "DUPLICATE"])).toBe("HIGH");
  });
});
