# DataStore Initialization & Administrator Permissions Guide

See `docs/CONFIGURATION.md` for the full field-by-field schema (what's required, what's runtime-configurable vs. a fixed application constant, and the DataStore minimization audit behind it).

## Storage location

- Namespace: `amakomaya-cvd-risk`
- Key: `configuration`
- Full resource: `GET/PUT /api/dataStore/amakomaya-cvd-risk/configuration`

## Authorization model

DHIS2 DataStore access control is **namespace-wide**, not per key:

- **Read**: by default, any authenticated user can read a DataStore namespace unless it has been explicitly restricted. For this app, clinical users need read access to `amakomaya-cvd-risk` so the app can load its configuration.
- **Write**: DataStore write access should be restricted using DHIS2's `keyJsonBlobValue`-style namespace ACL mechanism — in practice, this means:
  1. Only grant the `F_METADATA_IMPORT`/relevant DataStore-management authority (or a dedicated UserRole created for this app's administrators) write access.
  2. The app's own frontend **must never expose a configuration-editing UI to a user whose role lacks that authority** — this is enforced by checking the user's authorities via `@dhis2/app-runtime`'s `useDataQuery(["me"])` before rendering any admin screen, in addition to (not instead of) the server-side ACL.
  3. Server-side authorization is the actual control; the frontend check is a UX convenience only, per this project's security requirements.

Document the specific UserRole/authority name used for "CVD risk app administrator" here once it is created in the target DHIS2 instance — it is deployment-specific and was not available during this build.

## Initialization procedure

**Never overwrite an existing configuration without explicit confirmation.** Before writing:

1. `GET /api/dataStore/amakomaya-cvd-risk/configuration`.
2. If the request returns `404`, the namespace/key does not exist yet — proceed to step 3.
3. If the request returns `200`, a configuration already exists. Display its `application.configVersion` and `application.enabled` to the administrator and require an explicit "Yes, overwrite" confirmation (e.g. a modal, not a default action) before any `PUT`. Never perform this overwrite automatically from a deploy script.
4. To create a new configuration, `POST /api/dataStore/amakomaya-cvd-risk/configuration` with a JSON body matching `config/example-datastore-configuration.json`, validated client-side against `src/config/schema.ts` (`cvdRiskConfigurationSchema`) before sending.
5. Leave `application.enabled` set to `false` and all `dhis2MetadataMappings` IDs as empty strings until the steps in `docs/dhis2-integration.md` ("Required follow-up") are complete. Flipping `enabled` to `true` prematurely does not itself enable scoring (the clinical engine ignores it directly — it is read and enforced by the app shell to show the disabled state) but it does signal readiness to clinical users, so treat it as a deliberate go-live action.

## Updating configuration safely

- Always re-`GET` the current configuration immediately before a `PUT`, and compare `configVersion` to detect concurrent edits by another administrator (optimistic concurrency); if it has changed, reload and re-apply your edit rather than overwriting blindly.
- Bump `application.configVersion` on every change so field staff can see which configuration revision is active (e.g. for support/debugging).
- The WHO chart/methodology itself is a fixed application constant, not part of this configuration (see `docs/CONFIGURATION.md`) — changing it requires a code change and a new app release, never a DataStore edit.
