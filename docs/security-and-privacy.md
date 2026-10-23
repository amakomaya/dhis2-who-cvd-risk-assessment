# Security Notes, Known Limitations, Release Checklist, Rollback

## Security posture

- **Authentication**: the app relies entirely on the authenticated DHIS2 session via `@dhis2/app-runtime`'s `DataProvider`. It never implements its own login or stores credentials.
- **Authorization**: all read/write DHIS2 API calls are subject to the server's own user/org-unit/program/tracked-entity permission model. There is no frontend-only gate standing in for this.
- **No privileged credentials in the frontend**: this app contains no service-account tokens, API keys, or third-party service integrations of any kind. It never calls out to anything other than the DHIS2 instance it is installed on.
- **Logging**: no patient identifiers or clinical measurement values are logged to the browser console or external logging by this codebase. If a deployer adds telemetry/error reporting, it must scrub `CvdRiskRawInput`, `CvdRiskValidatedInput`, and `CvdRiskResult.inputsUsed` before transmission.
- **Browser storage**: this app does not persist clinical data in `localStorage`/`sessionStorage`/IndexedDB. Form state lives only in React component state and is cleared on navigation/reload.
- **Input validation**: all DataStore configuration read by `dhis2DataStore.ts` is schema-validated (`src/config/schema.ts`) before being trusted; an invalid or incomplete configuration disables the app rather than falling back to a guess.
- **HTTPS**: this app must only be deployed behind HTTPS in production — DHIS2 session cookies and API tokens must never be transmitted over plain HTTP. If self-hosting outside the DHIS2 app shell, terminate TLS at the reverse proxy/load balancer in front of both the DHIS2 instance and this app.
- **The native DOM write-back is same-origin, same-session only.** `src/unsupported/liveNativeFormBridge.ts` reaches across the Capture App's own iframe to read/write form fields - it never reaches outside the DHIS2 app shell's own same-origin pages, never sends data anywhere external, and every access is wrapped so a failure degrades to "could not read/write" rather than throwing or guessing a value. See that file's own docstring for the full reasoning and the risk of relying on undocumented DOM structure.

## Known limitations

- Clinical validation is **pending** — see `docs/clinical-validation-report.md`. Do not deploy to production clinical use until sign-off is complete.
- The native DOM write-back (`src/unsupported/liveNativeFormBridge.ts`) depends on the Capture App's current DOM structure (`data-test` attributes), which is not a documented DHIS2 API and can change on a DHIS2 upgrade without warning. If it stops working, the plugin degrades to display-only (no write-back) rather than failing loudly - monitor for this after any DHIS2 version upgrade.
- Bundle size (~663 KB minified for the largest chunk) has not been optimized with code-splitting; acceptable for initial release but worth revisiting if initial load time is a complaint in low-bandwidth deployments.
- Load/perf testing against a real DHIS2 43.1.0 instance has not been performed in an automated way; manual verification against the live `erecord.hmis.gov.np/tokha` instance has confirmed the plugin loads, calculates, and writes back correctly (see `docs/dhis2-integration.md`).

## Release checklist

- [ ] Clinical reviewer sign-off recorded in `docs/clinical-validation-report.md`.
- [ ] `dhis2MetadataMappings` fully populated for the target program/instance (see `docs/CONFIGURATION.md` for the required fields).
- [ ] DataStore write access restricted to the designated administrator UserRole (see `docs/datastore-admin-guide.md`); verified by attempting a write as a non-admin test user and confirming it is rejected server-side.
- [ ] `npm run typecheck`, `npm test`, `npm run lint`, `npm run build` all pass (see `npm run` output in CI).
- [ ] App deployed over HTTPS.
- [ ] `application.enabled` flipped to `true` only after the above are complete.

## Rollback instructions

1. **Application rollback**: DHIS2 custom apps are versioned as uploaded `.zip` bundles. Re-upload the previous app version's `.zip` via the DHIS2 App Management app, or redeploy the previous build artifact if self-hosted.
2. **Configuration rollback**: because `docs/datastore-admin-guide.md` requires bumping `configVersion` on every change, keep prior configuration JSON bodies saved outside DHIS2 (e.g. in this repo's `config/` history via git) so a bad configuration push can be reverted with a plain `PUT` of the last-known-good JSON.
3. **Immediate kill switch**: set `application.enabled` to `false` in the DataStore configuration. The app's config-loading service treats this as an invalid/disabled state and blocks the assessment workflow app-wide without requiring a redeploy.
