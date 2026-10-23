/**
 * UNSUPPORTED, UNDOCUMENTED MECHANISM. Read this before touching this file.
 *
 * DHIS2 Capture plugins have no sanctioned API for reading the host's live,
 * unsaved form state (confirmed against the official docs — see
 * docs/dhis2-integration.md). This module reaches across the same-origin
 * iframe boundary into the Capture app's own document and reads/writes
 * native form inputs directly, keyed by the DHIS2 data element UID, which
 * DHIS2 happens to expose as `data-test="form-field-<uid>"` on text-input
 * wrappers and as the literal `name` attribute on radio inputs.
 *
 * This is NOT a documented contract. It was reverse-engineered by live
 * inspection of one DHIS2 instance (erecord.hmis.gov.np, Capture app) on
 * 2026-10-23 and can silently stop working on any DHIS2 upgrade, with no
 * warning. Every function here is defensive: it never throws into the
 * caller, and a failure degrades to "could not read live form values"
 * rather than a wrong or fabricated clinical input.
 *
 * Used only by src/Plugin.tsx, only when there is no persisted eventId yet
 * (the "new, unsaved event" case) — never for the supported, saved-event
 * pathway, which uses the real Tracker API (dhis2Event.ts) instead.
 */
import { mapOptionCode } from "../config/optionSetMappings";
import type { CvdRiskConfiguration } from "../config/schema";
import type { CvdRiskRawInput } from "../domain/cvd-risk/types";

export interface NativeFormAccessResult {
  /** True if the Capture app's document was reachable at all (same-origin iframe access succeeded). */
  accessible: boolean;
  raw: CvdRiskRawInput;
  /** The event's own date (occurredAt), read from the native "Basic info" date field, if entered. */
  occurredAtIso?: string;
}

/** Reads a text/number input's value via its data-test="form-field-<uid>" wrapper. Returns undefined if not found/empty. */
function readTextField(doc: Document, uid: string): string | undefined {
  if (!uid) return undefined;
  const wrapper = doc.querySelector(`[data-test="form-field-${uid}"]`);
  const input = wrapper?.querySelector("input, textarea") as HTMLInputElement | HTMLTextAreaElement | null;
  const value = input?.value?.trim();
  return value ? value : undefined;
}

/**
 * Reads the event's own date (occurredAt) from the native "Basic info" date
 * field - confirmed via live inspection to be keyed by
 * data-test="dataentry-field-occurredAt" (not a data element UID, since
 * it's the event's own date, not a tracked data value). Age must be
 * computed as of this date, not always "today" - see
 * AssessmentWorkspace.tsx's age-recompute effect.
 */
function readOccurredAtField(doc: Document): string | undefined {
  const wrapper = doc.querySelector('[data-test="dataentry-field-occurredAt"]');
  const input = wrapper?.querySelector("input") as HTMLInputElement | null;
  const value = input?.value?.trim();
  return value ? value : undefined;
}

/** Reads the checked option's value from a native radio group, keyed by the data element UID as the `name` attribute. */
function readRadioField(doc: Document, uid: string): string | undefined {
  if (!uid) return undefined;
  const checked = doc.querySelector<HTMLInputElement>(`input[name="${uid}"]:checked`);
  return checked?.value || undefined;
}

/**
 * Attempts to read the native Capture form's current (possibly unsaved)
 * values for the fields this app needs, mapped through the deployment's
 * own option-code tables — never a hardcoded/invented mapping.
 */
export function readNativeFormValues(
  doc: Document,
  config: CvdRiskConfiguration,
): CvdRiskRawInput {
  const ids = config.dhis2MetadataMappings.inputDataElementIds;

  const smokingCode = readRadioField(doc, ids.smokingStatus);
  const diabetesCode = readRadioField(doc, ids.diabetesStatus);

  return {
    systolicBloodPressureMmHg: readTextField(doc, ids.systolicBloodPressure),
    totalCholesterol: readTextField(doc, ids.totalCholesterol),
    totalCholesterolUnit: config.inputSettings.totalCholesterol.acceptedUnits[0],
    heightCm: readTextField(doc, ids.height),
    weightKg: readTextField(doc, ids.weight),
    smokingStatus: mapOptionCode(config.inputSettings.smokingStatus.optionCodeMapping, smokingCode),
    diabetesStatus: mapOptionCode(config.inputSettings.diabetesStatus.optionCodeMapping, diabetesCode),
  };
}

/**
 * Attempts same-origin access to the Capture app's document (one level up
 * from this plugin's own iframe). Never throws: cross-origin or missing-
 * frame access failures are reported via `accessible: false` instead.
 */
export function tryReadNativeFormValues(
  hostWindow: Window | null | undefined,
  config: CvdRiskConfiguration,
): NativeFormAccessResult {
  try {
    const doc = hostWindow?.document;
    if (!doc) return { accessible: false, raw: {} };
    return { accessible: true, raw: readNativeFormValues(doc, config), occurredAtIso: readOccurredAtField(doc) };
  } catch {
    // Any access error (cross-origin, detached frame, etc.) degrades silently.
    return { accessible: false, raw: {} };
  }
}

/**
 * Writes a value into a native text input so it's included when the user
 * clicks DHIS2's own Save/Complete button. Plain `input.value = x` does not
 * update React's internal state, so the next re-render would overwrite it
 * back to empty; this uses the native value setter + a real `input` event
 * so React's change handler observes it the same way a keystroke would.
 * Returns whether the write appeared to succeed (field found and set).
 */
export function tryWriteNativeRiskScore(
  hostWindow: Window | null | undefined,
  config: CvdRiskConfiguration,
  riskPercent: number,
): boolean {
  try {
    const doc = hostWindow?.document;
    const uid = config.dhis2MetadataMappings.outputDataElementIds.riskPercent;
    if (!doc || !uid) return false;

    const wrapper = doc.querySelector(`[data-test="form-field-${uid}"]`);
    const input = wrapper?.querySelector("input") as HTMLInputElement | null;
    if (!input) return false;

    const windowForInput = (input.ownerDocument?.defaultView ?? hostWindow) as (Window & { HTMLInputElement: typeof HTMLInputElement }) | null | undefined;
    const proto = windowForInput?.HTMLInputElement?.prototype ?? HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (!nativeSetter) return false;

    nativeSetter.call(input, String(riskPercent));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  } catch {
    return false;
  }
}
