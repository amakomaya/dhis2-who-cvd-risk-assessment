import { describe, expect, it } from "vitest";
import { findMissingMeasurements, validateCvdRiskInputs } from "../validateInputs";

const VALID: Parameters<typeof validateCvdRiskInputs>[0] = {
  age: 55,
  sex: "male",
  smokingStatus: "non-smoker",
  systolicBloodPressureMmHg: 130,
  totalCholesterol: 5.2,
  totalCholesterolUnit: "mmol/L",
  diabetesStatus: "without",
};

const VALID_BMI_FALLBACK: Parameters<typeof validateCvdRiskInputs>[0] = {
  age: 55,
  sex: "male",
  smokingStatus: "non-smoker",
  systolicBloodPressureMmHg: 130,
  heightCm: 170,
  weightKg: 70,
};

describe("validateCvdRiskInputs - laboratory-based happy path", () => {
  it("accepts a fully valid input and selects the laboratory-based pathway", () => {
    const result = validateCvdRiskInputs(VALID);
    expect(result.valid).toBe(true);
    expect(result.input).toMatchObject({
      chartType: "laboratory-based",
      age: 55,
      sex: "male",
      smokingStatus: "non-smoker",
      systolicBloodPressureMmHg: 130,
      totalCholesterolMmolPerL: 5.2,
      diabetesStatus: "without",
    });
  });

  it("accepts string-typed numeric fields (form inputs)", () => {
    const result = validateCvdRiskInputs({
      ...VALID,
      age: "55",
      systolicBloodPressureMmHg: "130",
      totalCholesterol: "5.2",
    });
    expect(result.valid).toBe(true);
  });

  it("converts mg/dL total cholesterol to mmol/L", () => {
    const result = validateCvdRiskInputs({
      ...VALID,
      totalCholesterol: 200,
      totalCholesterolUnit: "mg/dL",
    });
    expect(result.valid).toBe(true);
    const input = result.input;
    expect(input?.chartType).toBe("laboratory-based");
    if (input?.chartType === "laboratory-based") {
      expect(input.totalCholesterolMmolPerL).toBeCloseTo(200 / 38.67, 5);
    }
  });

  it("prefers the laboratory-based pathway when cholesterol, diabetes, and height/weight are all provided", () => {
    const result = validateCvdRiskInputs({ ...VALID, heightCm: 170, weightKg: 70 });
    expect(result.valid).toBe(true);
    expect(result.input?.chartType).toBe("laboratory-based");
  });
});

describe("validateCvdRiskInputs - non-laboratory-based (BMI) fallback", () => {
  it("accepts height+weight in place of total cholesterol and selects the BMI pathway", () => {
    const result = validateCvdRiskInputs(VALID_BMI_FALLBACK);
    expect(result.valid).toBe(true);
    expect(result.input).toMatchObject({
      chartType: "non-laboratory-based",
      age: 55,
      sex: "male",
      smokingStatus: "non-smoker",
      systolicBloodPressureMmHg: 130,
    });
    const input = result.input;
    if (input?.chartType === "non-laboratory-based") {
      expect(input.bmi).toBeCloseTo(70 / (1.7 * 1.7), 5);
    }
  });

  it("does not require diabetes status on the BMI pathway", () => {
    const result = validateCvdRiskInputs(VALID_BMI_FALLBACK);
    expect(result.valid).toBe(true);
    expect(result.errors.some((e) => e.field === "diabetesStatus")).toBe(false);
  });

  it("falls back to the BMI pathway when cholesterol is provided but diabetes status is not (as long as height/weight are available)", () => {
    const result = validateCvdRiskInputs({
      age: 55,
      sex: "male",
      smokingStatus: "non-smoker",
      systolicBloodPressureMmHg: 130,
      totalCholesterol: 5.2,
      totalCholesterolUnit: "mmol/L",
      // diabetesStatus intentionally omitted
      heightCm: 170,
      weightKg: 70,
    });
    expect(result.valid).toBe(true);
    expect(result.input?.chartType).toBe("non-laboratory-based");
  });

  it("rejects an implausible height", () => {
    const result = validateCvdRiskInputs({ ...VALID_BMI_FALLBACK, heightCm: 50 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "HEIGHT_OUT_OF_SUPPORTED_RANGE")).toBe(true);
  });

  it("rejects an implausible weight", () => {
    const result = validateCvdRiskInputs({ ...VALID_BMI_FALLBACK, weightKg: 500 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "WEIGHT_OUT_OF_SUPPORTED_RANGE")).toBe(true);
  });

  it("rejects when only height (not weight) is provided", () => {
    const result = validateCvdRiskInputs({
      age: 55,
      sex: "male",
      smokingStatus: "non-smoker",
      systolicBloodPressureMmHg: 130,
      heightCm: 170,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "CHOLESTEROL_OR_BMI_MEASUREMENT_REQUIRED")).toBe(
      true,
    );
  });
});

