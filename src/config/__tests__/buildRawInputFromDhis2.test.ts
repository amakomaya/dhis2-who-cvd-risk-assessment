import { describe, expect, it } from "vitest";
import { buildRawInputFromDhis2 } from "../buildRawInputFromDhis2";
import type { CvdRiskConfiguration } from "../schema";

function configWithMappings(): CvdRiskConfiguration {
  return {
    inputSettings: {
      sex: { optionCodeMapping: { male: "male", female: "female" } },
      smokingStatus: {
        optionCodeMapping: { "1": "non-smoker", "2": "smoker", "3": "smoker", "4": "non-smoker" },
      },
      diabetesStatus: { optionCodeMapping: { "1": "with", "0": "without" } },
      totalCholesterol: { acceptedUnits: ["mg/dL"] },
    },
  } as unknown as CvdRiskConfiguration;
}

describe("buildRawInputFromDhis2", () => {
  it("derives age from date of birth as of the assessment date", () => {
    const raw = buildRawInputFromDhis2(configWithMappings(), {
      dateOfBirthIso: "1970-01-01",
      assessmentDateIso: "2026-01-01",
    });
    expect(raw.age).toBe(56);
  });

  it("maps sex, smoking, and diabetes option codes via the configured tables", () => {
    const raw = buildRawInputFromDhis2(configWithMappings(), {
      sexCode: "female",
      smokingStatusCode: "2",
      diabetesStatusCode: "1",
    });
    expect(raw.sex).toBe("female");
    expect(raw.smokingStatus).toBe("smoker");
    expect(raw.diabetesStatus).toBe("with");
  });

  it("leaves an unmapped code undefined instead of guessing", () => {
    const raw = buildRawInputFromDhis2(configWithMappings(), { smokingStatusCode: "9" });
    expect(raw.smokingStatus).toBeUndefined();
  });

  it("passes through SBP and cholesterol values and sets the configured unit", () => {
    const raw = buildRawInputFromDhis2(configWithMappings(), {
      systolicBloodPressure: "135",
      totalCholesterol: "190",
    });
    expect(raw.systolicBloodPressureMmHg).toBe("135");
    expect(raw.totalCholesterol).toBe("190");
    expect(raw.totalCholesterolUnit).toBe("mg/dL");
  });

  it("leaves age undefined when no date of birth is supplied", () => {
    const raw = buildRawInputFromDhis2(configWithMappings(), {});
    expect(raw.age).toBeUndefined();
  });
});

describe("buildRawInputFromDhis2 - BMI fallback pass-through", () => {
  it("passes through height/weight and omits the cholesterol unit when cholesterol is absent", () => {
    const raw = buildRawInputFromDhis2(configWithMappings(), {
      heightCm: "170",
      weightKg: "70",
    });
    expect(raw.heightCm).toBe("170");
    expect(raw.weightKg).toBe("70");
    expect(raw.totalCholesterolUnit).toBeUndefined();
  });

  it("still sets the cholesterol unit when cholesterol is present, regardless of height/weight", () => {
    const raw = buildRawInputFromDhis2(configWithMappings(), {
      totalCholesterol: "190",
      heightCm: "170",
      weightKg: "70",
    });
    expect(raw.totalCholesterolUnit).toBe("mg/dL");
  });
});
