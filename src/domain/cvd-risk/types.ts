/**
 * Domain types for the WHO 2019 CVD risk assessment.
 * This module has no dependency on React or DHIS2 and must stay pure.
 */

export type Sex = "male" | "female";

export type SmokingStatus = "non-smoker" | "smoker";

export type DiabetesStatus = "without" | "with";

/** Chart region verified for the deployment. Only "south-asia" is validated today. */
export type ChartRegion = "south-asia";

/**
 * Which WHO chart was used. The laboratory-based chart (total cholesterol)
 * is preferred; the non-laboratory-based (BMI) chart is WHO's own documented
 * fallback for when a cholesterol measurement is unavailable.
 */
export type ChartType = "laboratory-based" | "non-laboratory-based";

export const WHO_METHODOLOGY_ID = "who-2019-cvd-risk-laboratory-based" as const;
export const LAB_CHART_VERSION = "who-2019-south-asia-lab-v1" as const;
export const NONLAB_CHART_VERSION = "who-2019-south-asia-nonlab-v1" as const;
export const ALGORITHM_VERSION = "1.0.0" as const;

/**
 * Raw clinical inputs as collected from the user/DHIS2 record, before validation.
 * Values are left as `unknown`-ish primitives (string | number | undefined) because
 * they may arrive as untrusted strings from form fields or DHIS2 event values.
 */
export interface CvdRiskRawInput {
  /** Age in completed years. */
  age?: number | string;
  sex?: Sex | string;
  smokingStatus?: SmokingStatus | string;
  /** Systolic blood pressure in mmHg. */
  systolicBloodPressureMmHg?: number | string;
  /** Total cholesterol value as provided, with its unit. */
  totalCholesterol?: number | string;
  totalCholesterolUnit?: "mmol/L" | "mg/dL" | string;
  diabetesStatus?: DiabetesStatus | string;
  /**
   * Used only as a fallback when totalCholesterol is not provided, per
   * WHO's own non-laboratory-based (BMI) chart. Ignored when total
   * cholesterol is present.
   */
  heightCm?: number | string;
  weightKg?: number | string;
}

/** Validated, unit-normalized input ready for chart lookup — one of two chart pathways. */
export type CvdRiskValidatedInput =
  | {
      chartType: "laboratory-based";
      age: number;
      sex: Sex;
      smokingStatus: SmokingStatus;
      systolicBloodPressureMmHg: number;
      /** Total cholesterol normalized to mmol/L, the lab chart's native unit. */
      totalCholesterolMmolPerL: number;
      diabetesStatus: DiabetesStatus;
    }
  | {
      chartType: "non-laboratory-based";
      age: number;
      sex: Sex;
      smokingStatus: SmokingStatus;
      systolicBloodPressureMmHg: number;
      /** Body mass index (kg/m^2), the non-lab chart's native measurement. */
      bmi: number;
    };

export type ValidationErrorCode =
  | "AGE_MISSING"
  | "AGE_NOT_A_NUMBER"
  | "AGE_OUT_OF_SUPPORTED_RANGE"
  | "SEX_MISSING"
  | "SEX_UNSUPPORTED_VALUE"
  | "SMOKING_STATUS_MISSING"
  | "SMOKING_STATUS_UNSUPPORTED_VALUE"
  | "SBP_MISSING"
  | "SBP_NOT_A_NUMBER"
  | "SBP_OUT_OF_SUPPORTED_RANGE"
  | "TOTAL_CHOLESTEROL_NOT_A_NUMBER"
  | "TOTAL_CHOLESTEROL_UNIT_MISSING"
  | "TOTAL_CHOLESTEROL_UNIT_UNSUPPORTED"
  | "TOTAL_CHOLESTEROL_OUT_OF_SUPPORTED_RANGE"
  | "DIABETES_STATUS_MISSING"
  | "DIABETES_STATUS_UNSUPPORTED_VALUE"
  | "HEIGHT_NOT_A_NUMBER"
  | "HEIGHT_OUT_OF_SUPPORTED_RANGE"
  | "WEIGHT_NOT_A_NUMBER"
  | "WEIGHT_OUT_OF_SUPPORTED_RANGE"
  | "CHOLESTEROL_OR_BMI_MEASUREMENT_REQUIRED";

export interface ValidationError {
  code: ValidationErrorCode;
  field: keyof CvdRiskRawInput;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  /** Present only when valid === true. */
  input?: CvdRiskValidatedInput;
}

export type RiskCategory =
  | "under-5"
  | "5-to-under-10"
  | "10-to-under-20"
  | "20-to-under-30"
  | "30-or-more";

export const RISK_CATEGORY_LABEL: Record<RiskCategory, string> = {
  "under-5": "<5% (low risk)",
  "5-to-under-10": "5% to <10% (moderate risk)",
  "10-to-under-20": "10% to <20% (high risk)",
  "20-to-under-30": "20% to <30% (very high risk)",
  "30-or-more": "≥30% (critical risk)",
};

export type UnavailableReason =
  | "VALIDATION_FAILED"
  | "MISSING_REQUIRED_MEASUREMENTS"
  | "UNSUPPORTED_AGE_FOR_CHART"
  | "CHART_CELL_NOT_FOUND"
  | "METHODOLOGY_NOT_CONFIGURED"
  | "NOT_ELIGIBLE_SCREENING_AGE";

/**
 * The outcome of calculateCvdRisk. Exactly one of (riskPercent+riskCategory) or
 * (unavailableReason) is meaningful, signalled by `status`.
 */
export interface CvdRiskResult {
  status: "calculated" | "unavailable";
  methodology: typeof WHO_METHODOLOGY_ID;
  chartRegion: ChartRegion;
  /** Which WHO chart was used (or attempted). Known once validation determines the pathway. */
  chartType: ChartType;
  chartVersion: typeof LAB_CHART_VERSION | typeof NONLAB_CHART_VERSION;
  algorithmVersion: typeof ALGORITHM_VERSION;
  /** 10-year CVD risk percentage, as a chart-cell integer. Only set when status === "calculated". */
  riskPercent?: number;
  riskCategory?: RiskCategory;
  /** Echoes the exact inputs used for this calculation (validated form). */
  inputsUsed?: CvdRiskValidatedInput;
  /** Validation errors that prevented calculation, if any. */
  validationErrors: ValidationError[];
  /** Required fields that were not supplied at all. */
  missingMeasurements: Array<keyof CvdRiskRawInput>;
  /** Present only when status === "unavailable". */
  unavailableReason?: UnavailableReason;
  /** Human-readable explanation, always safe to display. */
  message: string;
}