describe("validateCvdRiskInputs - neither cholesterol nor BMI inputs provided", () => {
  it("fails with a single actionable error explaining both options", () => {
    const result = validateCvdRiskInputs({
      age: 55,
      sex: "male",
      smokingStatus: "non-smoker",
      systolicBloodPressureMmHg: 130,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "CHOLESTEROL_OR_BMI_MEASUREMENT_REQUIRED")).toBe(
      true,
    );
  });
});

describe("validateCvdRiskInputs - missing fields (laboratory-based)", () => {
  it.each([
    "age",
    "sex",
    "smokingStatus",
    "systolicBloodPressureMmHg",
    "totalCholesterolUnit",
    "diabetesStatus",
  ] as const)("flags missing %s", (field) => {
    const input = { ...VALID, [field]: undefined };
    const result = validateCvdRiskInputs(input);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === field)).toBe(true);
  });
});

describe("validateCvdRiskInputs - invalid/unsupported values", () => {
  it("rejects age below 40", () => {
    const result = validateCvdRiskInputs({ ...VALID, age: 39 });
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe("AGE_OUT_OF_SUPPORTED_RANGE");
  });

  it("accepts ages 75-79 (reused against the oldest chart band, per WHO guidance)", () => {
    const result = validateCvdRiskInputs({ ...VALID, age: 77 });
    expect(result.valid).toBe(true);
  });

  it("rejects age above the extended lookup ceiling (79)", () => {
    const result = validateCvdRiskInputs({ ...VALID, age: 80 });
    expect(result.valid).toBe(false);
  });

  it("rejects non-numeric age", () => {
    const result = validateCvdRiskInputs({ ...VALID, age: "not-a-number" });
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe("AGE_NOT_A_NUMBER");
  });

  it("rejects unsupported sex value", () => {
    const result = validateCvdRiskInputs({ ...VALID, sex: "other" });
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe("SEX_UNSUPPORTED_VALUE");
  });

  it("rejects implausible SBP", () => {
    const result = validateCvdRiskInputs({ ...VALID, systolicBloodPressureMmHg: 500 });
    expect(result.valid).toBe(false);
  });

  it("rejects unsupported cholesterol unit", () => {
    const result = validateCvdRiskInputs({ ...VALID, totalCholesterolUnit: "g/L" });
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe("TOTAL_CHOLESTEROL_UNIT_UNSUPPORTED");
  });

  it("rejects unsupported diabetes status value", () => {
    const result = validateCvdRiskInputs({ ...VALID, diabetesStatus: "unknown" });
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe("DIABETES_STATUS_UNSUPPORTED_VALUE");
  });

  it("accumulates multiple errors at once", () => {
    const result = validateCvdRiskInputs({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(5);
  });
});

describe("findMissingMeasurements", () => {
  it("returns empty array for a complete laboratory-based input", () => {
    expect(findMissingMeasurements(VALID)).toEqual([]);
  });

  it("returns empty array for a complete BMI-fallback input", () => {
    expect(findMissingMeasurements(VALID_BMI_FALLBACK)).toEqual([]);
  });

  it("lists age/sex/smoking/SBP plus both cholesterol-or-BMI options when nothing is supplied", () => {
    expect(findMissingMeasurements({})).toEqual([
      "age",
      "sex",
      "smokingStatus",
      "systolicBloodPressureMmHg",
      "totalCholesterol",
      "diabetesStatus",
      "heightCm",
      "weightKg",
    ]);
  });

  it("lists totalCholesterolUnit (not diabetesStatus/height/weight) when cholesterol and diabetes are both provided", () => {
    expect(
      findMissingMeasurements({
        age: 55,
        sex: "male",
        smokingStatus: "non-smoker",
        systolicBloodPressureMmHg: 130,
        totalCholesterol: 5.2,
        diabetesStatus: "without",
      }),
    ).toEqual(["totalCholesterolUnit"]);
  });

  it("falls back to requesting height/weight (not totalCholesterolUnit) when cholesterol is provided but diabetes status is not", () => {
    // The lab pathway needs BOTH cholesterol and diabetes - without diabetes,
    // cholesterol alone can't select the lab chart, so the BMI fallback's
    // own requirements (height/weight) are reported instead.
    expect(
      findMissingMeasurements({
        age: 55,
        sex: "male",
        smokingStatus: "non-smoker",
        systolicBloodPressureMmHg: 130,
        totalCholesterol: 5.2,
      }),
    ).toEqual(["diabetesStatus", "heightCm", "weightKg"]);
  });
});
