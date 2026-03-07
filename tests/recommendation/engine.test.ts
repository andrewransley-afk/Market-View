import { describe, it, expect } from "vitest";
import { calculateRecommendation } from "../../src/recommendation/engine";

describe("calculateRecommendation", () => {
  it("returns 'hold' when 0 competitors sold out", () => {
    expect(calculateRecommendation(0, 50)).toBe("hold");
  });

  it("returns 'hold' when 1 competitor sold out", () => {
    expect(calculateRecommendation(1, 50)).toBe("hold");
  });

  it("returns 'raise' when 2 competitors sold out and stock > 0", () => {
    expect(calculateRecommendation(2, 30)).toBe("raise");
  });

  it("returns 'raise' when 3 competitors sold out and stock > 0", () => {
    expect(calculateRecommendation(3, 10)).toBe("raise");
  });

  it("returns 'raise' when 4+ competitors sold out and stock > 0", () => {
    expect(calculateRecommendation(4, 5)).toBe("raise");
    expect(calculateRecommendation(5, 1)).toBe("raise");
    expect(calculateRecommendation(6, 100)).toBe("raise");
  });

  it("returns 'hold' when stock is 0 regardless of sold out count", () => {
    expect(calculateRecommendation(0, 0)).toBe("hold");
    expect(calculateRecommendation(3, 0)).toBe("hold");
    expect(calculateRecommendation(6, 0)).toBe("hold");
  });
});
