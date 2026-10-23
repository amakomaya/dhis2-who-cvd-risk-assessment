# DHIS2 Integration Notes

## Target environment

- DHIS2 server: 43.1.0, confirmed instance `https://erecord.hmis.gov.np/tokha`.
- Frontend: React + TypeScript, built with the **DHIS2 App Platform** (`@dhis2/cli-app-scripts` v12, which uses Vite internally — see `d2.config.js`). This project originally used a hand-rolled Vite setup; it was migrated to the official App Platform specifically to get the real Capture-plugin runtime (postMessage handshake, iframe resizing, host-context injection), which cannot be safely hand-rolled.
- DHIS2 client library: `@dhis2/app-runtime` (`useDataEngine`, `useDataQuery`) — injected automatically by the App Platform's generated bootstrap for both the app and plugin entry points. The app never constructs its own `DataProvider`/base URL; that's handled by the platform, so the same build works whether installed at a DHIS2 instance's root or under a subpath like `/tokha`.
- DHIS2 UI components: `@dhis2/ui`.

## Two entry points, one shared workflow

`d2.config.js` declares both:

```js
entryPoints: {
    app: './src/App.tsx',
    plugin: './src/Plugin.tsx',
},
```

- **`src/App.tsx` → `AssessmentPage`**: a standalone app, opened from the DHIS2 app menu. It has no `trackedEntityInstanceId`/`eventId` to auto-load from, so today it mainly exists for configuration-loading diagnostics.
- **`src/Plugin.tsx`**: the real integration target — a **Capture App enrollment plugin**. Per the confirmed contract ([developers.dhis2.org/docs/capture-plugins](https://developers.dhis2.org/docs/capture-plugins/developer/enrollment-plugins/introduction)), the Capture App renders this inside an iframe on the patient's enrollment page and passes it exactly these props, nothing more:

  ```ts
  { programId, orgUnitId, enrollmentId, teiId, programStageId?, eventId?, navigate }
  ```

  The plugin has **no automatic access to attributes or data values** — confirmed explicitly in the docs ("An enrollment plugin does not by default have access to any data or metadata"). It fetches what it needs itself, via the same `@dhis2/app-runtime` data engine a regular app would use, over the same authenticated same-origin session.

Both entry points render the same `src/components/AssessmentWorkspace.tsx`. It auto-loads the patient's date of birth/sex (tracked entity attributes, via `src/services/dhis2TrackedEntity.ts`) and the current event's clinical measurements (smoking, SBP, cholesterol, diabetes, height/weight — via `src/services/dhis2Event.ts`), calculates automatically, and renders a single read-only `src/components/RiskFactorTable.tsx`: a color-coded factor-by-factor breakdown plus the overall score, with `-` for anything it can't find — never an editable field or a guessed value. There is no manual data-entry UI anywhere in this app.

**Persistence is via native DOM write-back, not a DHIS2 API mutation.** The plugin has no save button and makes no `mutate` call of its own: `src/unsupported/liveNativeFormBridge.ts` writes the calculated score directly into the native Capture form's own Risk Score input field (same-origin same-page DOM write, dispatching a real `input`/`change` event so React's own controlled-component state picks it up), so the user's own native DHIS2 Save/Complete/Update button persists it as part of their normal workflow — there is no separate, app-owned save step to go stale or duplicate a write. See `src/unsupported/liveNativeFormBridge.ts`'s own docstring for the full reasoning and risk (this mechanism is reverse-engineered DOM structure, not a documented DHIS2 API, and can silently stop working on a Capture App DOM-structure change).

The same bridge also **live-reads** the native form's current values — for both a brand-new, unsaved event and an existing event open in "Edit event" mode — so a change to any field (e.g. the user edits cholesterol after the page loaded) is reflected in the displayed risk immediately, not just the once-on-mount Tracker API snapshot.

## Registering the plugin on the enrollment page

Per the DHIS2 docs, **manual DataStore editing for plugin placement is explicitly discouraged** ("We discourage setting up plugins manually, as it is a complex process that can lead to errors"). Use the community **Tracker Plugin Configurator** app instead:

1. Build and install this app (`npm run build`, then upload `build/bundle/amakomaya-cvd-risk-*.zip` via DHIS2 App Management) so its `plugin.html` entry is reachable at a URL on the instance.
2. Open the Tracker Plugin Configurator app, select program `RWD4kcdpe0E`, and add this plugin to the enrollment page layout (left or right column) alongside the native Capture widgets.
3. Save — this writes the layout to the DataStore `capture` namespace (key `enrollmentOverviewLayout` for program `RWD4kcdpe0E`). This is a separate DataStore namespace from this app's own `amakomaya-cvd-risk` configuration namespace (see `docs/datastore-admin-guide.md`) and is owned by the Configurator app's own conventions, not this project's schema.
4. Note the documented limitation: this layout is a **snapshot** — if the program's metadata changes later, the layout in the DataStore does not auto-update and must be re-saved.

## Confirmed metadata mapping (erecord.hmis.gov.np/tokha, program RWD4kcdpe0E)

This is a **tracker program** with a registered tracked entity type, populated in `config/nepal-tokha-datastore-configuration.json`:

| Field | ID | Notes |
|---|---|---|
| Program | `RWD4kcdpe0E` | |
| Program stage (event) | `bqd9yievDDw` | |
| Tracked entity type | `CWkDesHkKCs` | Documented here for reference only - not part of the app's own DataStore configuration schema, since nothing in the app reads it (see `docs/CONFIGURATION.md`). |
| TEA: date of birth | `i607dSgfm4F` | Age is derived dynamically at assessment time (`src/utils/age.ts`), never stored as a separate "age" field — this stays correct no matter when the assessment runs. |
| TEA: sex | `RzyHxE71iyC` | Option codes are the literal strings `male`/`female` — no numeric-code translation needed. |
| DE: tobacco use | `D3eRPeASNXl` | Option set `gn2VJOOzl5R`; four codes collapse to the WHO chart's two-state smoking status (table below). |
| DE: diabetes | `H148aekqr5U` | Option set `oq2dw7GhNLw`; code `1` ("छ") = with, code `0` ("छैन") = without. |
| DE: systolic BP | `vFG3xb1q7XI` | mmHg. |
| DE: total cholesterol | `e5vnong2Xos` | **mg/dL** (confirmed by administrator) — converted to mmol/L via the standard ÷38.67 factor before chart lookup. |
| DE: height | `T375sw78yIP` | cm. WHO BMI-chart fallback only - used automatically when cholesterol and diabetes status aren't both available (see below). |
| DE: weight | `OlfMMk0g5xc` | kg. Same fallback. |
| DE: risk score (output) | `KgeoM7TE7HJ` | The **only** output data element this app writes to — see `docs/CONFIGURATION.md`. |

### Chart pathway selection

The laboratory-based WHO chart is used only when **both** total cholesterol and diabetes status are available for the assessment being scored; otherwise the app automatically falls back to the WHO **non-laboratory-based (BMI)** chart, provided height and weight are available (`src/domain/cvd-risk/validateInputs.ts`'s `useLabPathway` rule) — WHO's own documented fallback, not an invented substitution. If neither pathway's full data is available, the result is `status: "unavailable"` rather than a guess.

### Tobacco option-code mapping (option set `gn2VJOOzl5R`)

| Code | Label (Nepali) | Meaning | Maps to |
|---|---|---|---|
| 1 | नगर्ने | does not use | non-smoker |
| 2 | नियमित | regular user | smoker |
| 3 | कहिलेकाहिँ | occasional user | smoker |
| 4 | विगतमा गर्ने | used to, now stopped | non-smoker |

Implemented in `src/config/optionSetMappings.ts`, mirrored in `config/nepal-tokha-datastore-configuration.json`'s `inputSettings.smokingStatus.optionCodeMapping` — never hardcoded anywhere else.

## Age-eligibility screening policy (deployment rule, not WHO methodology)

On top of the literal WHO chart, this deployment applies an explicit age-based eligibility/clamping policy (`src/domain/cvd-risk/ageEligibilityPolicy.ts`), kept deliberately separate from `calculateCvdRisk` (the unmodified, literal WHO engine):

- **Under 18**: not eligible for this screening at all (`calculateCvdRiskWithAgeScreening` returns `unavailableReason: "NOT_ELIGIBLE_SCREENING_AGE"` without attempting a chart lookup).
- **18 to 40 inclusive**: scored at chart age 40 (the chart's youngest band) — a deliberate conservative simplification for young adults.
- **Above 79**: scored at chart age 79, which the chart engine itself resolves to the oldest defined band (70-74), per WHO's own published guidance to reuse the oldest band for ages beyond the chart's ceiling (this part — ages 75-79 reusing the 70-74 band — lives inside `who2019LaboratoryChart.ts`'s `ageToBand`, not the deployment policy layer, since it's WHO guidance rather than a local business rule).
- **41 to 79**: scored at the person's true age, unchanged.

`AssessmentWorkspace` (used by both entry points) calls `calculateCvdRiskWithAgeScreening`, not `calculateCvdRisk` directly, so this policy applies everywhere in the UI. Flag this rule for the clinical reviewer alongside the rest of `docs/clinical-validation-report.md` — it did not come from the WHO chart itself.

## Required follow-up before production use

1. ✅ Program/program stage/data element/tracked-entity-attribute IDs confirmed and mapped.
2. ✅ Option-code mappings for tobacco, diabetes, and sex confirmed and mapped.
3. ✅ The plugin has been confirmed working live against `erecord.hmis.gov.np/tokha`: it loads inside the Capture App's enrollment page, auto-fetches demographics/measurements via `useDataEngine`, computes the risk, and writes the score into the native Risk Score field (see the "Assumption" note below — now confirmed, not just assumed).
4. **Still required**: confirm organisation unit and user-role authorization requirements for this program with the instance administrator.
5. **Still required**: register the plugin on the enrollment page via the Tracker Plugin Configurator app (see above), for any instance where this hasn't already been done.
6. **Still required**: clinical validation sign-off (`docs/clinical-validation-report.md`), including explicit review of the age-eligibility screening policy above, before `application.enabled` is set to `true`.

## Assumption confirmed against the live instance

The official Capture-plugin docs do not explicitly confirm that `useDataQuery`/`useDataEngine`/`useDataMutation` work identically inside a `Plugin.tsx` entry as inside a regular `App.tsx` entry (the `@dhis2/app-runtime` "Plugin" component docs mark that area experimental/unaddressed). This implementation assumed they do, since the plugin is built and served as a real installed DHIS2 app sharing the same same-origin session — and this has since been **confirmed directly against the live `erecord.hmis.gov.np/tokha` instance**: the plugin's `useDataEngine()` call successfully fetches tracked-entity attributes and event data values from inside the Capture App's embedded plugin iframe, exactly as it does in the standalone app.
