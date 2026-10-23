/**
 * Computes completed years of age from a date of birth, for deployments
 * where age is derived from a DHIS2 tracked entity attribute (date of
 * birth) rather than entered directly. Pure, deterministic, no I/O.
 */

/** Returns completed years between dateOfBirth and asOf (both ISO 8601 dates), or null if invalid/future. */
export function computeAgeFromDateOfBirth(
  dateOfBirthIso: string,
  asOfIso: string = new Date().toISOString().slice(0, 10),
): number | null {
  const dob = new Date(dateOfBirthIso);
  const asOf = new Date(asOfIso);
  if (Number.isNaN(dob.getTime()) || Number.isNaN(asOf.getTime())) return null;
  if (dob.getTime() > asOf.getTime()) return null;

  let age = asOf.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = asOf.getUTCMonth() - dob.getUTCMonth();
  const dayDiff = asOf.getUTCDate() - dob.getUTCDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }
  return age;
}
