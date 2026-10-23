import { describe, expect, it } from "vitest";
import { applyAgeScreeningPolicy } from "../ageEligibilityPolicy";

describe("applyAgeScreeningPolicy", () => {
  it.each([0, 10, 17])("marks age %i as ineligible (under 18)", (age) => {
    const result = applyAgeScreeningPolicy(age);
    expect(result).toMatchObject({ eligible: false, reason: "UNDER_MINIMUM_SCREENING_AGE" });
  });

  it.each([18, 25, 39, 40])("clamps age %i (18-40) up to chart age 40", (age) => {
    const result = applyAgeScreeningPolicy(age);
    expect(result).toMatchObject({ eligible: true, chartAge: 40 });
  });

  it.each([41, 55, 74, 79])("passes age %i (41-79) through unchanged", (age) => {
    const result = applyAgeScreeningPolicy(age);
    expect(result).toMatchObject({ eligible: true, chartAge: age });
  });

  it.each([80, 90, 120])("clamps age %i (above 79) down to chart age 79", (age) => {
    const result = applyAgeScreeningPolicy(age);
    expect(result).toMatchObject({ eligible: true, chartAge: 79 });
  });

  it("always preserves the true age alongside the chart age", () => {
    const result = applyAgeScreeningPolicy(25);
    expect(result).toMatchObject({ trueAge: 25, chartAge: 40 });
  });
});
