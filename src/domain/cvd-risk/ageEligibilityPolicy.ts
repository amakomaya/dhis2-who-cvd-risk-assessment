/**
 * Deployment screening-eligibility policy, layered on top of (not inside)
 * the literal WHO chart engine. These clamping rules were specified
 * explicitly by the deployment (not invented, not part of the WHO chart
 * itself):
 *
 *   - Under 18: not eligible for this CVD risk screening at all.
 *   - 18 up to and including 40: scored using chart age 40 (the chart's
 *     youngest defined band), a deliberate conservative simplification for
 *     young adults rather than a declaration that risk is unmeasurable.
 *   - Above 79: scored using chart age 79, which the chart engine itself
 *     resolves to the oldest defined band (70-74) — see MAX_LOOKUP_AGE and
 *     ageToBand in who2019LaboratoryChart.ts, which implements WHO's own
 *     published guidance to reuse the oldest band beyond the chart's range.
 *   - 41 to 79: passed through unchanged.
 *
 * This module only decides *which age value* feeds the chart lookup. It
 * never touches risk percentages, categories, or chart cells itself.
 */

export const MINIMUM_SCREENING_AGE = 18;
export const YOUNG_ADULT_CHART_AGE = 40;
export const MAXIMUM_SCREENING_CHART_AGE = 79;

export type AgeScreeningResult =
  | { eligible: true; trueAge: number; chartAge: number }
  | { eligible: false; reason: "UNDER_MINIMUM_SCREENING_AGE"; trueAge: number };

export function applyAgeScreeningPolicy(trueAge: number): AgeScreeningResult {
  if (trueAge < MINIMUM_SCREENING_AGE) {
    return { eligible: false, reason: "UNDER_MINIMUM_SCREENING_AGE", trueAge };
  }
  if (trueAge <= YOUNG_ADULT_CHART_AGE) {
    return { eligible: true, trueAge, chartAge: YOUNG_ADULT_CHART_AGE };
  }
  if (trueAge > MAXIMUM_SCREENING_CHART_AGE) {
    return { eligible: true, trueAge, chartAge: MAXIMUM_SCREENING_CHART_AGE };
  }
  return { eligible: true, trueAge, chartAge: trueAge };
}
