/**
 * Typed accessor over the WHO 2019 South Asia laboratory-based CVD risk chart.
 *
 * Source of truth: south-asia_Nepal.pdf (WHO CVD risk laboratory-based charts,
 * South Asia region: Bangladesh, Bhutan, India, Nepal, Pakistan), page 1.
 * See reference/who-2019-south-asia-lab-chart.pdf and
 * docs/clinical-validation-report.md for extraction and verification method.
 *
 * This module performs no calculation beyond direct table lookup. It never
 * interpolates or extrapolates outside the chart's defined bands.
 */
import chartRows from "./who2019SouthAsiaLabChart.data.json";
import type { DiabetesStatus, Sex, SmokingStatus } from "./types";

export interface ChartRow {
  ageBand: string;
  sbpBand: string;
  diabetes: DiabetesStatus;
  sex: Sex;
  smoking: SmokingStatus;
  totalCholesterolBand: string;
  riskPercent: number;
}

const ROWS = chartRows as ChartRow[];

export const SUPPORTED_AGE_BANDS = [
  "40-44",
  "45-49",
  "50-54",
  "55-59",
  "60-64",
  "65-69",
  "70-74",
] as const;

export const MIN_SUPPORTED_AGE = 40;
/** The chart's own literal ceiling: the oldest defined age band is 70-74. */
export const MAX_SUPPORTED_AGE = 74;
/**
 * Ages above MAX_SUPPORTED_AGE are not extrapolated with new math; per WHO
 * guidance, when a patient's age exceeds the chart's oldest defined band,
 * the oldest band (70-74) is applied instead of leaving risk unavailable.
 * This extended ceiling is a deployment screening-eligibility policy (see
 * src/domain/cvd-risk/ageEligibilityPolicy.ts), not a chart calculation.
 */
export const MAX_LOOKUP_AGE = 79;

export const SUPPORTED_SBP_BANDS = [
  "<120",
  "120-139",
  "140-159",
  "160-179",
  "≥180",
] as const;

export const SUPPORTED_TOTAL_CHOLESTEROL_BANDS = [
  "<4",
  "4-4.9",
  "5-5.9",
  "6-6.9",
  "≥7",
] as const;

/** Minimum/maximum total cholesterol (mmol/L) the chart defines a band for. */
export const MIN_SUPPORTED_TOTAL_CHOLESTEROL_MMOL = 0; // "<4" has no lower bound in the chart
export const MAX_SUPPORTED_TOTAL_CHOLESTEROL_MMOL = Number.POSITIVE_INFINITY; // "≥7" has no upper bound

/**
 * Maps an age in completed years to the chart's 5-year age band.
 * Returns null if the age falls outside the chart's supported 40-74 range.
 */
export function ageToBand(age: number): string | null {
  if (!Number.isInteger(age) || age < MIN_SUPPORTED_AGE || age > MAX_LOOKUP_AGE) {
    return null;
  }
  if (age > MAX_SUPPORTED_AGE) {
    // Ages 75-79: reuse the oldest chart band (70-74) rather than extrapolate.
    return "70-74";
  }
  const lowerBound = Math.floor((age - 40) / 5) * 5 + 40;
  const upperBound = Math.min(lowerBound + 4, MAX_SUPPORTED_AGE);
  return `${lowerBound}-${upperBound}`;
}

/** Maps a systolic blood pressure in mmHg to the chart's SBP band. */
export function sbpToBand(sbpMmHg: number): string | null {
  if (!Number.isFinite(sbpMmHg) || sbpMmHg < 0) return null;
  if (sbpMmHg < 120) return "<120";
  if (sbpMmHg < 140) return "120-139";
  if (sbpMmHg < 160) return "140-159";
  if (sbpMmHg < 180) return "160-179";
  return "≥180";
}

/** Maps total cholesterol in mmol/L to the chart's TC band. */
export function totalCholesterolToBand(tcMmolPerL: number): string | null {
  if (!Number.isFinite(tcMmolPerL) || tcMmolPerL < 0) return null;
  if (tcMmolPerL < 4) return "<4";
  if (tcMmolPerL < 5) return "4-4.9";
  if (tcMmolPerL < 6) return "5-5.9";
  if (tcMmolPerL < 7) return "6-6.9";
  return "≥7";
}

export interface ChartLookupInput {
  age: number;
  sex: Sex;
  smokingStatus: SmokingStatus;
  systolicBloodPressureMmHg: number;
  totalCholesterolMmolPerL: number;
  diabetesStatus: DiabetesStatus;
}

export interface ChartLookupResult {
  found: true;
  riskPercent: number;
  row: ChartRow;
}

export interface ChartLookupMiss {
  found: false;
  reason: "AGE_OUT_OF_RANGE" | "SBP_OUT_OF_RANGE" | "TOTAL_CHOLESTEROL_OUT_OF_RANGE" | "CELL_NOT_FOUND";
}

/**
 * Looks up the exact chart cell for the given inputs. Never interpolates or
 * extrapolates: out-of-range inputs return a typed miss instead of a guess.
 */
export function lookupChartCell(
  input: ChartLookupInput,
): ChartLookupResult | ChartLookupMiss {
  const ageBand = ageToBand(input.age);
  if (!ageBand) return { found: false, reason: "AGE_OUT_OF_RANGE" };

  const sbpBand = sbpToBand(input.systolicBloodPressureMmHg);
  if (!sbpBand) return { found: false, reason: "SBP_OUT_OF_RANGE" };

  const tcBand = totalCholesterolToBand(input.totalCholesterolMmolPerL);
  if (!tcBand) return { found: false, reason: "TOTAL_CHOLESTEROL_OUT_OF_RANGE" };

  const row = ROWS.find(
    (r) =>
      r.ageBand === ageBand &&
      r.sbpBand === sbpBand &&
      r.totalCholesterolBand === tcBand &&
      r.sex === input.sex &&
      r.smoking === input.smokingStatus &&
      r.diabetes === input.diabetesStatus,
  );

  if (!row) return { found: false, reason: "CELL_NOT_FOUND" };

  return { found: true, riskPercent: row.riskPercent, row };
}

export function riskPercentToCategory(riskPercent: number) {
  if (riskPercent < 5) return "under-5" as const;
  if (riskPercent < 10) return "5-to-under-10" as const;
  if (riskPercent < 20) return "10-to-under-20" as const;
  if (riskPercent < 30) return "20-to-under-30" as const;
  return "30-or-more" as const;
}

export function getChartRowCount(): number {
  return ROWS.length;
}
