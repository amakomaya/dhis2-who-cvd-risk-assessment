import { describe, expect, it } from "vitest";
import { cvdRiskConfigurationSchema } from "../schema";

function validConfig(overrides: Record<string, unknown> = {}) {
  return {
    application: {
      enabled: true,
      configSchemaVersion: "1.0.0",
      configVersion: "1.0.0",
    },
    dhis2MetadataMappings: {
      programId: "",
      programStageId: "",
      inputDataElementIds: {
        smokingStatus: "",
        systolicBloodPressure: "",
        totalCholesterol: "",
        diabetesStatus: "",
      },
      trackedEntityAttributeIds: {
        dateOfBirth: "",
        sex: "",
      },
      outputDataElementIds: {
        riskPercent: "",
      },
    },
    inputSettings: {
      sex: {},
      smokingStatus: {},
      totalCholesterol: { acceptedUnits: ["mmol/L"] },
      diabetesStatus: {},
    },
    ...overrides,
  };
}

describe("cvdRiskConfigurationSchema", () => {
  it("accepts a valid configuration with unmapped (empty-string) metadata IDs", () => {
    const result = cvdRiskConfigurationSchema.safeParse(validConfig());
    expect(result.success).toBe(true);
  });

  it("rejects a configuration with an incompatible config schema version", () => {
    const config = validConfig();
    (config as any).application.configSchemaVersion = "0.9.0";
    const result = cvdRiskConfigurationSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("rejects a configuration missing required top-level sections", () => {
    const result = cvdRiskConfigurationSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects malformed types (e.g. enabled as string)", () => {
    const config = validConfig();
    (config as any).application.enabled = "true";
    const result = cvdRiskConfigurationSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("rejects an unsupported total cholesterol unit", () => {
    const config = validConfig();
    (config as any).inputSettings.totalCholesterol.acceptedUnits = ["lb/gal"];
    const result = cvdRiskConfigurationSchema.safeParse(config);
    expect(result.success).toBe(false);
  });
});
