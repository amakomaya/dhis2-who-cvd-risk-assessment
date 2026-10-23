# Amakomaya CVD Risk — DHIS2 CVD Risk Assessment App

A DHIS2 app for estimating 10-year cardiovascular disease (CVD) risk using the official **WHO 2019 laboratory-based CVD risk chart — South Asia region** (verified applicable to Nepal; see `docs/clinical-validation-report.md`), with an automatic WHO BMI-based fallback chart when lab data (cholesterol + diabetes status) isn't available. Ships as both a standalone app and a **Capture App enrollment plugin** for program `RWD4kcdpe0E` on `https://erecord.hmis.gov.np/tokha`.

**This tool produces a risk estimate, not a diagnosis.** It does not prescribe treatment. Treatment decisions must follow approved local clinical protocols.

## Status

- Deterministic clinical engine: implemented and tested (see `npm test` output).
- DHIS2 integration: confirmed real metadata mapped (`config/nepal-tokha-datastore-configuration.json`); the plugin auto-loads patient data and writes the calculated score back natively — see `docs/dhis2-integration.md`.
- Clinical validation: **pending sign-off** (see `docs/clinical-validation-report.md`). Do not use for patient care until that sign-off is recorded, and until the age-eligibility screening policy (below) has been clinically reviewed.

## Stack

