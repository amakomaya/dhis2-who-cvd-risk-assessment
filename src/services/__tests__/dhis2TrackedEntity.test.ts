import { describe, expect, it, vi } from "vitest";
import { fetchTrackedEntityAttributeValues } from "../dhis2TrackedEntity";
import type { CvdRiskConfiguration } from "../../config/schema";
import type { Dhis2DataEngine } from "../dhis2DataStore";

function configWithTeaIds(dobId: string, sexId: string): CvdRiskConfiguration {
  return {
    dhis2MetadataMappings: {
      trackedEntityAttributeIds: { dateOfBirth: dobId, sex: sexId },
    },
  } as unknown as CvdRiskConfiguration;
}

describe("fetchTrackedEntityAttributeValues", () => {
  it("returns not-found without querying when no ID is given", async () => {
    const engine = { query: vi.fn() };
    const result = await fetchTrackedEntityAttributeValues(
      engine,
      configWithTeaIds("dob1", "sex1"),
      "",
    );
    expect(result.status).toBe("not-found");
    expect(engine.query).not.toHaveBeenCalled();
  });

  it("extracts dateOfBirth and sexCode by configured attribute IDs", async () => {
    const engine = {
      query: vi.fn().mockResolvedValue({
        trackedEntity: {
          attributes: [
            { attribute: "dob1", value: "1980-05-20" },
            { attribute: "sex1", value: "male" },
            { attribute: "other", value: "ignored" },
          ],
        },
      }),
    };
    const result = await fetchTrackedEntityAttributeValues(
      engine,
      configWithTeaIds("dob1", "sex1"),
      "tei1",
    );
    expect(result).toMatchObject({
      status: "ok",
      values: { dateOfBirth: "1980-05-20", sexCode: "male" },
    });
  });

  it("returns not-found when the tracked entity does not exist", async () => {
    const engine = { query: vi.fn().mockRejectedValue({ httpStatusCode: 404 }) };
    const result = await fetchTrackedEntityAttributeValues(
      engine,
      configWithTeaIds("dob1", "sex1"),
      "missing",
    );
    expect(result.status).toBe("not-found");
  });

  it("returns network-error on other failures", async () => {
    const engine = { query: vi.fn().mockRejectedValue({ message: "timeout" }) };
    const result = await fetchTrackedEntityAttributeValues(
      engine,
      configWithTeaIds("dob1", "sex1"),
      "tei1",
    );
    expect(result.status).toBe("network-error");
  });

  it("leaves fields undefined when their attribute ID is not configured", async () => {
    const engine = {
      query: vi.fn().mockResolvedValue({
        trackedEntity: { attributes: [{ attribute: "dob1", value: "1980-05-20" }] },
      }),
    };
    const result = await fetchTrackedEntityAttributeValues(
      engine,
      configWithTeaIds("dob1", ""),
      "tei1",
    );
    expect(result).toMatchObject({ status: "ok", values: { dateOfBirth: "1980-05-20" } });
    if (result.status === "ok") {
      expect(result.values.sexCode).toBeUndefined();
    }
  });
});

describe("fetchTrackedEntityAttributeValues - request shape", () => {
  it("requests attributes explicitly via fields, since the tracker API omits them by default", async () => {
    const engine: Dhis2DataEngine = {
      query: vi.fn().mockResolvedValue({ trackedEntity: { attributes: [] } }),
    };
    await fetchTrackedEntityAttributeValues(engine, configWithTeaIds("dob1", "sex1"), "tei1");
    const callArg = (engine.query as any).mock.calls[0][0];
    expect(callArg.trackedEntity.params.fields).toContain("attributes");
  });
});
