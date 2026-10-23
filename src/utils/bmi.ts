/**
 * Computes body mass index (BMI) from height and weight, for the WHO
 * non-laboratory-based chart fallback when total cholesterol is
 * unavailable. Pure, deterministic, no I/O. Standard clinical formula:
 * BMI = weight(kg) / height(m)^2.
 */

const MIN_PLAUSIBLE_HEIGHT_CM = 100;
const MAX_PLAUSIBLE_HEIGHT_CM = 250;
const MIN_PLAUSIBLE_WEIGHT_KG = 20;
const MAX_PLAUSIBLE_WEIGHT_KG = 300;

/** Returns BMI (kg/m^2), or null if either input is missing, non-finite, or implausible. */
export function computeBmi(heightCm: number, weightKg: number): number | null {
  if (!Number.isFinite(heightCm) || !Number.isFinite(weightKg)) return null;
  if (heightCm < MIN_PLAUSIBLE_HEIGHT_CM || heightCm > MAX_PLAUSIBLE_HEIGHT_CM) return null;
  if (weightKg < MIN_PLAUSIBLE_WEIGHT_KG || weightKg > MAX_PLAUSIBLE_WEIGHT_KG) return null;
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}
