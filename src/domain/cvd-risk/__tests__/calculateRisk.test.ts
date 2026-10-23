import { describe, expect, it } from "vitest";
import { calculateCvdRisk, DEFAULT_METHODOLOGY } from "../calculateRisk";

describe("calculateCvdRisk - calculated results", () => {
  it("returns a calculated result with category for a fully valid input", () => {
    const result = calculateCvdRisk({
      age: 60,
      sex: "male",
      smokingStatus: "smoker",
      systolicBloodPressureMmHg: 150,
      totalCholesterol: 6.2,
      totalCholesterolUnit: "mmol/L",
      diabetesStatus: "without",
    });
    expect(result.status).toBe("calculated");
    expect(result.riskPercent).toBeTypeOf("number");
    expect(result.riskCategory).toBeDefined();
    expect(result.chartRegion).toBe("south-asia");
    expect(result.message.toLowerCase()).toContain("estimate");
  });

  it("echoes back the exact validated inputs used", () => {
    const result = calculateCvdRisk({
      age: 50,
      sex: "female",
      smokingStatus: "non-smoker",
      systolicBloodPressureMmHg: 125,
      totalCholesterol: 4.5,
      totalCholesterolUnit: "mmol/L",
      diabetesStatus: "with",
    });
    expect(result.inputsUsed).toMatchObject({
      age: 50,
      sex: "female",
      smokingStatus: "non-smoker",
      systolicBloodPressureMmHg: 125,
      totalCholesterolMmolPerL: 4.5,
      diabetesStatus: "with",
    });
  });
});

describe("calculateCvdRisk - unavailable results, never fabricated", () => {
  it("returns unavailable with missing measurements when nothing is supplied", () => {
    const result = calculateCvdRisk({});
    expect(result.status).toBe("unavailable");
    expect(result.riskPercent).toBeUndefined();
    expect(result.unavailableReason).toBe("MISSING_REQUIRED_MEASUREMENTS");
    expect(result.missingMeasurements.length).toBeGreaterThan(0);
  });

  it("returns unavailable (not a default/normal value) for invalid inputs", () => {
    const result = calculateCvdRisk({
      age: 55,
      sex: "male",
      smokingStatus: "non-smoker",
      systolicBloodPressureMmHg: 130,
      totalCholesterol: 5,
      totalCholesterolUnit: "mmol/L",
      diabetesStatus: "unspecified",
    });
    expect(result.status).toBe("unavailable");
    expect(result.riskPercent).toBeUndefined();
    expect(result.validationErrors.length).toBeGreaterThan(0);
  });

  it("returns unavailable for an unsupported age rather than extrapolating", () => {
    const result = calculateCvdRisk({
      age: 85,
      sex: "male",
      smokingStatus: "non-smoker",
      systolicBloodPressureMmHg: 130,
      totalCholesterol: 5,
      totalCholesterolUnit: "mmol/L",
      diabetesStatus: "without",
    });
    expect(result.status).toBe("unavailable");
  });

  it("never substitutes a default for a missing single field (e.g. diabetes status)", () => {
    const result = calculateCvdRisk({
      age: 55,
      sex: "male",
      smokingStatus: "non-smoker",
      systolicBloodPressureMmHg: 130,
      totalCholesterol: 5,
      totalCholesterolUnit: "mmol/L",
      // diabetesStatus intentionally omitted
    });
    expect(result.status).toBe("unavailable");
    expect(result.missingMeasurements).toContain("diabetesStatus");
  });

  it("rejects an unsupported methodology/chart region instead of silently scoring", () => {
    const result = calculateCvdRisk(
      {
        age: 55,
        sex: "male",
        smokingStatus: "non-smoker",
        systolicBloodPressureMmHg: 130,
        totalCholesterol: 5,
        totalCholesterolUnit: "mmol/L",
        diabetesStatus: "without",
      },
      { ...DEFAULT_METHODOLOGY, chartRegion: "unverified-region" as never },
    );
    expect(result.status).toBe("unavailable");
    expect(result.unavailableReason).toBe("METHODOLOGY_NOT_CONFIGURED");
  });
});

describe("calculateCvdRisk - determinism", () => {
  it("returns identical results for identical inputs across repeated calls", () => {
    const input = {
      age: 65,
      sex: "female" as const,
      smokingStatus: "smoker" as const,
      systolicBloodPressureMmHg: 170,
      totalCholesterol: 6.5,
      totalCholesterolUnit: "mmol/L" as const,
      diabetesStatus: "with" as const,
    };
    const a = calculateCvdRisk(input);
    const b = calculateCvdRisk(input);
    expect(a).toEqual(b);
  });
});

describe("calculateCvdRisk - BMI fallback when total cholesterol is unavailable", () => {
  it("uses the non-laboratory-based chart and records chartType when cholesterol is omitted", () => {
    const result = calculateCvdRisk({
      age: 60,
      sex: "male",
      smokingStatus: "non-smoker",
      systolicBloodPressureMmHg: 150,
      heightCm: 170,
      weightKg: 75,
    });
    expect(result.status).toBe("calculated");
    expect(result.chartType).toBe("non-laboratory-based");
    expect(result.chartVersion).toBe("who-2019-south-asia-nonlab-v1");
    expect(result.message).toContain("BMI");
  });

  it("uses the laboratory-based chart when cholesterol is provided, even if height/weight are also present", () => {
    const result = calculateCvdRisk({
      age: 60,
      sex: "male",
      smokingStatus: "non-smoker",
      systolicBloodPressureMmHg: 150,
      totalCholesterol: 5,
      totalCholesterolUnit: "mmol/L",
      diabetesStatus: "without",
      heightCm: 170,
      weightKg: 75,
    });
    expect(result.status).toBe("calculated");
    expect(result.chartType).toBe("laboratory-based");
  });

  it("returns unavailable (not fabricated) when neither cholesterol nor height/weight are provided", () => {
    const result = calculateCvdRisk({
      age: 60,
      sex: "male",
      smokingStatus: "non-smoker",
      systolicBloodPressureMmHg: 150,
    });
    expect(result.status).toBe("unavailable");
    expect(result.riskPercent).toBeUndefined();
  });

  it("still reports chartType as non-laboratory-based for an unavailable result when height/weight (not cholesterol) were the data supplied", () => {
    // Age is missing, so validation fails before a pathway is confirmed -
    // but height/weight (no cholesterol) tell us the BMI chart was the one
    // actually being attempted, so the UI can still show the BMI row
    // instead of defaulting to cholesterol/diabetes.
    const result = calculateCvdRisk({
      sex: "male",
      smokingStatus: "non-smoker",
      systolicBloodPressureMmHg: 150,
      heightCm: 170,
      weightKg: 75,
    });
    expect(result.status).toBe("unavailable");
    expect(result.chartType).toBe("non-laboratory-based");
  });
});
