import { describe, expect, it } from "vitest";
import { computeBmi } from "../bmi";

describe("computeBmi", () => {
  it("computes BMI = weight(kg) / height(m)^2", () => {
    expect(computeBmi(170, 70)).toBeCloseTo(70 / (1.7 * 1.7), 5);
  });

  it("returns null for implausible height", () => {
    expect(computeBmi(50, 70)).toBeNull();
    expect(computeBmi(300, 70)).toBeNull();
  });

  it("returns null for implausible weight", () => {
    expect(computeBmi(170, 5)).toBeNull();
    expect(computeBmi(170, 500)).toBeNull();
  });

  it("returns null for non-finite inputs", () => {
    expect(computeBmi(NaN, 70)).toBeNull();
    expect(computeBmi(170, NaN)).toBeNull();
  });
});
