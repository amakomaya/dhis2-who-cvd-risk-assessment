/**
 * Validates and normalizes raw CVD risk inputs before chart lookup.
 * Pure function: no I/O, no React, no DHIS2 dependency.
 *
 * Chart pathway selection: the laboratory-based chart is used only when
 * BOTH total cholesterol AND diabetes status are provided (that chart has
 * separate with/without-diabetes panels, so diabetes status isn't optional
 * on it). Otherwise, when height and weight are provided, the
 * non-laboratory-based (BMI) chart is used instead — this is WHO's own
 * documented fallback for when lab data isn't available, not an invented
 * substitution. If neither complete pathway is available, validation fails
 * requesting one or the other.
 */
import { MAX_LOOKUP_AGE, MIN_SUPPORTED_AGE } from "./who2019LaboratoryChart";
import { computeBmi } from "../../utils/bmi";
import type { CvdRiskRawInput, ValidationError, ValidationResult } from "./types";

const VALID_SEX = new Set(["male", "female"]);
const VALID_SMOKING = new Set(["non-smoker", "smoker"]);
const VALID_DIABETES = new Set(["without", "with"]);
const VALID_TC_UNITS = new Set(["mmol/L", "mg/dL"]);

/** mg/dL to mmol/L conversion factor for total cholesterol (standard clinical factor). */
const MG_DL_TO_MMOL_L_CHOLESTEROL = 1 / 38.67;

const MIN_PLAUSIBLE_SBP = 60;
const MAX_PLAUSIBLE_SBP = 300;

/** Plausibility bounds in mmol/L; the chart itself has no upper/lower cap. */
const MIN_PLAUSIBLE_TC_MMOL = 1;
const MAX_PLAUSIBLE_TC_MMOL = 20;