- React + TypeScript, built with the **DHIS2 App Platform** (`@dhis2/cli-app-scripts`, which uses Vite internally) — required to get the real Capture-plugin runtime (postMessage/iframe wiring to the host), which cannot be safely hand-rolled.
- `@dhis2/ui` for UI components, `@dhis2/app-runtime` for DHIS2 API access (injected automatically by the platform for both entry points — no hardcoded base URL anywhere; the app resolves its own origin whether installed at a DHIS2 root or under a subpath like `/tokha`).
- `zod` for runtime configuration validation.
- Vitest + React Testing Library for tests (kept independent of the App Platform's own build pipeline — see `vitest.config.ts`).

## Two entry points, one workflow

- **`src/App.tsx` → `AssessmentPage`**: standalone app, opened from the DHIS2 app menu. Exists mainly for configuration-loading diagnostics today (it has no `trackedEntityInstanceId`/`eventId` to auto-load from).
- **`src/Plugin.tsx`**: the real integration target — a **Capture App enrollment plugin**, rendered inside the patient's enrollment page. Receives `{ programId, orgUnitId, enrollmentId, teiId, programStageId?, eventId?, navigate }` from the host and auto-loads the patient's date of birth, sex, and clinical measurements itself (the host gives no data automatically — see `docs/dhis2-integration.md`).

Both share `src/components/AssessmentWorkspace.tsx`, which fetches the patient's demographics and current event measurements, computes the risk entirely locally, and renders a single read-only `RiskFactorTable`. There is no manual data-entry form and no save button: the plugin writes the calculated score directly into the native Capture form's Risk Score field (same-origin DOM write-back — see `src/unsupported/liveNativeFormBridge.ts`), so the user's own DHIS2 Save/Complete action persists it as part of their normal workflow.

## Project layout

```text
d2.config.js               # App Platform config: both entry points, DataStore namespace
src/
├── App.tsx                 # Standalone app entry
├── Plugin.tsx               # Capture enrollment-plugin entry
├── pages/AssessmentPage.tsx  # Standalone-app wrapper (configuration diagnostics)
├── components/
│   ├── AssessmentWorkspace.tsx  # Shared auto-fetch/calculate/display workflow (both entry points)
│   └── RiskFactorTable.tsx       # The entire visible UI: color-coded factor table + score
├── unsupported/liveNativeFormBridge.ts  # UNSUPPORTED same-origin DOM read/write-back
├── domain/cvd-risk/        # Pure, framework-free clinical engine (no React/DHIS2 deps)
│   ├── calculateRisk.ts    # calculateCvdRisk — the literal, unmodified WHO engine
│   │                        # calculateCvdRiskWithAgeScreening — wraps it with the deployment's
│   │                        # age-eligibility policy (see ageEligibilityPolicy.ts)
│   ├── ageEligibilityPolicy.ts  # Deployment rule: <18 ineligible, 18-40→40, >79→79
│   ├── validateInputs.ts   # Chart-pathway selection (lab vs. BMI) + field validation
│   ├── who2019LaboratoryChart.ts     # Typed accessor over the WHO lab chart lookup table
│   ├── who2019NonLabChart.ts         # Typed accessor over the WHO BMI-fallback chart
│   ├── who2019SouthAsiaLabChart.data.json     # 1,400-cell chart data (see reference/)
│   ├── who2019SouthAsiaNonLabChart.data.json  # 700-cell chart data (see reference/)
│   └── types.ts            # Also holds the fixed methodology constants (see Configuration below)
├── services/
│   ├── dhis2DataStore.ts     # Loads/validates app configuration from DHIS2 DataStore
│   ├── dhis2TrackedEntity.ts # Fetches a patient's DOB/sex attributes
│   └── dhis2Event.ts         # Fetches a program-stage event's existing measurements
├── config/
│   ├── schema.ts             # zod schema for the DataStore configuration object (minimal - see docs/CONFIGURATION.md)
│   ├── optionSetMappings.ts  # Generic, config-driven option-code lookup (mapOptionCode)
│   └── buildRawInputFromDhis2.ts  # Pure DOB/option-code → CvdRiskRawInput mapper
├── utils/age.ts, bmi.ts     # Dynamic date-of-birth → age, and BMI calculation
├── hooks/useCvdRiskConfig.ts
└── tests/setup.ts

reference/                 # WHO source PDF + extraction scripts + extracted data (provenance/audit trail)
config/
├── example-datastore-configuration.json       # Unmapped placeholder template
└── nepal-tokha-datastore-configuration.json    # Real, confirmed metadata for the target instance
docs/                       # Clinical validation report, DHIS2 integration notes, admin guide,
                             # security notes, deployment instructions
```

## Getting started

```bash
npm install
npm run start           # d2-app-scripts start — local dev server for both entry points
npm run typecheck
npm test                 # domain engine, config schema, DHIS2 services, UI components
npm run lint
npm run build             # d2-app-scripts build — produces build/index.html, build/plugin.html,
                            # and an installable build/bundle/*.zip
```

## Key design decisions

- **Clinical scoring is local and deterministic.** `calculateCvdRisk()` never makes a network or AI call; it is pure, synchronous TypeScript operating over the extracted WHO chart tables, and is never modified by the age-eligibility policy layered on top of it.
- **No fabricated results.** Missing fields, invalid values, or out-of-range ages all produce an explicit `status: "unavailable"` result with a reason — never a default or guessed risk value. The UI mirrors this: each factor row falls back to `-`, never a fabricated reading.
- **Laboratory chart requires both cholesterol and diabetes status**; otherwise the app falls back to the WHO BMI-based chart when height/weight are available — see `docs/clinical-validation-report.md`.
- **Age-eligibility is a deployment policy, kept separate from the WHO engine.** `calculateCvdRiskWithAgeScreening` clamps/rejects ages before calling the unmodified `calculateCvdRisk` — see `docs/dhis2-integration.md`.
- **The WHO methodology is a fixed application constant, not DataStore configuration.** This deployment supports exactly one chart; changing it is a code change, not a runtime toggle — see `docs/CONFIGURATION.md`.
- **Configuration never silently falls back to invented clinical defaults.** An invalid or incomplete DataStore configuration disables the app rather than guessing.
- **No hardcoded base URL.** The App Platform resolves the DHIS2 origin dynamically from wherever the app/plugin is installed.

## Further reading

- `docs/clinical-validation-report.md` — chart data provenance, verification method, pinned reference cases, sign-off status.
- `docs/dhis2-integration.md` — the Capture plugin contract, confirmed metadata mapping, option-code tables, age-eligibility policy, required admin follow-up.
- `docs/CONFIGURATION.md` — the minimal DataStore configuration schema, what's runtime-configurable vs. a fixed constant, and the DataStore cleanup/minimization audit.
- `docs/datastore-admin-guide.md` — DataStore authorization model, safe initialization/update procedure.
- `docs/security-and-privacy.md` — security posture, known limitations, release checklist, rollback.
- `docs/deployment.md` — build and deployment instructions.
- `docs/user-guide/CVD-Risk-Assessment-User-Guide.pdf` — screenshot-illustrated user guide for clinical staff.
- `CHANGELOG.md` — what changed and why, most recent first.
