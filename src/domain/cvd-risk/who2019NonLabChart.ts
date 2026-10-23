/**
 * Typed accessor over the WHO 2019 South Asia non-laboratory-based (BMI)
 * CVD risk chart.
 *
 * Source of truth: reference/who-2019-south-asia-lab-chart.pdf, page 2
 * ("WHO cardiovascular disease risk non-laboratory-based charts", South
 * Asia region). Extracted programmatically the same way as the
 * laboratory-based chart — see reference/build_nonlab_chart.py and
 * docs/clinical-validation-report.md.
 *
 * This chart has no diabetes split (unlike the laboratory-based chart) and
 * uses BMI in place of total cholesterol. It exists specifically for the
 * case WHO itself documents: when a laboratory total-cholesterol
 * measurement is unavailable, BMI-based risk assessment is used instead.
 * This module performs no calculation beyond direct table lookup — no
 * interpolation or extrapolation outside the chart's defined bands.
 */
import chartRows from "./who2019SouthAsiaNonLabChart.data.json";
import type { Sex, SmokingStatus } from "./types";
import { MAX_LOOKUP_AGE, MAX_SUPPORTED_AGE, MIN_SUPPORTED_AGE, sbpToBand } from "./who2019LaboratoryChart";

export interface NonLabChartRow {
  ageBand: string;
  sbpBand: string;
  sex: Sex;
  smoking: SmokingStatus;
  bmiBand: string;
  riskPercent: number;
}

const ROWS = chartRows as NonLabChartRow[];

export const SUPPORTED_BMI_BANDS = ["<20", "20-24", "25-29", "30-35", "≥35"] as const;

/** Maps age in completed years to the chart's 5-year age band; mirrors who2019LaboratoryChart's ageToBand. */
export function ageToBand(age: number): string | null {
  if (!Number.isInteger(age) || age < MIN_SUPPORTED_AGE || age > MAX_LOOKUP_AGE) {
    return null;
  }
  if (age > MAX_SUPPORTED_AGE) {
    return "70-74";
  }
  const lowerBound = Math.floor((age - 40) / 5) * 5 + 40;
  const upperBound = Math.min(lowerBound + 4, MAX_SUPPORTED_AGE);
  return `${lowerBound}-${upperBound}`;
}

/** Maps a body mass index (kg/m^2) to the chart's BMI band. */
export function bmiToBand(bmi: number): string | null {
  if (!Number.isFinite(bmi) || bmi < 0) return null;
  if (bmi < 20) return "<20";
  if (bmi < 25) return "20-24";
  if (bmi < 30) return "25-29";
  if (bmi <= 35) return "30-35";
  return "≥35";
}

export interface NonLabChartLookupInput {
  age: number;
  sex: Sex;
  smokingStatus: SmokingStatus;
  systolicBloodPressureMmHg: number;
  bmi: number;
}

export interface NonLabChartLookupResult {
  found: true;
  riskPercent: number;
  row: NonLabChartRow;
}

export interface NonLabChartLookupMiss {
  found: false;
  reason: "AGE_OUT_OF_RANGE" | "SBP_OUT_OF_RANGE" | "BMI_OUT_OF_RANGE" | "CELL_NOT_FOUND";
}

export function lookupNonLabChartCell(
  input: NonLabChartLookupInput,
): NonLabChartLookupResult | NonLabChartLookupMiss {
  const ageBand = ageToBand(input.age);
  if (!ageBand) return { found: false, reason: "AGE_OUT_OF_RANGE" };

  const sbpBand = sbpToBand(input.systolicBloodPressureMmHg);
  if (!sbpBand) return { found: false, reason: "SBP_OUT_OF_RANGE" };

  const bmiBand = bmiToBand(input.bmi);
  if (!bmiBand) return { found: false, reason: "BMI_OUT_OF_RANGE" };

  const row = ROWS.find(
    (r) =>
      r.ageBand === ageBand &&
      r.sbpBand === sbpBand &&
      r.bmiBand === bmiBand &&
      r.sex === input.sex &&
      r.smoking === input.smokingStatus,
  );

  if (!row) return { found: false, reason: "CELL_NOT_FOUND" };

  return { found: true, riskPercent: row.riskPercent, row };
}

export function getNonLabChartRowCount(): number {
  return ROWS.length;
}
