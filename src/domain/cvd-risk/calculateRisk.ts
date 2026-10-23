/**
 * calculateCvdRisk: the single deterministic entry point for CVD risk scoring.
 *
 * Pure, synchronous, no network/AI calls, no React or DHIS2 dependency.
 * Returns an "unavailable" result (never a fabricated/default risk) whenever
 * inputs are invalid, incomplete, or fall outside the validated chart range.
 *
 * Uses the WHO laboratory-based chart (total cholesterol) when cholesterol
 * is provided; falls back to WHO's own non-laboratory-based (BMI) chart
 * when cholesterol is absent but height and weight are available. This
 * fallback is WHO's documented chart, not an invented substitution — see
 * docs/clinical-validation-report.md.
 */
import {
  ALGORITHM_VERSION,
  LAB_CHART_VERSION,
  NONLAB_CHART_VERSION,
  WHO_METHODOLOGY_ID,
} from "./types";
import type { CvdRiskRawInput, CvdRiskResult } from "./types";
import { findMissingMeasurements, validateCvdRiskInputs } from "./validateInputs";
import { lookupChartCell, riskPercentToCategory } from "./who2019LaboratoryChart";
import { lookupNonLabChartCell } from "./who2019NonLabChart";
import { applyAgeScreeningPolicy, MINIMUM_SCREENING_AGE } from "./ageEligibilityPolicy";

export interface CalculateRiskMethodology {
  /** Must match WHO_METHODOLOGY_ID; present so callers/config can assert compatibility. */
  id: typeof WHO_METHODOLOGY_ID;
  chartRegion: "south-asia";
}

export const DEFAULT_METHODOLOGY: CalculateRiskMethodology = {
  id: WHO_METHODOLOGY_ID,
  chartRegion: "south-asia",
};

function unavailable(params: {
  reason: CvdRiskResult["unavailableReason"];
  message: string;
  chartType?: CvdRiskResult["chartType"];
  validationErrors?: CvdRiskResult["validationErrors"];
  missingMeasurements?: CvdRiskResult["missingMeasurements"];
}): CvdRiskResult {
  const chartType = params.chartType ?? "laboratory-based";
  return {
    status: "unavailable",
    methodology: WHO_METHODOLOGY_ID,
    chartRegion: "south-asia",
    chartType,
    chartVersion: chartType === "laboratory-based" ? LAB_CHART_VERSION : NONLAB_CHART_VERSION,
    algorithmVersion: ALGORITHM_VERSION,
    validationErrors: params.validationErrors ?? [],
    missingMeasurements: params.missingMeasurements ?? [],
    unavailableReason: params.reason,
    message: params.message,
  };
}

