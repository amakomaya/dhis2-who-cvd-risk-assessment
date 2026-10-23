/**
 * Runtime-validated schema for the DHIS2 DataStore configuration object at
 * namespace "amakomaya-cvd-risk", key "configuration".
 *
 * No clinical defaults are invented here. Unknown metadata IDs must be
 * explicit empty strings in the stored configuration; they are treated as
 * "not yet mapped" and the relevant row/field falls back to "-" in the UI
 * rather than a guess (see RiskFactorTable.tsx).
 *
 * Shape reflects the real target DHIS2 instance (erecord.hmis.gov.np/tokha,
 * program RWD4kcdpe0E): age and sex come from tracked entity attributes
 * (date of birth + a gender attribute), not program-stage data elements, so
 * they live under trackedEntityAttributeIds rather than inputDataElementIds.
 * Only a single output data element (risk score) exists on that program.
 *
 * This schema holds only fields actually read at runtime (see
 * docs/CONFIGURATION.md for the field-by-field audit). The WHO methodology
 * (chart/region/algorithm version) is NOT part of this configuration - it
 * is a fixed application constant (see domain/cvd-risk/types.ts's
 * WHO_METHODOLOGY_ID/LAB_CHART_VERSION/ALGORITHM_VERSION and
 * calculateRisk.ts's DEFAULT_METHODOLOGY), since this deployment supports
 * exactly one chart and changing it is a code change, not a runtime
 * configuration toggle.
 */
import { z } from "zod";

export const CONFIG_SCHEMA_VERSION = "1.0.0" as const;

/** An ID field that is either a real DHIS2 UID or an explicit empty-string placeholder. */
const idOrPlaceholder = z.string();
const optionalId = idOrPlaceholder.optional().default("");

/** Maps a DHIS2 option-set code to a domain enum value. Codes not listed are unmapped. */
export const optionCodeMappingSchema = z.record(z.string(), z.string());

export const applicationSettingsSchema = z.object({
  enabled: z.boolean(),
  configSchemaVersion: z.literal(CONFIG_SCHEMA_VERSION),
  configVersion: z.string().min(1),
});

export const dhis2MetadataMappingsSchema = z.object({
  programId: idOrPlaceholder,
  programStageId: idOrPlaceholder,
  /** Program-stage (event) data elements. Age and sex are intentionally absent here. */
  inputDataElementIds: z.object({
    smokingStatus: idOrPlaceholder,
    systolicBloodPressure: idOrPlaceholder,
    totalCholesterol: idOrPlaceholder,
    diabetesStatus: idOrPlaceholder,
    /** Optional: only needed for the WHO BMI-based fallback chart when cholesterol+diabetes are unavailable. */
    height: optionalId,
    weight: optionalId,
  }),
  /** Tracked entity attributes. Age is derived from dateOfBirth, not stored directly. */
  trackedEntityAttributeIds: z.object({
    dateOfBirth: idOrPlaceholder,
    sex: idOrPlaceholder,
  }),
  /** The only output data element this deployment writes to (the calculated risk score). */
  outputDataElementIds: z.object({
    riskPercent: idOrPlaceholder,
  }),
});

export const inputSettingsSchema = z.object({
  sex: z.object({
    /** DHIS2 option-set code -> "male" | "female". Empty = not yet confirmed. */
    optionCodeMapping: optionCodeMappingSchema.optional().default({}),
  }),
  smokingStatus: z.object({
    optionCodeMapping: optionCodeMappingSchema.optional().default({}),
  }),
  totalCholesterol: z.object({
    acceptedUnits: z.array(z.enum(["mmol/L", "mg/dL"])).min(1),
  }),
  diabetesStatus: z.object({
    optionCodeMapping: optionCodeMappingSchema.optional().default({}),
  }),
});

export const cvdRiskConfigurationSchema = z.object({
  application: applicationSettingsSchema,
  dhis2MetadataMappings: dhis2MetadataMappingsSchema,
  inputSettings: inputSettingsSchema,
});

export type CvdRiskConfiguration = z.infer<typeof cvdRiskConfigurationSchema>;
