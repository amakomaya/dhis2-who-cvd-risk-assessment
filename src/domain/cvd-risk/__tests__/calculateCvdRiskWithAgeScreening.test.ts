import { describe, expect, it } from "vitest";
import { calculateCvdRiskWithAgeScreening } from "../calculateRisk";

const BASE = {
  sex: "male" as const,
  smokingStatus: "non-smoker" as const,
  systolicBloodPressureMmHg: 130,
  totalCholesterol: 5,
  totalCholesterolUnit: "mmol/L" as const,
  diabetesStatus: "without" as const,
};

describe("calculateCvdRiskWithAgeScreening", () => {
  it("rejects a person under 18 as not eligible, without attempting a chart lookup", () => {
    const result = calculateCvdRiskWithAgeScreening({ ...BASE, age: 15 });
    expect(result.status).toBe("unavailable");
    expect(result.unavailableReason).toBe("NOT_ELIGIBLE_SCREENING_AGE");
    expect(result.message).toContain("15");
  });

  it("scores an 18-40 year old at chart age 40", () => {
    const result = calculateCvdRiskWithAgeScreening({ ...BASE, age: 25 });
    expect(result.status).toBe("calculated");
    expect(result.inputsUsed?.age).toBe(40);
  });

  it("scores exactly age 40 at chart age 40 (boundary)", () => {
    const result = calculateCvdRiskWithAgeScreening({ ...BASE, age: 40 });
    expect(result.status).toBe("calculated");
    expect(result.inputsUsed?.age).toBe(40);
  });

  it("scores a 55 year old using their true age", () => {
    const result = calculateCvdRiskWithAgeScreening({ ...BASE, age: 55 });
    expect(result.status).toBe("calculated");
    expect(result.inputsUsed?.age).toBe(55);
  });

  it("scores someone over 79 at chart age 79 (reusing the oldest band)", () => {
    const over = calculateCvdRiskWithAgeScreening({ ...BASE, age: 95 });
    const seventyNine = calculateCvdRiskWithAgeScreening({ ...BASE, age: 79 });
    expect(over.status).toBe("calculated");
    expect(over.inputsUsed?.age).toBe(79);
    expect(over.riskPercent).toBe(seventyNine.riskPercent);
  });

  it("falls back to calculateCvdRisk's own validation when age is missing", () => {
    const result = calculateCvdRiskWithAgeScreening({ ...BASE });
    expect(result.status).toBe("unavailable");
    expect(result.unavailableReason).toBe("MISSING_REQUIRED_MEASUREMENTS");
  });

  it("falls back to calculateCvdRisk's own validation when age is not a number", () => {
    const result = calculateCvdRiskWithAgeScreening({ ...BASE, age: "not-a-number" });
    expect(result.status).toBe("unavailable");
    expect(result.validationErrors.some((e) => e.code === "AGE_NOT_A_NUMBER")).toBe(true);
  });
});
