import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cvdRiskConfigurationSchema } from "../schema";

function loadConfigFile(relativePath: string) {
  const raw = JSON.parse(
    readFileSync(resolve(__dirname, "../../../", relativePath), "utf-8"),
  );
  return raw;
}

describe("config/example-datastore-configuration.json", () => {
  it("is valid against the runtime configuration schema", () => {
    const raw = loadConfigFile("config/example-datastore-configuration.json");
    const result = cvdRiskConfigurationSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });

  it("is not fully mapped (metadata IDs are placeholders, as documented)", () => {
    const raw = loadConfigFile("config/example-datastore-configuration.json");
    const parsed = cvdRiskConfigurationSchema.parse(raw);
    expect(parsed.dhis2MetadataMappings.programId).toBe("");
    expect(parsed.dhis2MetadataMappings.outputDataElementIds.riskPercent).toBe("");
  });
});

describe("config/nepal-tokha-datastore-configuration.json", () => {
  it("is valid against the runtime configuration schema", () => {
    const raw = loadConfigFile("config/nepal-tokha-datastore-configuration.json");
    const result = cvdRiskConfigurationSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });

  it("has all required metadata IDs mapped", () => {
    const raw = loadConfigFile("config/nepal-tokha-datastore-configuration.json");
    const parsed = cvdRiskConfigurationSchema.parse(raw);
    const m = parsed.dhis2MetadataMappings;
    const requiredIds = [
      m.programId,
      m.programStageId,
      m.trackedEntityAttributeIds.dateOfBirth,
      m.trackedEntityAttributeIds.sex,
      m.inputDataElementIds.smokingStatus,
      m.inputDataElementIds.systolicBloodPressure,
      m.inputDataElementIds.totalCholesterol,
      m.inputDataElementIds.diabetesStatus,
      m.outputDataElementIds.riskPercent,
    ];
    expect(requiredIds.every((id) => id.trim().length > 0)).toBe(true);
  });

  it("has the required output UID (KgeoM7TE7HJ, per project specification)", () => {
    const raw = loadConfigFile("config/nepal-tokha-datastore-configuration.json");
    const parsed = cvdRiskConfigurationSchema.parse(raw);
    expect(parsed.dhis2MetadataMappings.outputDataElementIds.riskPercent).toBe("KgeoM7TE7HJ");
  });

  it("stays disabled (application.enabled=false) pending clinical sign-off", () => {
    const raw = loadConfigFile("config/nepal-tokha-datastore-configuration.json");
    const parsed = cvdRiskConfigurationSchema.parse(raw);
    expect(parsed.application.enabled).toBe(false);
  });

  it("uses mg/dL for total cholesterol, matching the confirmed storage unit", () => {
    const raw = loadConfigFile("config/nepal-tokha-datastore-configuration.json");
    const parsed = cvdRiskConfigurationSchema.parse(raw);
    expect(parsed.inputSettings.totalCholesterol.acceptedUnits).toEqual(["mg/dL"]);
  });

  it("maps tobacco, diabetes, and sex option codes exactly as supplied", () => {
    const raw = loadConfigFile("config/nepal-tokha-datastore-configuration.json");
    const parsed = cvdRiskConfigurationSchema.parse(raw);
    expect(parsed.inputSettings.smokingStatus.optionCodeMapping).toEqual({
      "1": "non-smoker",
      "2": "smoker",
      "3": "smoker",
      "4": "non-smoker",
    });
    expect(parsed.inputSettings.diabetesStatus.optionCodeMapping).toEqual({
      "1": "with",
      "0": "without",
    });
    expect(parsed.inputSettings.sex.optionCodeMapping).toEqual({
      male: "male",
      female: "female",
    });
  });
});
