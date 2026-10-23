import { describe, expect, it } from "vitest";
import { computeAgeFromDateOfBirth } from "../age";

describe("computeAgeFromDateOfBirth", () => {
  it("computes a simple whole-year difference", () => {
    expect(computeAgeFromDateOfBirth("1970-01-01", "2026-01-01")).toBe(56);
  });

  it("has not yet had this year's birthday", () => {
    expect(computeAgeFromDateOfBirth("1970-06-15", "2026-01-01")).toBe(55);
  });

  it("birthday is today", () => {
    expect(computeAgeFromDateOfBirth("1970-10-23", "2026-10-23")).toBe(56);
  });

  it("returns null for a future date of birth", () => {
    expect(computeAgeFromDateOfBirth("2030-01-01", "2026-01-01")).toBeNull();
  });

  it("returns null for an invalid date string", () => {
    expect(computeAgeFromDateOfBirth("not-a-date", "2026-01-01")).toBeNull();
  });

  it("defaults asOf to today when omitted", () => {
    const result = computeAgeFromDateOfBirth("2000-01-01");
    expect(result).toBeGreaterThan(0);
  });
});
