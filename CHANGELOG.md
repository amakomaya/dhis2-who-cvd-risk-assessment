# Changelog

Most recent first.

## Unreleased: Code cleanup and DataStore configuration minimization

Audit-and-cleanup pass. No clinical calculation, DHIS2 integration contract, or security control was changed. No DataStore namespace/key was deleted (only unused fields within the existing single entry's schema).

### Removed (confirmed zero production consumers before removal)

- `src/services/dhis2Assessment.ts` (+ test) — the obsolete manual-save path (`saveAssessment`). Persistence is now exclusively the native DOM write-back in `src/unsupported/liveNativeFormBridge.ts`, driven by the user's own Save/Complete/Update action in the native Capture form.
- `src/services/dhis2Metadata.ts` (+ test) — `fetchProgramMetadata`/`validateMetadataMappingAgainstProgram`, never wired into any UI.
- `src/services/aiExplanation.ts` (+ test), `src/components/AiExplanationPanel.tsx` (+ test) — the optional AI-explanation feature, never reachable from any entry point.
- `src/components/AssessmentDataContext.tsx` (+ test), `src/components/ClinicalAssessmentForm.tsx` (+ test) — the old manual-entry form UI, fully superseded by `AssessmentWorkspace`'s automatic fetch-and-display workflow.
- `getCachedConfig()` (`dhis2DataStore.ts`) — unused export.
- `isMetadataFullyMapped()` (`config/schema.ts`) — its only caller was the removed `dhis2Assessment.ts`.
- `TOBACCO_OPTION_CODE_TO_SMOKING_STATUS`, `DIABETES_OPTION_CODE_TO_STATUS`, `SEX_OPTION_CODE_TO_SEX` (`config/optionSetMappings.ts`) — hardcoded duplicates of the DataStore's own `inputSettings.*.optionCodeMapping` values; the generic `mapOptionCode()` function (actively used) is unaffected.
- `rawDataValues` field on `dhis2Event.ts`'s `FetchEventResult` — computed but never consumed once the old update-merge save logic was removed.
- `dist/` directory — stale, gitignored build artifact from the project's pre-App-Platform hand-rolled Vite setup; current builds only ever write to `build/`.

### DataStore configuration minimized

See `docs/CONFIGURATION.md` for the full field-by-field audit. Summary: removed the entirely-unread `clinicalMethodology` block (redundant with the `WHO_METHODOLOGY_ID`/`DEFAULT_METHODOLOGY` application constants in `domain/cvd-risk/types.ts`/`calculateRisk.ts`), the `outputSettings` block (exact duplicate of `dhis2MetadataMappings.outputDataElementIds`), the `optionalFeatures` block (fed the now-removed AI/history UI), `trackedEntityTypeId`, `organisationUnitRequirements`, four unused `outputDataElementIds` fields, and the `source`/`categories`/`optionSetId` fields plus the `age`/`systolicBloodPressure` unit-only sub-objects under `inputSettings` — none were read by any production code. The required output UID (`KgeoM7TE7HJ`) is unchanged and still configured at `dhis2MetadataMappings.outputDataElementIds.riskPercent`.

`config/example-datastore-configuration.json` and `config/nepal-tokha-datastore-configuration.json` (both local repo templates, not the live remote DataStore entry) were updated to the new minimal shape; all real confirmed DHIS2 UIDs were preserved exactly.

### Fixed along the way (this session, before the cleanup pass)

- `calculateRisk.ts`/`validateInputs.ts`: the laboratory-based WHO chart now requires **both** total cholesterol and diabetes status to be selected; previously cholesterol alone selected the lab chart and a missing diabetes status failed validation outright instead of falling back to the WHO BMI chart.
- `AssessmentWorkspace.tsx`: the live-preview native-DOM poll now also runs for an existing (already-saved) event open in "Edit event" mode, not just a brand-new unsaved event — previously, editing any field (e.g. cholesterol) on an existing event never reached the plugin.
- `liveNativeFormBridge.ts`: now also reads the event's own date (`occurredAt`) from the native form, so age is computed as of that date rather than always defaulting to today during live preview.

### Verified after cleanup

- `npm run typecheck` — clean.
- `npm test` — 214/214 tests passing across 18 files (was 267/267 across 24 files before removing the 6 dead-code test files; no other test deleted).
- `npm run lint` — clean.
- `npm run build` — succeeds; produces an installable `build/bundle/amakomaya-cvd-risk-0.1.0.zip`.

See `docs/TESTING.md` for the full before/after breakdown.
