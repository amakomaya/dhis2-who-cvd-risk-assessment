import { describe, expect, it } from "vitest";
import {
  readNativeFormValues,
  tryReadNativeFormValues,
  tryWriteNativeRiskScore,
} from "../liveNativeFormBridge";
import type { CvdRiskConfiguration } from "../../config/schema";

function configFixture(): CvdRiskConfiguration {
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
      outputDataElementIds: {
        riskPercent: "de_risk",
      },
    },
    inputSettings: {
      totalCholesterol: { acceptedUnits: ["mg/dL"] },
      smokingStatus: {
        optionCodeMapping: { "1": "non-smoker", "2": "smoker", "3": "smoker", "4": "non-smoker" },
      },
      diabetesStatus: { optionCodeMapping: { "1": "with", "0": "without" } },
    },
  } as unknown as CvdRiskConfiguration;
}

/** Builds a fake Capture-app-shaped document fragment for a text field. */
function buildTextField(doc: Document, uid: string, value: string) {
  const wrapper = doc.createElement("div");
  wrapper.setAttribute("data-test", `form-field-${uid}`);
  const input = doc.createElement("input");
  input.type = "text";
  input.value = value;
  wrapper.appendChild(input);
  doc.body.appendChild(wrapper);
  return input;
}

/** Builds a fake native radio group for a data element. */
function buildRadioField(doc: Document, uid: string, options: Array<[string, boolean]>) {
  for (const [value, checked] of options) {
    const input = doc.createElement("input");
    input.type = "radio";
    input.name = uid;
    input.value = value;
    input.checked = checked;
    doc.body.appendChild(input);
  }
}

describe("readNativeFormValues", () => {
  it("reads text fields via their data-test=form-field-<uid> wrapper", () => {
    const doc = document.implementation.createHTMLDocument("test");
    buildTextField(doc, "de_sbp", "140");
    buildTextField(doc, "de_tc", "180");
    buildTextField(doc, "de_height", "160");
    buildTextField(doc, "de_weight", "60");

    const raw = readNativeFormValues(doc, configFixture());
    expect(raw.systolicBloodPressureMmHg).toBe("140");
    expect(raw.totalCholesterol).toBe("180");
    expect(raw.heightCm).toBe("160");
    expect(raw.weightKg).toBe("60");
    expect(raw.totalCholesterolUnit).toBe("mg/dL");
  });

  it("reads the checked radio value and maps it through the configured option codes", () => {
    const doc = document.implementation.createHTMLDocument("test");
    buildRadioField(doc, "de_smoking", [
      ["1", false],
      ["2", true],
      ["3", false],
      ["4", false],
    ]);
    buildRadioField(doc, "de_diabetes", [
      ["1", false],
      ["0", true],
    ]);

    const raw = readNativeFormValues(doc, configFixture());
    expect(raw.smokingStatus).toBe("smoker");
    expect(raw.diabetesStatus).toBe("without");
  });

  it("leaves a field undefined when nothing is filled in yet, never guessing a value", () => {
    const doc = document.implementation.createHTMLDocument("test");
    const raw = readNativeFormValues(doc, configFixture());
    expect(raw.systolicBloodPressureMmHg).toBeUndefined();
    expect(raw.smokingStatus).toBeUndefined();
  });

  it("leaves smokingStatus undefined for an unmapped radio code instead of guessing", () => {
    const doc = document.implementation.createHTMLDocument("test");
    buildRadioField(doc, "de_smoking", [["9", true]]);
    const raw = readNativeFormValues(doc, configFixture());
    expect(raw.smokingStatus).toBeUndefined();
  });
});

