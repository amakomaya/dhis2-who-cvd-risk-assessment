/**
 * Pure helper that turns raw DHIS2 values (a date of birth, option-set
 * codes, and measurement values) into a CvdRiskRawInput, using the
 * configured option-code mappings so no clinical translation is
 * hardcoded outside the DataStore configuration. Unmapped codes are left
 * undefined (never guessed), which surfaces as a normal validation error
 * downstream in calculateCvdRisk.
 */
import { computeAgeFromDateOfBirth } from "../utils/age";
import { mapOptionCode } from "./optionSetMappings";
import type { CvdRiskConfiguration } from "./schema";
import type { CvdRiskRawInput } from "../domain/cvd-risk/types";

export interface Dhis2SourceValues {
  dateOfBirthIso?: string;
  sexCode?: string;
  smokingStatusCode?: string;
  systolicBloodPressure?: string | number;
  totalCholesterol?: string | number;
  diabetesStatusCode?: string;
  /** Used only when totalCholesterol is absent, as the WHO BMI-chart fallback. */
  heightCm?: string | number;
  weightKg?: string | number;
  /** Date the assessment is being performed, for age calculation. Defaults to today. */
  assessmentDateIso?: string;
}

export function buildRawInputFromDhis2(
  config: CvdRiskConfiguration,
  source: Dhis2SourceValues,
): CvdRiskRawInput {
  const age = source.dateOfBirthIso
    ? computeAgeFromDateOfBirth(source.dateOfBirthIso, source.assessmentDateIso) ?? undefined
    : undefined;

  const sex = mapOptionCode(config.inputSettings.sex.optionCodeMapping, source.sexCode);
  const smokingStatus = mapOptionCode(
    config.inputSettings.smokingStatus.optionCodeMapping,
    source.smokingStatusCode,
  );
  const diabetesStatus = mapOptionCode(
    config.inputSettings.diabetesStatus.optionCodeMapping,
    source.diabetesStatusCode,
  );

  return {
    age,
    sex,
    smokingStatus,
    systolicBloodPressureMmHg: source.systolicBloodPressure,
    totalCholesterol: source.totalCholesterol,
    totalCholesterolUnit: source.totalCholesterol !== undefined
      ? config.inputSettings.totalCholesterol.acceptedUnits[0]
      : undefined,
    diabetesStatus,
    heightCm: source.heightCm,
    weightKg: source.weightKg,
  };
}
