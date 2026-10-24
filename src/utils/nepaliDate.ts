/**
 * Converts a Bikram Sambat (Nepali calendar) date string, as displayed by
 * DHIS2's native date-entry widgets on deployments configured for the
 * Nepali calendar (e.g. erecord.hmis.gov.np), to its Gregorian/ISO 8601
 * equivalent. The database/Tracker API always stores and returns dates in
 * Gregorian - only the live DOM input's displayed value is in BS - so this
 * conversion is needed before that value can be used in age math (see
 * src/utils/age.ts).
 */
import { convertToIso8601 } from "@dhis2/multi-calendar-dates";

/** Returns the ISO 8601 (yyyy-MM-dd) equivalent of a Nepali-calendar date string, or null if invalid. */
export function convertNepaliDateToIso(nepaliDateIso: string): string | null {
  try {
    const { year, month, day } = convertToIso8601(nepaliDateIso, "nepali");
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${year}-${pad(month)}-${pad(day)}`;
  } catch {
    return null;
  }
}

/**
 * How far ahead of the current Gregorian year a read date's year must be
 * before it's treated as Nepali (BS) rather than Gregorian. The Nepali
 * calendar currently runs ~56-57 years ahead of Gregorian, and the field
 * this is used for (occurredAt) is always "around now" in whichever
 * calendar it was entered in - so any margin comfortably below that gap
 * (and comfortably above zero, to tolerate a Gregorian date a few years in
 * the past or future) safely separates the two.
 */
const NEPALI_YEAR_DETECTION_MARGIN = 20;

/**
 * Resolves a live-read date-field value (see liveNativeFormBridge.ts) to
 * Gregorian ISO 8601, without assuming which calendar the host app's date
 * widget uses. Confirmed by live inspection on 2026-10-24 that the
 * standard Capture app (/apps/capture) renders this field in Gregorian -
 * matching this DHIS2 instance's "iso8601" system calendar setting - while
 * the separately maintained eRecord app (/apps/e-record) renders the same
 * field in the Nepali (Bikram Sambat) calendar regardless of that system
 * setting. There is no documented way to ask the host which calendar its
 * own widget used, so this infers it from the value's year instead (see
 * NEPALI_YEAR_DETECTION_MARGIN). Returns null if the value isn't a
 * recognizable yyyy-MM-dd date in either calendar.
 */
export function resolveLiveOccurredAtToIso(rawValue: string, referenceDate: Date = new Date()): string | null {
  const year = Number.parseInt(rawValue.slice(0, 4), 10);
  if (!Number.isInteger(year)) return null;

  const looksNepali = year > referenceDate.getFullYear() + NEPALI_YEAR_DETECTION_MARGIN;
  if (!looksNepali) {
    return /^\d{4}-\d{2}-\d{2}$/.test(rawValue) ? rawValue : null;
  }
  return convertNepaliDateToIso(rawValue);
}
