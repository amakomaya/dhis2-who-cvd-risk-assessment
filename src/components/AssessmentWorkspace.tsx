/**
 * Minimal, fully automated assessment workflow. Fetches patient
 * demographics (tracked entity attributes) and current event measurements
 * from DHIS2 - or, when enabled, live-reads an unsaved native form via
 * src/unsupported/liveNativeFormBridge.ts - computes the WHO risk score
 * locally, writes it into the native Risk Score field so the user's own
 * Save/Complete/Update action persists it, and displays only the
 * color-coded risk factor table. No manual entry, no save button, no other
 * UI by design.
 */
import { useEffect, useMemo, useState } from "react";
import { Box } from "@dhis2/ui";
import { calculateCvdRiskWithAgeScreening } from "../domain/cvd-risk/calculateRisk";
import type { CvdRiskRawInput } from "../domain/cvd-risk/types";
import { RiskFactorTable } from "./RiskFactorTable";
import type { CvdRiskConfiguration } from "../config/schema";
import { fetchTrackedEntityAttributeValues } from "../services/dhis2TrackedEntity";
import { fetchEventMeasurementValues } from "../services/dhis2Event";
import { buildRawInputFromDhis2 } from "../config/buildRawInputFromDhis2";
import type { Dhis2DataEngine } from "../services/dhis2DataStore";
import { tryReadNativeFormValues, tryWriteNativeRiskScore } from "../unsupported/liveNativeFormBridge";

export interface AssessmentWorkspaceProps {
  config: CvdRiskConfiguration;
  engine: Dhis2DataEngine;
  /** Known up front from the Capture plugin's host props. Triggers an automatic demographics load. */
  trackedEntityInstanceId?: string;
  /** The current program stage event being viewed/edited, if it has been saved to DHIS2. */
  eventId?: string;
  /**
   * UNSUPPORTED. When true, attempts to read the native Capture form's
   * live, in-progress field values directly from the host document
   * (same-origin iframe reach-through) - both for a new, unsaved event and
   * for an existing event open in "Edit event" mode, so edits to any field
   * (e.g. total cholesterol) are reflected immediately instead of only the
   * once-on-mount snapshot from the Tracker API. Also writes the calculated
   * score back into the native Risk Score field on every recalculation. See
   * src/unsupported/liveNativeFormBridge.ts for why this is fragile.
   * Explicitly opted into by the caller; default off.
   */
  enableUnsupportedLiveFormPreview?: boolean;
}

