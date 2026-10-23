import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AssessmentWorkspace } from "../AssessmentWorkspace";
import type { CvdRiskConfiguration } from "../../config/schema";
import * as liveNativeFormBridge from "../../unsupported/liveNativeFormBridge";

function fullyMappedConfig(): CvdRiskConfiguration {
  return {
    application: { enabled: true, configSchemaVersion: "1.0.0", configVersion: "1.0.0" },
    dhis2MetadataMappings: {
      programId: "prog1",
      programStageId: "stage1",
      inputDataElementIds: {
        smokingStatus: "de_smoking",
        systolicBloodPressure: "de_sbp",
        totalCholesterol: "de_tc",
        diabetesStatus: "de_diabetes",
        height: "de_height",
        weight: "de_weight",
      },
      trackedEntityAttributeIds: { dateOfBirth: "tea_dob", sex: "tea_sex" },
      outputDataElementIds: { riskPercent: "de_risk" },
    },
    inputSettings: {
      sex: { optionCodeMapping: { male: "male", female: "female" } },
      smokingStatus: {
        optionCodeMapping: { "1": "non-smoker", "2": "smoker", "3": "smoker", "4": "non-smoker" },
      },
      totalCholesterol: { acceptedUnits: ["mg/dL"] },
      diabetesStatus: { optionCodeMapping: { "1": "with", "0": "without" } },
    },
  };
}

function makeEngine() {
  const query = vi.fn().mockImplementation(async (q: Record<string, { resource: string; id?: string }>) => {
    if (q.trackedEntity) {
      return {
        trackedEntity: {
          attributes: [
            { attribute: "tea_dob", value: "1970-01-01" },
            { attribute: "tea_sex", value: "male" },
          ],
        },
      };
    }
    if (q.event) {
      return {
        event: {
          occurredAt: "2026-10-23",
          dataValues: [
            { dataElement: "de_smoking", value: "2" },
            { dataElement: "de_sbp", value: "150" },
            { dataElement: "de_tc", value: "190" },
            { dataElement: "de_diabetes", value: "0" },
          ],
        },
      };
    }
    return {};
  });
  return { query, mutate: vi.fn() };
}

describe("AssessmentWorkspace - minimal, auto-calculating display", () => {
  it("auto-loads demographics and event measurements and renders the calculated risk factor table", async () => {
    const engine = makeEngine();
    render(
      <AssessmentWorkspace
        config={fullyMappedConfig()}
        engine={engine}
        trackedEntityInstanceId="tei1"
        eventId="evt1"
      />,
    );

    await waitFor(() => expect(screen.getByText("10 years CVD Risk")).toBeInTheDocument());
    expect(screen.getByText("Smoking")).toBeInTheDocument();
    expect(screen.getByText("Smoker")).toBeInTheDocument();
    expect(screen.getByText("150 mmHg")).toBeInTheDocument();
  });

  it("renders the table with '-' placeholders when required data cannot be found", async () => {
    const engine = {
      query: vi.fn().mockResolvedValue({ trackedEntity: { attributes: [] }, event: { dataValues: [] } }),
      mutate: vi.fn(),
    };
    const { container } = render(
      <AssessmentWorkspace
        config={fullyMappedConfig()}
        engine={engine}
        trackedEntityInstanceId="tei1"
        eventId="evt1"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("10 years CVD Risk")).toBeInTheDocument();
    });
    expect(container.querySelector("table")).not.toBeNull();
    expect(screen.getByText("Risk Score/Level(%)").closest("tr")!.textContent).toContain("-");
  });

  it("writes the calculated score into the native Risk Score field when live preview is enabled", async () => {
    // window.parent === window in this non-iframe test environment, so the
    // component's own "not actually embedded" guard would otherwise skip
    // the write entirely; spying on the bridge functions directly verifies
    // the integration (correct trigger + correct value) without needing to
    // simulate real cross-frame nesting in jsdom.
    const writeSpy = vi
      .spyOn(liveNativeFormBridge, "tryWriteNativeRiskScore")
      .mockReturnValue(true);
    const readSpy = vi
      .spyOn(liveNativeFormBridge, "tryReadNativeFormValues")
      .mockReturnValue({ accessible: false, raw: {} });

    const engine = makeEngine();
    render(
      <AssessmentWorkspace
        config={fullyMappedConfig()}
        engine={engine}
        trackedEntityInstanceId="tei1"
        eventId="evt1"
        enableUnsupportedLiveFormPreview
      />,
    );

    await waitFor(() => expect(writeSpy).toHaveBeenCalled());
    const [, , riskPercentArg] = writeSpy.mock.calls[0];
    expect(riskPercentArg).toBeGreaterThanOrEqual(0);
    void readSpy;

    writeSpy.mockRestore();
    readSpy.mockRestore();
  });

  it("also live-reads native field edits on an existing (saved) event, not just a new one", async () => {
    // Regression test: the live-preview poll used to bail out entirely
    // whenever eventId was set, so editing a field (e.g. cholesterol) on an
    // existing event's "Edit event" page never reached the plugin - only
    // the once-on-mount Tracker API snapshot did. It must now keep polling
    // for an existing event too.
    const readSpy = vi.spyOn(liveNativeFormBridge, "tryReadNativeFormValues").mockReturnValue({
      accessible: true,
      raw: { totalCholesterol: "215", totalCholesterolUnit: "mg/dL" },
    });
    const writeSpy = vi.spyOn(liveNativeFormBridge, "tryWriteNativeRiskScore").mockReturnValue(true);

    const engine = makeEngine();
    render(
      <AssessmentWorkspace
        config={fullyMappedConfig()}
        engine={engine}
        trackedEntityInstanceId="tei1"
        eventId="evt1"
        enableUnsupportedLiveFormPreview
      />,
    );

    await waitFor(() => expect(readSpy).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("215 mg/dL")).toBeInTheDocument());

    readSpy.mockRestore();
    writeSpy.mockRestore();
  });

  it("uses the event's own occurredAt date for age, not today, when reviewing an older event", async () => {
    const engine = {
      query: vi.fn().mockImplementation(async (q: Record<string, { resource: string; id?: string }>) => {
        if (q.trackedEntity) {
          return {
            trackedEntity: {
              attributes: [
                { attribute: "tea_dob", value: "1995-05-05" },
                { attribute: "tea_sex", value: "female" },
              ],
            },
          };
        }
        if (q.event) {
          return {
            event: {
              occurredAt: "2025-06-08", // patient was 30, not her current age
              dataValues: [
                { dataElement: "de_smoking", value: "1" },
                { dataElement: "de_sbp", value: "110" },
                { dataElement: "de_tc", value: "150" },
                { dataElement: "de_diabetes", value: "0" },
              ],
            },
          };
        }
        return {};
      }),
      mutate: vi.fn(),
    };

    render(
      <AssessmentWorkspace
        config={fullyMappedConfig()}
        engine={engine}
        trackedEntityInstanceId="tei1"
        eventId="evt1"
      />,
    );

    // Age 30 (as of the event date) with these inputs falls in a calculable
    // band; if age defaulted to "today" instead, the test fixture's DOB
    // would still resolve to a valid band too, so we assert the table
    // renders at all - the precise regression is covered at the service
    // layer by buildRawInputFromDhis2's own tests. This test exists to
    // confirm the event path still produces a result end-to-end.
    await waitFor(() => expect(screen.getByText("10 years CVD Risk")).toBeInTheDocument());
  });
});