const MIN_PLAUSIBLE_HEIGHT_CM = 100;
const MAX_PLAUSIBLE_HEIGHT_CM = 250;
const MIN_PLAUSIBLE_WEIGHT_KG = 20;
const MAX_PLAUSIBLE_WEIGHT_KG = 300;

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function isProvided(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

export function validateCvdRiskInputs(raw: CvdRiskRawInput): ValidationResult {
  const errors: ValidationError[] = [];

  // Age
  let age: number | undefined;
  if (!isProvided(raw.age)) {
    errors.push({ code: "AGE_MISSING", field: "age", message: "Age is required." });
  } else {
    const n = toNumber(raw.age);
    if (n === undefined) {
      errors.push({ code: "AGE_NOT_A_NUMBER", field: "age", message: "Age must be a number." });
    } else if (!Number.isInteger(n) || n < MIN_SUPPORTED_AGE || n > MAX_LOOKUP_AGE) {
      errors.push({
        code: "AGE_OUT_OF_SUPPORTED_RANGE",
        field: "age",
        message: `Age must be a whole number between ${MIN_SUPPORTED_AGE} and ${MAX_LOOKUP_AGE} for this chart.`,
      });
    } else {
      age = n;
    }
  }

  // Sex
  let sex: "male" | "female" | undefined;
  if (!raw.sex) {
    errors.push({ code: "SEX_MISSING", field: "sex", message: "Sex is required." });
  } else if (!VALID_SEX.has(raw.sex)) {
    errors.push({
      code: "SEX_UNSUPPORTED_VALUE",
      field: "sex",
      message: 'Sex must be "male" or "female" for this chart.',
    });
  } else {
    sex = raw.sex as "male" | "female";
  }

  // Smoking status
  let smokingStatus: "non-smoker" | "smoker" | undefined;
  if (!raw.smokingStatus) {
    errors.push({
      code: "SMOKING_STATUS_MISSING",
      field: "smokingStatus",
      message: "Current smoking status is required.",
    });
  } else if (!VALID_SMOKING.has(raw.smokingStatus)) {
    errors.push({
      code: "SMOKING_STATUS_UNSUPPORTED_VALUE",
      field: "smokingStatus",
      message: 'Smoking status must be "non-smoker" or "smoker".',
    });
  } else {
    smokingStatus = raw.smokingStatus as "non-smoker" | "smoker";
  }

  // SBP
  let sbp: number | undefined;
  if (!isProvided(raw.systolicBloodPressureMmHg)) {
    errors.push({
      code: "SBP_MISSING",
      field: "systolicBloodPressureMmHg",
      message: "Systolic blood pressure is required.",
    });
  } else {
    const n = toNumber(raw.systolicBloodPressureMmHg);
    if (n === undefined) {
      errors.push({
        code: "SBP_NOT_A_NUMBER",
        field: "systolicBloodPressureMmHg",
        message: "Systolic blood pressure must be a number.",
      });
    } else if (n < MIN_PLAUSIBLE_SBP || n > MAX_PLAUSIBLE_SBP) {
      errors.push({
        code: "SBP_OUT_OF_SUPPORTED_RANGE",
        field: "systolicBloodPressureMmHg",
        message: `Systolic blood pressure must be between ${MIN_PLAUSIBLE_SBP} and ${MAX_PLAUSIBLE_SBP} mmHg.`,
      });
    } else {
      sbp = n;
    }
  }

  // Chart pathway selection: laboratory-based (cholesterol + diabetes) when
  // both are provided, otherwise BMI (WHO's documented fallback).
  const cholesterolProvided = isProvided(raw.totalCholesterol);
  const diabetesProvided = isProvided(raw.diabetesStatus);
  const heightWeightProvided = isProvided(raw.heightCm) && isProvided(raw.weightKg);
  const useLabPathway = cholesterolProvided && diabetesProvided;

  if (!useLabPathway && !heightWeightProvided) {
    if (cholesterolProvided && !diabetesProvided) {
      errors.push({
        code: "DIABETES_STATUS_MISSING",
        field: "diabetesStatus",
        message:
          "Diabetes status is required alongside total cholesterol to use the laboratory-based chart; provide it, or supply height and weight for the WHO BMI-based fallback chart instead.",
      });
    } else {
      errors.push({
        code: "CHOLESTEROL_OR_BMI_MEASUREMENT_REQUIRED",
        field: "totalCholesterol",
        message:
          "Either total cholesterol together with diabetes status, or both height and weight (for the WHO BMI-based fallback chart), are required.",
      });
    }
  }

  if (useLabPathway) {
    let tcMmol: number | undefined;
    if (!raw.totalCholesterolUnit) {
      errors.push({
        code: "TOTAL_CHOLESTEROL_UNIT_MISSING",
        field: "totalCholesterolUnit",
        message: "Total cholesterol unit is required.",
      });
    } else if (!VALID_TC_UNITS.has(raw.totalCholesterolUnit)) {
      errors.push({
        code: "TOTAL_CHOLESTEROL_UNIT_UNSUPPORTED",
        field: "totalCholesterolUnit",
        message: 'Total cholesterol unit must be "mmol/L" or "mg/dL".',
      });
    } else {
      const n = toNumber(raw.totalCholesterol);
      if (n === undefined) {
        errors.push({
          code: "TOTAL_CHOLESTEROL_NOT_A_NUMBER",
          field: "totalCholesterol",
          message: "Total cholesterol must be a number.",
        });
      } else {
        const normalized =
          raw.totalCholesterolUnit === "mg/dL" ? n * MG_DL_TO_MMOL_L_CHOLESTEROL : n;
        if (normalized < MIN_PLAUSIBLE_TC_MMOL || normalized > MAX_PLAUSIBLE_TC_MMOL) {
          errors.push({
            code: "TOTAL_CHOLESTEROL_OUT_OF_SUPPORTED_RANGE",
            field: "totalCholesterol",
            message: "Total cholesterol value is outside the clinically plausible range.",
          });
        } else {
          tcMmol = normalized;
        }
      }
    }

    // diabetesProvided is guaranteed true here (useLabPathway requires it); still validate the value itself.
    let diabetesStatus: "with" | "without" | undefined;
    if (!VALID_DIABETES.has(raw.diabetesStatus as string)) {
      errors.push({
        code: "DIABETES_STATUS_UNSUPPORTED_VALUE",
        field: "diabetesStatus",
        message: 'Diabetes status must be "with" or "without".',
      });
    } else {
      diabetesStatus = raw.diabetesStatus as "with" | "without";
    }

    if (
      errors.length > 0 ||
      age === undefined ||
      sex === undefined ||
      smokingStatus === undefined ||
      sbp === undefined ||
      tcMmol === undefined ||
      diabetesStatus === undefined
    ) {
      return { valid: false, errors };
    }

    return {
      valid: true,
      errors: [],
      input: {
        chartType: "laboratory-based",
        age,
        sex,
        smokingStatus,
        systolicBloodPressureMmHg: sbp,
        totalCholesterolMmolPerL: tcMmol,
        diabetesStatus,
      },
    };
  }

  // Non-laboratory-based (BMI) pathway.
  let heightCm: number | undefined;
  let weightKg: number | undefined;
  if (heightWeightProvided) {
    const h = toNumber(raw.heightCm);
    if (h === undefined) {
      errors.push({ code: "HEIGHT_NOT_A_NUMBER", field: "heightCm", message: "Height must be a number." });
    } else if (h < MIN_PLAUSIBLE_HEIGHT_CM || h > MAX_PLAUSIBLE_HEIGHT_CM) {
      errors.push({
        code: "HEIGHT_OUT_OF_SUPPORTED_RANGE",
        field: "heightCm",
        message: `Height must be between ${MIN_PLAUSIBLE_HEIGHT_CM} and ${MAX_PLAUSIBLE_HEIGHT_CM} cm.`,
      });
    } else {
      heightCm = h;
    }

    const w = toNumber(raw.weightKg);
    if (w === undefined) {
      errors.push({ code: "WEIGHT_NOT_A_NUMBER", field: "weightKg", message: "Weight must be a number." });
    } else if (w < MIN_PLAUSIBLE_WEIGHT_KG || w > MAX_PLAUSIBLE_WEIGHT_KG) {
      errors.push({
        code: "WEIGHT_OUT_OF_SUPPORTED_RANGE",
        field: "weightKg",
        message: `Weight must be between ${MIN_PLAUSIBLE_WEIGHT_KG} and ${MAX_PLAUSIBLE_WEIGHT_KG} kg.`,
      });
    } else {
      weightKg = w;
    }
  }

  if (
    errors.length > 0 ||
    age === undefined ||
    sex === undefined ||
    smokingStatus === undefined ||
    sbp === undefined ||
    heightCm === undefined ||
    weightKg === undefined
  ) {
    return { valid: false, errors };
  }

  const bmi = computeBmi(heightCm, weightKg);
  if (bmi === null) {
    // Already bounds-checked above; this path is unreachable in practice.
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    input: {
      chartType: "non-laboratory-based",
      age,
      sex,
      smokingStatus,
      systolicBloodPressureMmHg: sbp,
      bmi,
    },
  };
}

/**
 * Lists which required raw fields are entirely absent (not merely invalid).
 * For the cholesterol+diabetes/BMI fork, this reports cholesterol/diabetes
 * missing only when the BMI fallback inputs are also absent — matching
 * validateCvdRiskInputs's useLabPathway rule.
 */
export function findMissingMeasurements(raw: CvdRiskRawInput): Array<keyof CvdRiskRawInput> {
  const missing: Array<keyof CvdRiskRawInput> = [];
  if (!isProvided(raw.age)) missing.push("age");
  if (!raw.sex) missing.push("sex");
  if (!raw.smokingStatus) missing.push("smokingStatus");
  if (!isProvided(raw.systolicBloodPressureMmHg)) missing.push("systolicBloodPressureMmHg");

  const cholesterolProvided = isProvided(raw.totalCholesterol);
  const diabetesProvided = isProvided(raw.diabetesStatus);
  const heightWeightProvided = isProvided(raw.heightCm) && isProvided(raw.weightKg);
  const useLabPathway = cholesterolProvided && diabetesProvided;

  if (useLabPathway) {
    if (!raw.totalCholesterolUnit) missing.push("totalCholesterolUnit");
  } else if (!heightWeightProvided) {
    if (!cholesterolProvided) missing.push("totalCholesterol");
    if (!diabetesProvided) missing.push("diabetesStatus");
    if (!isProvided(raw.heightCm)) missing.push("heightCm");
    if (!isProvided(raw.weightKg)) missing.push("weightKg");
  } else {
    // height/weight provided as the BMI fallback; nothing else required.
  }

  return missing;
}
