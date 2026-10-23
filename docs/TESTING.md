# Testing

## Commands

```bash
npm run typecheck   # tsc -b --noEmit
npm test             # cross-env NODE_OPTIONS=--no-experimental-webstorage vitest run
npm run lint         # eslint . --ext .ts,.tsx
npm run build        # tsc -b --noEmit && d2-app-scripts build
```

## What's covered

- **Clinical engine** (`src/domain/cvd-risk/`): chart-lookup data integrity (exact cell counts for both the 1,400-cell laboratory chart and the 700-cell BMI-fallback chart), band boundaries, validation rules, chart-pathway selection (laboratory vs. BMI fallback), age-eligibility screening policy, and the full `calculateCvdRisk`/`calculateCvdRiskWithAgeScreening` behavior including every "unavailable" reason.
- **Configuration** (`src/config/`): schema validation (`schema.test.ts`), both local config templates validate against the schema and have the required fields mapped (`exampleConfiguration.test.ts`), option-code lookup (`optionSetMappings.test.ts`), and the raw-DHIS2-value-to-domain-input mapper (`buildRawInputFromDhis2.test.ts`).
- **DHIS2 services** (`src/services/`): the DataStore config loader (cache behavior, 404/network/invalid handling), and the tracked-entity/event fetchers (correct `fields` query params, graceful not-found/network-error handling).
- **The native DOM bridge** (`src/unsupported/liveNativeFormBridge.ts`): reading text/radio fields and the event's own date by their `data-test` attributes, writing the native Risk Score field via the React-safe native setter + event dispatch, and every access degrading to "not accessible" rather than throwing.
- **UI components**: `RiskFactorTable` (every factor's color-coded classification, the raw-input per-field fallback when validation fails, BMI vs. lab-chart row selection, the WHO legend colors on the score badge) and `AssessmentWorkspace` (auto-load wiring, live-preview read/write-back, age computed from the event's own date rather than today).

## Pre-cleanup vs. post-cleanup baseline

This test suite was run before and after the code-cleanup/DataStore-minimization pass (see `CHANGELOG.md`):

- **Before cleanup**: 267 tests passing across 24 test files (6 of those files covered code removed as confirmed-unused: `dhis2Assessment`, `dhis2Metadata`, `aiExplanation`, `AiExplanationPanel`, `AssessmentDataContext`, `ClinicalAssessmentForm`).
- **After cleanup**: 214 tests passing across 18 test files. No test was deleted without its subject also being confirmed removed as dead code; no clinical-logic or security test was removed to reduce line count. Every remaining test file's fixtures were updated to the simplified `CvdRiskConfiguration` schema, not weakened.
- No regression: every test that exercised still-present behavior (clinical calculation, chart selection, DataStore loading, native DOM bridge, UI rendering) continued passing unchanged in substance, only in fixture shape.

## Verified results (this cleanup pass)

```
npm run typecheck   → clean, no errors
npm test             → 18 test files, 214 tests, all passing
npm run lint         → clean, no errors or warnings
npm run build        → succeeds; produces build/index.html, build/plugin.html,
                        build/bundle/amakomaya-cvd-risk-0.1.0.zip
```

All four commands were actually executed against the final source (not assumed) as part of this cleanup.
