# Configuration: the DHIS2 DataStore Schema (Minimized)

This document is the field-by-field audit behind the configuration cleanup, and the resulting minimal schema. See `docs/datastore-admin-guide.md` for how to actually initialize/update the DataStore entry, and `CHANGELOG.md` for the change history.

## Storage location (unchanged)

- Namespace: `amakomaya-cvd-risk`
- Key: `configuration`
- Full resource: `GET/PUT /api/dataStore/amakomaya-cvd-risk/configuration`
- Loaded by `src/services/dhis2DataStore.ts`, validated against `src/config/schema.ts`'s `cvdRiskConfigurationSchema`. A single namespace and key for the whole configuration — there is no second, overlapping DataStore entry for this app.

## What changed and why

The configuration previously had three top-level blocks and several per-field settings with **zero runtime consumers** — verified by searching the entire codebase for every read of each field before removing it. The audit:

| Field / block | Classification | Reason |
|---|---|---|
| `clinicalMethodology.*` (7 fields) | **Redundant** | Never read anywhere. `calculateRisk.ts` uses its own hardcoded `DEFAULT_METHODOLOGY` constant (from `domain/cvd-risk/types.ts`'s `WHO_METHODOLOGY_ID`/`LAB_CHART_VERSION`/`ALGORITHM_VERSION`), not this config block. Every field was a `z.literal` (locked to exactly one value) anyway, so it was never actually runtime-configurable — just a duplicate of an application constant. |
| `outputSettings.*` (5 fields) | **Redundant** | Exact duplicate of `dhis2MetadataMappings.outputDataElementIds`. Zero production reads; only appeared in test fixtures. |
| `optionalFeatures.*` (`aiExplanationsEnabled`, `uiPreferences`, `assessmentHistoryEnabled`) | **Unused** | Zero reads anywhere outside `schema.ts` itself. These existed to gate `AiExplanationPanel`/an assessment-history UI that were never wired into the reachable component tree and have now been removed. |
| `dhis2MetadataMappings.trackedEntityTypeId` | **Unused** | Never read. |
| `dhis2MetadataMappings.organisationUnitRequirements` | **Unused** | Never read (was intended to gate a manual org-unit-selection UI that no longer exists). |
| `dhis2MetadataMappings.outputDataElementIds.{riskCategory,assessmentDate,algorithmVersion,chartRegion}` | **Unused** | Only ever read by `dhis2Assessment.ts` (the old manual-save service, now removed — see below). The only output this app writes is the risk score itself. |
| `inputSettings.*.source` (on every input) | **Unused** | Never branched on. Existed to drive the old manual-entry form's conditional rendering; that form is gone. |
| `inputSettings.*.categories`, `inputSettings.*.optionSetId` | **Unused** | Never read. Admin-facing documentation value only, and that documentation now lives in code comments (`optionSetMappings.ts`) and `docs/dhis2-integration.md` instead. |
| `inputSettings.age`, `inputSettings.systolicBloodPressure` (as sub-objects) | **Unused** | Their only field was `unit` (`z.literal("years")` / `z.literal("mmHg")`), never read — age/SBP units are fixed assumptions baked into the code (`utils/age.ts`, `calculateRisk.ts`), not configurable. |
| `inputSettings.sex/smokingStatus/diabetesStatus.optionCodeMapping` | **Required** | Actively read by `buildRawInputFromDhis2.ts` and `liveNativeFormBridge.ts` via `mapOptionCode`. This is the one genuinely deployment-specific, runtime-necessary setting per input (option-set codes vary by instance). |
| `inputSettings.totalCholesterol.acceptedUnits` | **Required** | Actively read (`acceptedUnits[0]`) to pick the storage unit for the mg/dL↔mmol/L conversion. |
| `dhis2MetadataMappings.{programId,programStageId}` | **Required** | Used throughout (`Plugin.tsx`'s program-mismatch check; implicitly scope every fetch). |
| `dhis2MetadataMappings.inputDataElementIds.*` | **Required** | Read by `dhis2Event.ts`/`liveNativeFormBridge.ts` to locate each clinical measurement. |
| `dhis2MetadataMappings.trackedEntityAttributeIds.*` | **Required** | Read by `dhis2TrackedEntity.ts` to locate date of birth/sex. |
| `dhis2MetadataMappings.outputDataElementIds.riskPercent` | **Required** | The only output data element this app writes to — see "The output UID" below. |
| `application.{enabled,configSchemaVersion,configVersion}` | **Required** | `enabled`/`configSchemaVersion` are read and enforced by `dhis2DataStore.ts`; `configVersion` is the documented operational field admins bump on every change (`docs/datastore-admin-guide.md`) to detect concurrent edits — not read by application logic, but a genuine operational necessity, not dead code. |

Also removed alongside this: `isMetadataFullyMapped()` (its only caller, `dhis2Assessment.ts`, was removed — see "What was removed" in `CHANGELOG.md`), the hardcoded `TOBACCO_OPTION_CODE_TO_SMOKING_STATUS`/`DIABETES_OPTION_CODE_TO_STATUS`/`SEX_OPTION_CODE_TO_SEX` lookup tables in `optionSetMappings.ts` (exact duplicates of the DataStore's own `optionCodeMapping` values, never read), and the `rawDataValues` field `dhis2Event.ts` used to return (computed but never consumed once the old update-merge save logic was removed).

## The minimal schema

```ts
{
  application: {
    enabled: boolean,
    configSchemaVersion: "1.0.0",   // fixed literal; schema-version pin
    configVersion: string,          // operational: bump on every change (see datastore-admin-guide.md)
  },
  dhis2MetadataMappings: {
    programId: string,
    programStageId: string,
    inputDataElementIds: {
      smokingStatus: string,
      systolicBloodPressure: string,
      totalCholesterol: string,
      diabetesStatus: string,
      height: string,   // optional (empty string if unmapped) - WHO BMI-chart fallback only
      weight: string,   // optional (empty string if unmapped) - WHO BMI-chart fallback only
    },
    trackedEntityAttributeIds: {
      dateOfBirth: string,
      sex: string,
    },
    outputDataElementIds: {
      riskPercent: string,   // the ONLY output this app writes
    },
  },
  inputSettings: {
    sex: { optionCodeMapping: Record<string, string> },
    smokingStatus: { optionCodeMapping: Record<string, string> },
    totalCholesterol: { acceptedUnits: Array<"mmol/L" | "mg/dL"> },
    diabetesStatus: { optionCodeMapping: Record<string, string> },
  },
}
```

See `config/example-datastore-configuration.json` for an unmapped placeholder template and `config/nepal-tokha-datastore-configuration.json` for the real, confirmed configuration for the target instance — both already updated to this shape.

## Runtime-configurable vs. fixed constants

- **Runtime-configurable (DataStore)**: every field above — all are genuinely deployment-specific (different DHIS2 instances have different program/data-element/option-set IDs).
- **Fixed application constants (code, not DataStore)**: the WHO methodology itself — `WHO_METHODOLOGY_ID`, `LAB_CHART_VERSION`, `NONLAB_CHART_VERSION`, `ALGORITHM_VERSION` in `src/domain/cvd-risk/types.ts`, and `DEFAULT_METHODOLOGY` in `src/domain/cvd-risk/calculateRisk.ts`. This deployment supports exactly one chart (WHO 2019, South Asia region); supporting a different chart/region would be a code change (adding a new chart data file + wiring), not a configuration toggle, so it is intentionally **not** stored as fake "runtime configurability" in the DataStore.

## The output data element

The required risk score output UID for this project is **`KgeoM7TE7HJ`**, stored at `dhis2MetadataMappings.outputDataElementIds.riskPercent`. This was verified:

- Against `config/nepal-tokha-datastore-configuration.json` (the confirmed real metadata for the target instance — unchanged by this cleanup).
- Against the live production instance directly, via `liveNativeFormBridge.ts`'s native DOM write-back, which reads this exact config path to locate the native Risk Score input field before writing to it (confirmed working live, writing the calculated score into the native form).

This UID stays in the DataStore configuration (not hardcoded as an application constant) because, unlike the WHO methodology, it is genuinely per-deployment — a different DHIS2 instance's program would use a different data element UID for its risk-score output, exactly like every other data-element/attribute ID in `dhis2MetadataMappings`. It was never silently removed or changed.

## Migration for existing deployments

If a DHIS2 instance already has a live `amakomaya-cvd-risk`/`configuration` DataStore entry using the **old, larger** schema (with `clinicalMethodology`/`outputSettings`/`optionalFeatures`/`trackedEntityTypeId`/`organisationUnitRequirements`/the extra `inputSettings.*` fields documented above), **no immediate action is required**: the old entry still validates successfully against the new, smaller schema, because zod's default object parsing strips/ignores unrecognized extra keys rather than rejecting them. The app will continue to work unmodified.

To actually clean up a live DataStore entry to the new minimal shape (optional, not required for correctness):

1. `GET /api/dataStore/amakomaya-cvd-risk/configuration` and save a copy of the current value.
2. Confirm the live entry's `dhis2MetadataMappings.outputDataElementIds.riskPercent` matches what you intend to keep (for this project: `KgeoM7TE7HJ`).
3. `PUT` a new value matching the minimal schema in this document (use `config/nepal-tokha-datastore-configuration.json` as the template for this instance), after explicit sign-off per `docs/datastore-admin-guide.md`'s "Updating configuration safely" procedure.
4. **Do not perform this PUT automatically or without administrator confirmation** — this is a live-data change, not a code deployment, per `docs/datastore-admin-guide.md`.

No DataStore namespace or key was deleted as part of this cleanup; only unused *fields within* the existing single entry were dropped from the schema and from the two local template files in `config/`.
