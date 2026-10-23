/**
 * Fetches a tracked entity instance's attribute values (date of birth, sex)
 * so the assessment form can pre-fill stable demographic fields instead of
 * asking the user to re-enter data already in the authorized DHIS2 record.
 * Returns raw attribute values only; option-code -> domain-enum translation
 * happens separately via src/config/optionSetMappings.ts, driven by the
 * DataStore configuration, so this service never hardcodes clinical meaning.
 */
import type { CvdRiskConfiguration } from "../config/schema";
import type { Dhis2DataEngine } from "./dhis2DataStore";

export interface TrackedEntityAttributeValues {
  dateOfBirth?: string;
  sexCode?: string;
}

export type FetchTrackedEntityResult =
  | { status: "ok"; values: TrackedEntityAttributeValues }
  | { status: "not-found"; message: string }
  | { status: "network-error"; message: string };

interface RawAttribute {
  attribute: string;
  value: string;
}

export async function fetchTrackedEntityAttributeValues(
  engine: Dhis2DataEngine,
  config: CvdRiskConfiguration,
  trackedEntityInstanceId: string,
): Promise<FetchTrackedEntityResult> {
  if (!trackedEntityInstanceId) {
    return { status: "not-found", message: "No tracked entity instance ID was provided." };
  }

  const mappings = config.dhis2MetadataMappings.trackedEntityAttributeIds;

  try {
    const result = await engine.query({
      trackedEntity: {
        resource: "tracker/trackedEntities",
        id: trackedEntityInstanceId,
        // Same reason as dhis2Event.ts: the tracker API's default field set
        // excludes attributes unless explicitly requested.
        params: { fields: "attributes[attribute,value]" },
      },
    });
    const entity = result.trackedEntity as { attributes?: RawAttribute[] } | undefined;
    if (!entity) {
      return { status: "not-found", message: `Tracked entity ${trackedEntityInstanceId} was not found.` };
    }
    const byId = new Map((entity.attributes ?? []).map((a) => [a.attribute, a.value]));
    return {
      status: "ok",
      values: {
        dateOfBirth: mappings.dateOfBirth ? byId.get(mappings.dateOfBirth) : undefined,
        sexCode: mappings.sex ? byId.get(mappings.sex) : undefined,
      },
    };
  } catch (error) {
    const err = error as { httpStatusCode?: number; message?: string };
    if (err.httpStatusCode === 404) {
      return { status: "not-found", message: `Tracked entity ${trackedEntityInstanceId} was not found.` };
    }
    return {
      status: "network-error",
      message: err.message ?? "Failed to reach the DHIS2 tracked entity API.",
    };
  }
}
