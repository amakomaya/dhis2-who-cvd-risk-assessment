import { describe, expect, it } from "vitest";
import {
  ageToBand,
  getChartRowCount,
  lookupChartCell,
  riskPercentToCategory,
  sbpToBand,
  SUPPORTED_AGE_BANDS,
  totalCholesterolToBand,
} from "../who2019LaboratoryChart";

describe("who2019LaboratoryChart data integrity", () => {
  it("contains exactly 1400 cells: 7 age bands x 5 SBP x 2 diabetes x 2 sex x 2 smoking x 5 TC", () => {
    expect(getChartRowCount()).toBe(1400);
  });

  it("has 7 supported age bands", () => {
    expect(SUPPORTED_AGE_BANDS).toHaveLength(7);
  });
});

describe("ageToBand", () => {
  it.each([
    [40, "40-44"],
    [44, "40-44"],
    [45, "45-49"],
    [59, "55-59"],
    [60, "60-64"],
    [74, "70-74"],
  ])("maps age %i to band %s", (age, band) => {
    expect(ageToBand(age)).toBe(band);
  });

  it("returns null below 40", () => {
    expect(ageToBand(39)).toBeNull();
  });

  it.each([
    [75, "70-74"],
    [79, "70-74"],
  ])(
    "reuses the oldest band (70-74) for age %i, per WHO guidance for ages above the chart's ceiling",
    (age, band) => {
      expect(ageToBand(age)).toBe(band);
    },
  );

  it("returns null above the extended lookup ceiling (79)", () => {
    expect(ageToBand(80)).toBeNull();
  });

  it("returns null for non-integer ages", () => {
    expect(ageToBand(44.5)).toBeNull();
  });
});

describe("sbpToBand", () => {
  it.each([
    [100, "<120"],
    [119, "<120"],
    [120, "120-139"],
    [139, "120-139"],
    [140, "140-159"],
    [159, "140-159"],
    [160, "160-179"],
    [179, "160-179"],
    [180, "≥180"],
    [220, "≥180"],
  ])("maps SBP %i to band %s", (sbp, band) => {
    expect(sbpToBand(sbp)).toBe(band);
  });
});

describe("totalCholesterolToBand", () => {
  it.each([
    [3.5, "<4"],
    [4, "4-4.9"],
    [4.9, "4-4.9"],
    [5, "5-5.9"],
    [5.9, "5-5.9"],
    [6, "6-6.9"],
    [6.9, "6-6.9"],
    [7, "≥7"],
    [9, "≥7"],
  ])("maps TC %f mmol/L to band %s", (tc, band) => {
    expect(totalCholesterolToBand(tc)).toBe(band);
  });
});

describe("lookupChartCell - reference cases verified against south-asia_Nepal.pdf", () => {
  it("age 70-74, SBP>=180, without diabetes, male non-smoker, TC<4 -> 22%", () => {
    const result = lookupChartCell({
      age: 70,
      sex: "male",
      smokingStatus: "non-smoker",
      systolicBloodPressureMmHg: 185,
      totalCholesterolMmolPerL: 3.9,
      diabetesStatus: "without",
    });
    expect(result).toMatchObject({ found: true, riskPercent: 22 });
  });

  it("age 70-74, SBP>=180, without diabetes, male non-smoker, TC>=7 -> 33%", () => {
    const result = lookupChartCell({
      age: 70,
      sex: "male",
      smokingStatus: "non-smoker",
      systolicBloodPressureMmHg: 190,
      totalCholesterolMmolPerL: 8,
      diabetesStatus: "without",
    });
    expect(result).toMatchObject({ found: true, riskPercent: 33 });
  });

  it("age 70-74, SBP>=180, with diabetes, female smoker, TC>=7 -> 44%", () => {
    const result = lookupChartCell({
      age: 72,
      sex: "female",
      smokingStatus: "smoker",
      systolicBloodPressureMmHg: 200,
      totalCholesterolMmolPerL: 7.5,
      diabetesStatus: "with",
    });
    expect(result).toMatchObject({ found: true, riskPercent: 44 });
  });

  it("age 40-44, SBP<120, without diabetes, female non-smoker, TC<4 -> 1% (lowest cell on chart)", () => {
    const result = lookupChartCell({
      age: 41,
      sex: "female",
      smokingStatus: "non-smoker",
      systolicBloodPressureMmHg: 110,
      totalCholesterolMmolPerL: 3.5,
      diabetesStatus: "without",
    });
    expect(result).toMatchObject({ found: true, riskPercent: 1 });
  });

  it("age 40-44, SBP<120, with diabetes, male smoker, TC>=7 -> 12%", () => {
    const result = lookupChartCell({
      age: 42,
      sex: "male",
      smokingStatus: "smoker",
      systolicBloodPressureMmHg: 115,
      totalCholesterolMmolPerL: 7.2,
      diabetesStatus: "with",
    });
    expect(result).toMatchObject({ found: true, riskPercent: 12 });
  });

  it("returns a miss (not an extrapolated guess) outside the supported age range", () => {
    const result = lookupChartCell({
      age: 30,
      sex: "male",
      smokingStatus: "non-smoker",
      systolicBloodPressureMmHg: 120,
      totalCholesterolMmolPerL: 5,
      diabetesStatus: "without",
    });
    expect(result).toMatchObject({ found: false, reason: "AGE_OUT_OF_RANGE" });
  });
});

describe("riskPercentToCategory boundaries", () => {
  it.each([
    [0, "under-5"],
    [4, "under-5"],
    [5, "5-to-under-10"],
    [9, "5-to-under-10"],
    [10, "10-to-under-20"],
    [19, "10-to-under-20"],
    [20, "20-to-under-30"],
    [29, "20-to-under-30"],
    [30, "30-or-more"],
    [54, "30-or-more"],
  ])("categorizes %i%% as %s", (pct, category) => {
    expect(riskPercentToCategory(pct)).toBe(category);
  });
});
