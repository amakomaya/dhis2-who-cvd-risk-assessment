import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearConfigCache,
  DATASTORE_KEY,
  DATASTORE_NAMESPACE,
  loadCvdRiskConfiguration,
  type Dhis2DataEngine,
} from "../dhis2DataStore";

function validConfigPayload() {
  return {
    application: { enabled: true, configSchemaVersion: "1.0.0", configVersion: "1.0.0" },
    dhis2MetadataMappings: {
      programId: "",
      programStageId: "",
      inputDataElementIds: {
        smokingStatus: "",
        systolicBloodPressure: "",
        totalCholesterol: "",
        diabetesStatus: "",
      },
      trackedEntityAttributeIds: { dateOfBirth: "", sex: "" },
      outputDataElementIds: { riskPercent: "" },
    },
    inputSettings: {
      sex: {},
      smokingStatus: {},
      totalCholesterol: { acceptedUnits: ["mmol/L"] },
      diabetesStatus: {},
    },
  };
}

function makeEngine(response: Record<string, unknown>): Dhis2DataEngine {
  return { query: vi.fn().mockResolvedValue(response) };
}

function makeFailingEngine(error: unknown): Dhis2DataEngine {
  return { query: vi.fn().mockRejectedValue(error) };
}

describe("loadCvdRiskConfiguration", () => {
  beforeEach(() => {
    clearConfigCache();
  });

  it("builds the expected DataStore resource path", async () => {
    const engine = makeEngine({ configuration: validConfigPayload() });
    await loadCvdRiskConfiguration(engine);
    expect(engine.query).toHaveBeenCalledWith(
      expect.objectContaining({
        configuration: expect.objectContaining({
          resource: `dataStore/${DATASTORE_NAMESPACE}/${DATASTORE_KEY}`,
        }),
      }),
    );
  });

  it("returns ok with validated config on success", async () => {
    const engine = makeEngine({ configuration: validConfigPayload() });
    const result = await loadCvdRiskConfiguration(engine);
    expect(result.status).toBe("ok");
  });

  it("caches the config after first successful load", async () => {
    const engine = makeEngine({ configuration: validConfigPayload() });
    await loadCvdRiskConfiguration(engine);
    await loadCvdRiskConfiguration(engine);
    expect(engine.query).toHaveBeenCalledTimes(1);
  });

  it("returns not-found on a 404 without inventing a default config", async () => {
    const engine = makeFailingEngine({ httpStatusCode: 404, message: "Not Found" });
    const result = await loadCvdRiskConfiguration(engine);
    expect(result.status).toBe("not-found");
  });

  it("returns network-error on connectivity failures", async () => {
    const engine = makeFailingEngine({ message: "Network request failed" });
    const result = await loadCvdRiskConfiguration(engine);
    expect(result.status).toBe("network-error");
  });

  it("returns invalid for malformed stored configuration", async () => {
    const engine = makeEngine({ configuration: { not: "valid" } });
    const result = await loadCvdRiskConfiguration(engine);
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });

  it("returns invalid when application.enabled is false", async () => {
    const payload = validConfigPayload();
    (payload as any).application.enabled = false;
    const engine = makeEngine({ configuration: payload });
    const result = await loadCvdRiskConfiguration(engine);
    expect(result.status).toBe("invalid");
  });

  it("rejects an unsupported total cholesterol unit rather than silently using it", async () => {
    const payload = validConfigPayload();
    (payload as any).inputSettings.totalCholesterol.acceptedUnits = ["lb/gal"];
    const engine = makeEngine({ configuration: payload });
    const result = await loadCvdRiskConfiguration(engine);
    expect(result.status).toBe("invalid");
  });
});
