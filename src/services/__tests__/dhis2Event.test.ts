import { describe, expect, it, vi } from "vitest";
import { fetchEventMeasurementValues } from "../dhis2Event";
import type { CvdRiskConfiguration } from "../../config/schema";

function configWithDeIds(): CvdRiskConfiguration {
  return {
    dhis2MetadataMappings: {
      inputDataElementIds: {
        smokingStatus: "de_smoking",
        systolicBloodPressure: "de_sbp",
        totalCholesterol: "de_tc",
        diabetesStatus: "de_diabetes",
        height: "de_height",
        weight: "de_weight",
      },
    },
  } as unknown as CvdRiskConfiguration;
}

describe("fetchEventMeasurementValues", () => {
  it("returns not-found without querying when no ID is given", async () => {
    const engine = { query: vi.fn() };
    const result = await fetchEventMeasurementValues(engine, configWithDeIds(), "");
    expect(result.status).toBe("not-found");
    expect(engine.query).not.toHaveBeenCalled();
  });

  it("extracts measurement values by configured data element IDs", async () => {
    const engine = {
      query: vi.fn().mockResolvedValue({
        event: {
          dataValues: [
            { dataElement: "de_smoking", value: "2" },
            { dataElement: "de_sbp", value: "135" },
            { dataElement: "de_tc", value: "190" },
            { dataElement: "de_diabetes", value: "0" },
            { dataElement: "de_height", value: "170" },
            { dataElement: "de_weight", value: "70" },
            { dataElement: "de_other", value: "ignored" },
          ],
        },
      }),
    };
    const result = await fetchEventMeasurementValues(engine, configWithDeIds(), "evt1");
    expect(result).toMatchObject({
      status: "ok",
      values: {
        smokingStatusCode: "2",
        systolicBloodPressure: "135",
        totalCholesterol: "190",
        diabetesStatusCode: "0",
        heightCm: "170",
        weightKg: "70",
      },
    });
  });

  it("leaves values undefined when the event has no data value for that data element", async () => {
    const engine = {
      query: vi.fn().mockResolvedValue({ event: { dataValues: [] } }),
    };
    const result = await fetchEventMeasurementValues(engine, configWithDeIds(), "evt1");
    expect(result).toMatchObject({
      status: "ok",
      values: {
        smokingStatusCode: undefined,
        systolicBloodPressure: undefined,
        totalCholesterol: undefined,
      },
    });
  });

  it("returns not-found on a 404", async () => {
    const engine = { query: vi.fn().mockRejectedValue({ httpStatusCode: 404 }) };
    const result = await fetchEventMeasurementValues(engine, configWithDeIds(), "missing");
    expect(result.status).toBe("not-found");
  });

  it("returns network-error on other failures", async () => {
    const engine = { query: vi.fn().mockRejectedValue({ message: "timeout" }) };
    const result = await fetchEventMeasurementValues(engine, configWithDeIds(), "evt1");
    expect(result.status).toBe("network-error");
  });
});

describe("fetchEventMeasurementValues - request shape", () => {
  it("requests dataValues explicitly via fields, since the tracker API omits them by default", async () => {
    const engine = { query: vi.fn().mockResolvedValue({ event: { dataValues: [] } }) };
    await fetchEventMeasurementValues(engine, configWithDeIds(), "evt1");
    const callArg = (engine.query as any).mock.calls[0][0];
    expect(callArg.event.params.fields).toContain("dataValues");
  });
});
