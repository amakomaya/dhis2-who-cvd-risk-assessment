/**
 * Loads and validates the application configuration from the DHIS2
 * DataStore API: GET /api/dataStore/amakomaya-cvd-risk/configuration
 *
 * - Validates the stored JSON at runtime against cvdRiskConfigurationSchema.
 * - Never falls back to invented clinical defaults: an invalid, missing, or
 *   incompatible configuration disables scoring and saving.
 * - Caches the validated configuration for the application lifecycle once
 *   successfully validated.
 *
 * Authorization model (DHIS2 DataStore): namespace-level ACL is controlled
 * by DHIS2 "Metadata Data Store" authorities. Write access to this
 * namespace must be restricted to users holding the
 * `F_DATASTORE_CONFIG_ADMIN`-equivalent authority (in practice, an app-
 * specific DHIS2 Authority/UserRole configured by the administrator, since
 * DataStore ACL is namespace-wide, not per-key). Ordinary clinical users
 * should only be granted the app's "read" authority; the app itself must
 * never expose a DataStore write UI to non-administrator roles. Document
 * this in docs/datastore-admin-guide.md and enforce it with DHIS2 UserRole
 * configuration on the server, not solely in the frontend.
 */
import { cvdRiskConfigurationSchema, type CvdRiskConfiguration } from "../config/schema";

export const DATASTORE_NAMESPACE = "amakomaya-cvd-risk";
export const DATASTORE_KEY = "configuration";

export type ConfigLoadResult =
  | { status: "ok"; config: CvdRiskConfiguration }
  | { status: "not-found"; message: string }
  | { status: "network-error"; message: string }
  | { status: "invalid"; message: string; issues: string[] };

/** Minimal shape of the DHIS2 app-runtime data engine used by this service. */
export interface Dhis2DataEngine {
  query: (
    queryDefinition: Record<
      string,
      { resource: string; id?: string; params?: Record<string, unknown> }
    >,
  ) => Promise<Record<string, unknown>>;
}

let cachedConfig: CvdRiskConfiguration | null = null;

/** Clears the in-memory cache. Intended for tests and explicit admin re-sync actions. */
export function clearConfigCache(): void {
  cachedConfig = null;
}

/**
 * Fetches and validates the DataStore configuration using a DHIS2
 * app-runtime-compatible data engine. Does not throw; all failure modes are
 * represented in the returned ConfigLoadResult so callers can render a
 * clear error state instead of crashing the assessment workflow.
 */
export async function loadCvdRiskConfiguration(
  engine: Dhis2DataEngine,
): Promise<ConfigLoadResult> {
  if (cachedConfig) {
    return { status: "ok", config: cachedConfig };
  }

  let raw: unknown;
  try {
    const result = await engine.query({
      configuration: {
        resource: `dataStore/${DATASTORE_NAMESPACE}/${DATASTORE_KEY}`,
      },
    });
    raw = result.configuration;
  } catch (error) {
    const err = error as { httpStatusCode?: number; message?: string };
    if (err.httpStatusCode === 404) {
      return {
        status: "not-found",
        message:
          `No configuration found at dataStore/${DATASTORE_NAMESPACE}/${DATASTORE_KEY}. ` +
          "An administrator must run the DataStore initialization procedure before this app can be used.",
      };
    }
    return {
      status: "network-error",
      message: err.message ?? "Failed to reach the DHIS2 DataStore API.",
    };
  }

  const parsed = cvdRiskConfigurationSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: "invalid",
      message:
        "The stored configuration failed schema validation. Scoring and saving are disabled until an administrator corrects it.",
      issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    };
  }

  if (!parsed.data.application.enabled) {
    return {
      status: "invalid",
      message: "The CVD risk application is disabled in configuration.",
      issues: ["application.enabled is false"],
    };
  }

  cachedConfig = parsed.data;
  return { status: "ok", config: parsed.data };
}