export function AssessmentWorkspace({
  config,
  engine,
  trackedEntityInstanceId,
  eventId,
  enableUnsupportedLiveFormPreview = false,
}: AssessmentWorkspaceProps) {
  const [input, setInput] = useState<CvdRiskRawInput>({});
  // Age must be computed as of the event being scored, not always "today" -
  // otherwise reopening an old completed event shows the patient's current
  // age instead of their age on that visit. Tracked entity (DOB) and event
  // (occurredAt) load independently, so age is recomputed whenever either
  // becomes known, regardless of which fetch finishes first.
  const [dateOfBirthIso, setDateOfBirthIso] = useState<string | undefined>();
  const [assessmentDateIso, setAssessmentDateIso] = useState<string | undefined>();

  const result = useMemo(() => calculateCvdRiskWithAgeScreening(input), [input]);

  // Auto-load demographics when the host tells us who the patient is.
  useEffect(() => {
    if (!trackedEntityInstanceId) return;
    let cancelled = false;
    fetchTrackedEntityAttributeValues(engine, config, trackedEntityInstanceId).then((fetched) => {
      if (cancelled || fetched.status !== "ok") return;
      const prefilled = buildRawInputFromDhis2(config, {
        dateOfBirthIso: fetched.values.dateOfBirth,
        sexCode: fetched.values.sexCode,
      });
      setDateOfBirthIso(fetched.values.dateOfBirth);
      setInput((current) => ({ ...current, sex: prefilled.sex }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackedEntityInstanceId]);

  // Auto-load the saved event's already-entered clinical measurements.
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    fetchEventMeasurementValues(engine, config, eventId).then((fetched) => {
      if (cancelled || fetched.status !== "ok") return;
      setAssessmentDateIso(fetched.values.occurredAt);
      const prefilled = buildRawInputFromDhis2(config, {
        smokingStatusCode: fetched.values.smokingStatusCode,
        systolicBloodPressure: fetched.values.systolicBloodPressure,
        totalCholesterol: fetched.values.totalCholesterol,
        diabetesStatusCode: fetched.values.diabetesStatusCode,
        heightCm: fetched.values.heightCm,
        weightKg: fetched.values.weightKg,
      });
      setInput((current) => ({
        ...current,
        smokingStatus: prefilled.smokingStatus ?? current.smokingStatus,
        systolicBloodPressureMmHg: prefilled.systolicBloodPressureMmHg ?? current.systolicBloodPressureMmHg,
        totalCholesterol: prefilled.totalCholesterol ?? current.totalCholesterol,
        totalCholesterolUnit: prefilled.totalCholesterolUnit ?? current.totalCholesterolUnit,
        diabetesStatus: prefilled.diabetesStatus ?? current.diabetesStatus,
        heightCm: prefilled.heightCm ?? current.heightCm,
        weightKg: prefilled.weightKg ?? current.weightKg,
      }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // Recomputes age whenever date of birth or the event's own date becomes
  // known, independent of which of the two fetches above resolves first.
  useEffect(() => {
    if (!dateOfBirthIso) return;
    const prefilled = buildRawInputFromDhis2(config, { dateOfBirthIso, assessmentDateIso });
    setInput((current) => ({ ...current, age: prefilled.age }));
    // config is stable for the component's lifetime; only the dates matter here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateOfBirthIso, assessmentDateIso]);

  // UNSUPPORTED live-preview polling. Reads the native Capture form's
  // in-progress values directly from the host document every 750ms - for
  // both a new, unsaved event and an existing event open in "Edit event"
  // mode, so a change to any field (e.g. cholesterol) is picked up
  // immediately rather than only the once-on-mount Tracker API snapshot
  // fetched above. Harmless when the page is read-only (no inputs to find,
  // tryReadNativeFormValues just reports nothing changed).
  useEffect(() => {
    if (!enableUnsupportedLiveFormPreview) return;
    const poll = () => {
      const hostWindow = window.parent !== window ? window.parent : null;
      const { accessible, raw, occurredAtIso } = tryReadNativeFormValues(hostWindow, config);
      if (!accessible) return;
      if (occurredAtIso) setAssessmentDateIso(occurredAtIso);
      setInput((current) => ({
        ...current,
        systolicBloodPressureMmHg: raw.systolicBloodPressureMmHg,
        totalCholesterol: raw.totalCholesterol,
        totalCholesterolUnit: raw.totalCholesterolUnit,
        heightCm: raw.heightCm,
        weightKg: raw.weightKg,
        smokingStatus: raw.smokingStatus,
        diabetesStatus: raw.diabetesStatus,
      }));
    };
    poll();
    const intervalId = window.setInterval(poll, 750);
    return () => window.clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableUnsupportedLiveFormPreview, eventId]);

  // Whenever a calculated result exists, write it into the native Risk
  // Score field - on both the new-event page and an existing saved event's
  // edit page - so DHIS2's own Save/Complete/Update button persists it as
  // part of the user's normal workflow. This is the only persistence path.
  useEffect(() => {
    if (!enableUnsupportedLiveFormPreview) return;
    if (result.status !== "calculated" || result.riskPercent === undefined) return;
    const hostWindow = window.parent !== window ? window.parent : null;
    tryWriteNativeRiskScore(hostWindow, config, result.riskPercent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableUnsupportedLiveFormPreview, result]);

  return (
    <main>
      <Box maxWidth="480px" width="100%">
        <RiskFactorTable result={result} rawInput={input} />
      </Box>
    </main>
  );
}
