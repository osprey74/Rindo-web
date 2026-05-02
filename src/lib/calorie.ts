// Calorie estimation from a Valhalla-resolved route plus optional elevation profile.
//
// Formula (HANDOFF_cycling-nav.md L235-241):
//   kcal = MET × weight_kg × hours
//   MET (flat)  = 7.5
//   MET (grade) = 7.5 × (1 + grade_pct × 0.1)   // grade_pct only counts climbing
//
// Approach: average ascent gradient across the whole route gives a reasonable
// scalar adjustment without per-segment integration.

import type { ElevationProfile } from './elevation'

const MET_FLAT = 7.5
const GRADE_FACTOR = 0.1

export function estimateCalories(args: {
  weight_kg: number
  duration_min: number
  distance_km: number
  ascent_m?: number | null
}): number {
  const { weight_kg, duration_min, distance_km } = args
  const ascent_m = args.ascent_m ?? 0
  const hours = duration_min / 60

  // Average climbing gradient: ascent (m) / horizontal distance (m) × 100
  const distance_m = distance_km * 1000
  const avgGradePct = distance_m > 0 ? Math.max(0, (ascent_m / distance_m) * 100) : 0

  const met = MET_FLAT * (1 + avgGradePct * GRADE_FACTOR)
  return met * weight_kg * hours
}

export function estimateCaloriesFromProfile(
  weight_kg: number,
  duration_min: number,
  profile: ElevationProfile | null,
): number | null {
  if (!Number.isFinite(weight_kg) || weight_kg <= 0) return null
  if (!Number.isFinite(duration_min) || duration_min <= 0) return null
  return estimateCalories({
    weight_kg,
    duration_min,
    distance_km: profile?.total_distance_km ?? 0,
    ascent_m: profile?.total_ascent_m ?? 0,
  })
}
