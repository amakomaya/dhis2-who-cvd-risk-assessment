import { describe, expect, it } from "vitest";
import {
  ageToBand,
  bmiToBand,
  getNonLabChartRowCount,
  lookupNonLabChartCell,
  SUPPORTED_BMI_BANDS,
} from "../who2019NonLabChart";

describe("who2019NonLabChart data integrity", () => {
  it("contains exactly 700 cells: 7 age bands x 5 SBP x 2 sex x 2 smoking x 5 BMI (no diabetes split)", () => {
    expect(getNonLabChartRowCount()).toBe(700);
  });

  it("has 5 supported BMI bands", () => {
    expect(SUPPORTED_BMI_BANDS).toHaveLength(5);
  });
});

describe("ageToBand (non-lab chart)", () => {
  it.each([
    [40, "40-44"],
    [74, "70-74"],
    [77, "70-74"],
    [79, "70-74"],
  ])("maps age %i to band %s", (age, band) => {
    expect(ageToBand(age)).toBe(band);
  });

  it("returns null below 40 or above 79", () => {
    expect(ageToBand(39)).toBeNull();
    expect(ageToBand(80)).toBeNull();
  });
});

describe("bmiToBand", () => {
  it.each([
    [18, "<20"],
    [22, "20-24"],
    [27, "25-29"],
    [32, "30-35"],
    [35, "30-35"],
    [36, "≥35"],
  ])("maps BMI %f to band %s", (bmi, band) => {
    expect(bmiToBand(bmi)).toBe(band);
  });
});

describe("lookupNonLabChartCell - reference cases verified against the source PDF", () => {
  it("age 70-74, SBP>=180, male non-smoker, BMI<20 -> 24%", () => {
    const result = lookupNonLabChartCell({
      age: 70,
      sex: "male",
      smokingStatus: "non-smoker",
      systolicBloodPressureMmHg: 185,
      bmi: 18,
    });
    expect(result).toMatchObject({ found: true, riskPercent: 24 });
  });

  it("age 70-74, SBP>=180, male non-smoker, BMI>=35 -> 32%", () => {
    const result = lookupNonLabChartCell({
      age: 70,
      sex: "male",
      smokingStatus: "non-smoker",
      systolicBloodPressureMmHg: 190,
      bmi: 40,
    });
    expect(result).toMatchObject({ found: true, riskPercent: 32 });
  });

  it("age 70-74, SBP>=180, female smoker, BMI>=35 -> 33%", () => {
    const result = lookupNonLabChartCell({
      age: 72,
      sex: "female",
      smokingStatus: "smoker",
      systolicBloodPressureMmHg: 200,
      bmi: 40,
    });
    expect(result).toMatchObject({ found: true, riskPercent: 33 });
  });

  it("age 40-44, SBP<120, female non-smoker, BMI<20 -> 1% (lowest cell on chart)", () => {
    const result = lookupNonLabChartCell({
      age: 41,
      sex: "female",
      smokingStatus: "non-smoker",
      systolicBloodPressureMmHg: 110,
      bmi: 18,
    });
    expect(result).toMatchObject({ found: true, riskPercent: 1 });
  });

  it("age 40-44, SBP<120, male smoker, BMI>=35 -> 6%", () => {
    const result = lookupNonLabChartCell({
      age: 42,
      sex: "male",
      smokingStatus: "smoker",
      systolicBloodPressureMmHg: 115,
      bmi: 40,
    });
    expect(result).toMatchObject({ found: true, riskPercent: 6 });
  });

  it("returns a miss outside the supported age range", () => {
    const result = lookupNonLabChartCell({
      age: 30,
      sex: "male",
      smokingStatus: "non-smoker",
      systolicBloodPressureMmHg: 120,
      bmi: 25,
    });
    expect(result).toMatchObject({ found: false, reason: "AGE_OUT_OF_RANGE" });
  });
});