describe("tryReadNativeFormValues", () => {
  it("reports accessible:false and empty raw when the host document is unavailable", () => {
    const result = tryReadNativeFormValues(null, configFixture());
    expect(result).toEqual({ accessible: false, raw: {} });
  });

  it("reports accessible:true with real values when the host window is reachable", () => {
    const doc = document.implementation.createHTMLDocument("test");
    buildTextField(doc, "de_sbp", "130");
    const fakeWindow = { document: doc } as unknown as Window;
    const result = tryReadNativeFormValues(fakeWindow, configFixture());
    expect(result.accessible).toBe(true);
    expect(result.raw.systolicBloodPressureMmHg).toBe("130");
  });

  it("reads the event's own date (occurredAt) from its data-test=dataentry-field-occurredAt wrapper and converts it from Nepali (BS) to Gregorian (ISO)", () => {
    // Confirmed via live inspection of the Capture app's DOM (erecord.hmis.gov.np,
    // 2026-10-23): this is a fixed data-test attribute, not keyed by a data
    // element UID, since the event date isn't a tracked data value. This
    // deployment displays the field in the Nepali (Bikram Sambat) calendar,
    // so the raw DOM value ("2082-07-08" BS) must come back converted to its
    // Gregorian equivalent ("2025-10-25").
    const doc = document.implementation.createHTMLDocument("test");
    const wrapper = doc.createElement("div");
    wrapper.setAttribute("data-test", "dataentry-field-occurredAt");
    const input = doc.createElement("input");
    input.value = "2082-07-08";
    wrapper.appendChild(input);
    doc.body.appendChild(wrapper);
    const fakeWindow = { document: doc } as unknown as Window;
    const result = tryReadNativeFormValues(fakeWindow, configFixture());
    expect(result.occurredAtIso).toBe("2025-10-25");
  });

  it("leaves a Gregorian-displayed date (standard Capture app) unchanged, not misread as Nepali", () => {
    // Confirmed via live inspection on 2026-10-24: the standard Capture app
    // (/apps/capture) displays this field in Gregorian, matching the
    // instance's "iso8601" system calendar setting - unlike eRecord, which
    // overrides it to Nepali regardless of that setting. A Gregorian value
    // here must pass through unconverted, or age math would be corrupted
    // for Capture-app users.
    const doc = document.implementation.createHTMLDocument("test");
    const wrapper = doc.createElement("div");
    wrapper.setAttribute("data-test", "dataentry-field-occurredAt");
    const input = doc.createElement("input");
    input.value = "2026-10-16";
    wrapper.appendChild(input);
    doc.body.appendChild(wrapper);
    const fakeWindow = { document: doc } as unknown as Window;
    const result = tryReadNativeFormValues(fakeWindow, configFixture());
    expect(result.occurredAtIso).toBe("2026-10-16");
  });

  it("leaves occurredAtIso undefined when the event date hasn't been entered yet", () => {
    const doc = document.implementation.createHTMLDocument("test");
    const fakeWindow = { document: doc } as unknown as Window;
    const result = tryReadNativeFormValues(fakeWindow, configFixture());
    expect(result.occurredAtIso).toBeUndefined();
  });

  it("degrades to accessible:false instead of throwing when access itself errors", () => {
    const hostileWindow = {
      get document(): never {
        throw new Error("cross-origin access denied");
      },
    } as unknown as Window;
    const result = tryReadNativeFormValues(hostileWindow, configFixture());
    expect(result).toEqual({ accessible: false, raw: {} });
  });
});

describe("tryWriteNativeRiskScore", () => {
  it("sets the native risk score field's value and fires an input event", () => {
    const doc = document.implementation.createHTMLDocument("test");
    const input = buildTextField(doc, "de_risk", "");
    let inputEventFired = false;
    input.addEventListener("input", () => {
      inputEventFired = true;
    });
    const fakeWindow = { document: doc, HTMLInputElement } as unknown as Window;

    const wrote = tryWriteNativeRiskScore(fakeWindow, configFixture(), 18);

    expect(wrote).toBe(true);
    expect(input.value).toBe("18");
    expect(inputEventFired).toBe(true);
  });

  it("returns false without throwing when the risk score field cannot be found", () => {
    const doc = document.implementation.createHTMLDocument("test");
    const fakeWindow = { document: doc, HTMLInputElement } as unknown as Window;
    const wrote = tryWriteNativeRiskScore(fakeWindow, configFixture(), 18);
    expect(wrote).toBe(false);
  });

  it("returns false without throwing when the host window is unavailable", () => {
    const wrote = tryWriteNativeRiskScore(null, configFixture(), 18);
    expect(wrote).toBe(false);
  });
});
