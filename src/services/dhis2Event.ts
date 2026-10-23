/**
 * Reads the data values already entered on an existing DHIS2 tracker event
 * (the same event the user is editing in the native program stage data
 * entry form), so the assessment plugin pre-fills from what's already
 * there instead of asking the user to re-enter it, and so saving can
 * update that same event rather than create a duplicate one.
 */
import type { CvdRiskConfiguration } from "../config/schema";
import type { Dhis2DataEngine } from "./dhis2DataStore";

export interface EventMeasurementValues {
  smokingStatusCode?: string;
  systolicBloodPressure?: string;
  totalCholesterol?: string;
  diabetesStatusCode?: string;
  heightCm?: string;
  weightKg?: string;
  /** The event's own date (ISO), used to compute age as of this assessment rather than today. */
  occurredAt?: string;
}

export interface RawDataValue {
  dataElement: string;
  value: string;
}

export type FetchEventResult =
  | { status: "ok"; values: EventMeasurementValues }
  | { status: "not-found"; message: string }
  | { status: "network-error"; message: string };

export async function fetchEventMeasurementValues(
  engine: Dhis2DataEngine,
  config: CvdRiskConfiguration,
  eventId: string,
): Promise<FetchEventResult> {
  if (!eventId) {
    return { status: "not-found", message: "No event ID was provided." };
  }

  const mappings = config.dhis2MetadataMappings.inputDataElementIds;

  try {
    const result = await engine.query({
      event: {
        resource: "tracker/events",
        id: eventId,
        // The tracker API returns a minimal default field set that excludes
        // dataValues unless explicitly requested. Without this, the request
        // succeeds but silently comes back with no measurement data.
        params: { fields: "occurredAt,dataValues[dataElement,value]" },
      },
    });
    const event = result.event as
      | { occurredAt?: string; dataValues?: RawDataValue[] }
      | undefined;
    if (!event) {
      return { status: "not-found", message: `Event ${eventId} was not found.` };
    }
    const byId = new Map((event.dataValues ?? []).map((dv) => [dv.dataElement, dv.value]));
    return {
      status: "ok",
      values: {
        smokingStatusCode: mappings.smokingStatus ? byId.get(mappings.smokingStatus) : undefined,
        systolicBloodPressure: mappings.systolicBloodPressure
          ? byId.get(mappings.systolicBloodPressure)
          : undefined,
        totalCholesterol: mappings.totalCholesterol ? byId.get(mappings.totalCholesterol) : undefined,
        diabetesStatusCode: mappings.diabetesStatus ? byId.get(mappings.diabetesStatus) : undefined,
        heightCm: mappings.height ? byId.get(mappings.height) : undefined,
        weightKg: mappings.weight ? byId.get(mappings.weight) : undefined,
        occurredAt: event.occurredAt ? event.occurredAt.slice(0, 10) : undefined,
      },
    };
  } catch (error) {
    const err = error as { httpStatusCode?: number; message?: string };
    if (err.httpStatusCode === 404) {
      return { status: "not-found", message: `Event ${eventId} was not found.` };
    }
    return {
      status: "network-error",
      message: err.message ?? "Failed to reach the DHIS2 event API.",
    };
  }
}