export function calculateCvdRisk(
  rawInput: CvdRiskRawInput,
  methodology: CalculateRiskMethodology = DEFAULT_METHODOLOGY,
): CvdRiskResult {
  if (methodology.id !== WHO_METHODOLOGY_ID || methodology.chartRegion !== "south-asia") {
    return unavailable({
      reason: "METHODOLOGY_NOT_CONFIGURED",
      message:
        "The configured clinical methodology or chart region is not supported by this engine. No risk was calculated.",
    });
  }

  const missing = findMissingMeasurements(rawInput);
  const validation = validateCvdRiskInputs(rawInput);

  if (!validation.valid || !validation.input) {
    // Validation failed before a chart pathway could be confirmed, but the
    // raw input still tells us which one was *attempted* - the lab chart
    // requires BOTH cholesterol and diabetes status (same fork rule as
    // validateCvdRiskInputs's useLabPathway), otherwise BMI when
    // height+weight were given. Without this, every unavailable result
    // defaulted to the lab chart, so a patient missing lab data entirely but
    // mid-entry on height/weight would never see the BMI row in the UI.
    const cholesterolAttempted =
      rawInput.totalCholesterol !== undefined && rawInput.totalCholesterol !== null && rawInput.totalCholesterol !== "";
    const diabetesAttempted =
      rawInput.diabetesStatus !== undefined && rawInput.diabetesStatus !== null && rawInput.diabetesStatus !== "";
    const heightWeightAttempted =
      rawInput.heightCm !== undefined &&
      rawInput.heightCm !== null &&
      rawInput.heightCm !== "" &&
      rawInput.weightKg !== undefined &&
      rawInput.weightKg !== null &&
      rawInput.weightKg !== "";
    const useLabPathwayAttempted = cholesterolAttempted && diabetesAttempted;
    const attemptedChartType: CvdRiskResult["chartType"] =
      !useLabPathwayAttempted && heightWeightAttempted ? "non-laboratory-based" : "laboratory-based";

    return unavailable({
      chartType: attemptedChartType,
      reason: missing.length > 0 ? "MISSING_REQUIRED_MEASUREMENTS" : "VALIDATION_FAILED",
      message:
        missing.length > 0
          ? "Required clinical measurements are missing. Risk cannot be calculated until all fields are provided."
          : "One or more inputs failed validation. Risk cannot be calculated until all values are corrected.",
      validationErrors: validation.errors,
      missingMeasurements: missing,
    });
  }

  const input = validation.input;

  if (input.chartType === "laboratory-based") {
    const lookup = lookupChartCell({
      age: input.age,
      sex: input.sex,
      smokingStatus: input.smokingStatus,
      systolicBloodPressureMmHg: input.systolicBloodPressureMmHg,
      totalCholesterolMmolPerL: input.totalCholesterolMmolPerL,
      diabetesStatus: input.diabetesStatus,
    });

    if (!lookup.found) {
      const reason = lookup.reason === "AGE_OUT_OF_RANGE" ? "UNSUPPORTED_AGE_FOR_CHART" : "CHART_CELL_NOT_FOUND";
      return {
        status: "unavailable",
        methodology: WHO_METHODOLOGY_ID,
        chartRegion: "south-asia",
        chartType: "laboratory-based",
        chartVersion: LAB_CHART_VERSION,
        algorithmVersion: ALGORITHM_VERSION,
        inputsUsed: input,
        validationErrors: [],
        missingMeasurements: [],
        unavailableReason: reason,
        message:
          lookup.reason === "AGE_OUT_OF_RANGE"
            ? "This WHO chart only supports ages 40-79 (ages above 74 use the oldest defined band). Risk cannot be estimated outside that range."
            : "No validated chart cell matches these inputs. Risk was not estimated rather than extrapolated.",
      };
    }

    return {
      status: "calculated",
      methodology: WHO_METHODOLOGY_ID,
      chartRegion: "south-asia",
      chartType: "laboratory-based",
      chartVersion: LAB_CHART_VERSION,
      algorithmVersion: ALGORITHM_VERSION,
      riskPercent: lookup.riskPercent,
      riskCategory: riskPercentToCategory(lookup.riskPercent),
      inputsUsed: input,
      validationErrors: [],
      missingMeasurements: [],
      message:
        "Estimated 10-year cardiovascular disease risk based on the WHO 2019 South Asia laboratory-based chart. This is a risk estimate, not a diagnosis.",
    };
  }

  // Non-laboratory-based (BMI) pathway.
  const lookup = lookupNonLabChartCell({
    age: input.age,
    sex: input.sex,
    smokingStatus: input.smokingStatus,
    systolicBloodPressureMmHg: input.systolicBloodPressureMmHg,
    bmi: input.bmi,
  });

  if (!lookup.found) {
    const reason = lookup.reason === "AGE_OUT_OF_RANGE" ? "UNSUPPORTED_AGE_FOR_CHART" : "CHART_CELL_NOT_FOUND";
    return {
      status: "unavailable",
      methodology: WHO_METHODOLOGY_ID,
      chartRegion: "south-asia",
      chartType: "non-laboratory-based",
      chartVersion: NONLAB_CHART_VERSION,
      algorithmVersion: ALGORITHM_VERSION,
      inputsUsed: input,
      validationErrors: [],
      missingMeasurements: [],
      unavailableReason: reason,
      message:
        lookup.reason === "AGE_OUT_OF_RANGE"
          ? "This WHO chart only supports ages 40-79 (ages above 74 use the oldest defined band). Risk cannot be estimated outside that range."
          : "No validated chart cell matches these inputs. Risk was not estimated rather than extrapolated.",
    };
  }

  return {
    status: "calculated",
    methodology: WHO_METHODOLOGY_ID,
    chartRegion: "south-asia",
    chartType: "non-laboratory-based",
    chartVersion: NONLAB_CHART_VERSION,
    algorithmVersion: ALGORITHM_VERSION,
    riskPercent: lookup.riskPercent,
    riskCategory: riskPercentToCategory(lookup.riskPercent),
    inputsUsed: input,
    validationErrors: [],
    missingMeasurements: [],
    message:
      "Estimated 10-year cardiovascular disease risk based on the WHO 2019 South Asia non-laboratory-based (BMI) chart, used because total cholesterol was not available. This is a risk estimate, not a diagnosis.",
  };
}

function toFiniteNumber(value: CvdRiskRawInput["age"]): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/**
 * Entry point for the deployment's screening workflow: applies the
 * age-eligibility policy (ageEligibilityPolicy.ts) before delegating to the
 * unmodified calculateCvdRisk. If age is missing/invalid, that is left to
 * calculateCvdRisk's own validation so the error message stays consistent.
 */
export function calculateCvdRiskWithAgeScreening(
  rawInput: CvdRiskRawInput,
  methodology: CalculateRiskMethodology = DEFAULT_METHODOLOGY,
): CvdRiskResult {
  const parsedAge = toFiniteNumber(rawInput.age);
  if (parsedAge === undefined) {
    return calculateCvdRisk(rawInput, methodology);
  }

  const screening = applyAgeScreeningPolicy(parsedAge);
  if (!screening.eligible) {
    return {
      status: "unavailable",
      methodology: WHO_METHODOLOGY_ID,
      chartRegion: methodology.chartRegion,
      chartType: "laboratory-based",
      chartVersion: LAB_CHART_VERSION,
      algorithmVersion: ALGORITHM_VERSION,
      validationErrors: [],
      missingMeasurements: [],
      unavailableReason: "NOT_ELIGIBLE_SCREENING_AGE",
      message: `This person is ${screening.trueAge} years old, below the minimum screening age of ${MINIMUM_SCREENING_AGE}. They are not eligible for CVD risk screening under this protocol.`,
    };
  }

  return calculateCvdRisk({ ...rawInput, age: screening.chartAge }, methodology);
}
