# Deployment Instructions

## Build

```bash
npm install
npm run typecheck
npm test
npm run build
```

`npm run build` runs `d2-app-scripts build` (the official DHIS2 App Platform build), which produces:

- `build/index.html` + assets — the standalone app entry (`src/App.tsx`)
- `build/plugin.html` + assets — the Capture enrollment-plugin entry (`src/Plugin.tsx`)
- `build/bundle/amakomaya-cvd-risk-<version>.zip` — a ready-to-install DHIS2 app bundle containing both, plus an auto-generated manifest

No manual manifest or zip step is needed — the App Platform handles both, including correct relative asset paths so the bundle works whether installed at a DHIS2 instance's root or under a subpath (e.g. `https://erecord.hmis.gov.np/tokha`).

## Install

1. Upload `build/bundle/amakomaya-cvd-risk-<version>.zip` via DHIS2 App Management → Install app from local file. This serves the app from the same origin as the DHIS2 instance, avoiding CORS configuration entirely, and makes `build/plugin.html` reachable at a URL the Tracker Plugin Configurator app can reference.
2. Register the plugin on program `RWD4kcdpe0E`'s enrollment page using the Tracker Plugin Configurator app — see `docs/dhis2-integration.md` ("Registering the plugin on the enrollment page"). This is a separate step from app installation; installing the app alone does not make the plugin appear in Capture.
3. Initialize this app's own DataStore configuration (`amakomaya-cvd-risk` namespace) — see `docs/datastore-admin-guide.md`. Use `config/nepal-tokha-datastore-configuration.json` as the starting point for this instance; it already has the confirmed real metadata IDs, with `application.enabled: false` until clinical sign-off.

## Local development

```bash
npm run start
```

Runs `d2-app-scripts start`, which prompts for (or reads from a local `.env`) the DHIS2 instance to develop against — see the App Platform's own docs for `.env` conventions (`REACT_APP_DHIS2_BASE_URL`, used only for the local dev proxy, never for production builds).

## Environment configuration

No environment variables or secrets are baked into production builds — the app's DHIS2 base URL is resolved dynamically at runtime from wherever it's installed, not hardcoded or configured at build time. This app holds no credentials of its own (see `docs/security-and-privacy.md`).

## Post-deploy verification

1. Confirm `GET /api/dataStore/amakomaya-cvd-risk/configuration` succeeds for a clinical test user and the standalone app renders a configuration-diagnostic view (or a clear "not configured" notice if the DataStore has not been initialized yet — see `docs/datastore-admin-guide.md`).
2. Confirm a non-administrator test user cannot write to the `amakomaya-cvd-risk` DataStore namespace via a direct API call.
3. Run a known reference case from `docs/clinical-validation-report.md` through the UI and confirm the displayed risk percentage and category match.
4. Open a patient's enrollment in Capture for program `RWD4kcdpe0E` and confirm the plugin appears, auto-loads the patient's date of birth/sex/clinical measurements, displays the calculated `RiskFactorTable`, and writes the score into the native Risk Score field (see `docs/dhis2-integration.md` — confirmed working against the live instance).
