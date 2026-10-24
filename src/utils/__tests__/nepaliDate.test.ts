import { describe, expect, it } from "vitest";
import { convertNepaliDateToIso, resolveLiveOccurredAtToIso } from "../nepaliDate";

describe("convertNepaliDateToIso", () => {
  it("converts a Bikram Sambat date to its Gregorian ISO 8601 equivalent", () => {
    expect(convertNepaliDateToIso("2082-07-08")).toBe("2025-10-25");
  });

  it("pads single-digit month/day with a leading zero", () => {
    expect(convertNepaliDateToIso("2075-01-01")).toBe("2018-04-14");
  });

  it("returns null for an invalid date string", () => {
    expect(convertNepaliDateToIso("not-a-date")).toBeNull();
  });
});

describe("resolveLiveOccurredAtToIso", () => {
  const referenceDate = new Date("2026-10-24T00:00:00.000Z");

  it("passes a Gregorian date straight through unchanged (Capture app)", () => {
    expect(resolveLiveOccurredAtToIso("2026-10-16", referenceDate)).toBe("2026-10-16");
  });

  it("converts a Nepali (BS) date to Gregorian ISO (eRecord app)", () => {
    expect(resolveLiveOccurredAtToIso("2083-06-30", referenceDate)).toBe("2026-10-16");
  });

  it("returns null for a malformed Gregorian-looking value", () => {
    expect(resolveLiveOccurredAtToIso("not-a-date", referenceDate)).toBeNull();
  });

  it("returns null for an unparseable year", () => {
    expect(resolveLiveOccurredAtToIso("", referenceDate)).toBeNull();
  });
});
