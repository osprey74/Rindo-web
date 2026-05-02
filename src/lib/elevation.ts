// Elevation profile fetching via OpenTopoData (SRTM 30m, free).
// https://www.opentopodata.org/datasets/srtm/
//
// Free tier limits (as of 2026):
//   - 1000 calls / day per IP
//   - 100 locations per call
//   - 1 call / second
//
// Strategy: down-sample the route to <= 100 points, fetch in a single POST,
// then compute cumulative distance / ascent / descent / max slope.

// Proxied through Vite (`/api/elevation` → OpenTopoData srtm30m). OpenTopoData
// does not return Access-Control-Allow-Origin so direct browser calls fail
// with "Failed to fetch"; the Vite dev proxy and the future backend handle
// the cross-origin call server-side.
const ELEVATION_URL = '/api/elevation'
const TARGET_SAMPLES = 60

export type ElevationPoint = {
  distance_km: number
  elevation_m: number
  lon: number
  lat: number
}

export type ElevationProfile = {
  points: ElevationPoint[]
  total_distance_km: number
  total_ascent_m: number
  total_descent_m: number
  max_slope_pct: number
  min_elevation_m: number
  max_elevation_m: number
}

function haversineMeters(a: [number, number], b: [number, number]): number {
  const R = 6371000
  const lat1 = (a[1] * Math.PI) / 180
  const lat2 = (b[1] * Math.PI) / 180
  const dLat = lat2 - lat1
  const dLon = ((b[0] - a[0]) * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

type Sample = {
  index: number
  lon: number
  lat: number
  cumulative_m: number
}

/**
 * Pick approximately TARGET_SAMPLES points evenly along the route.
 * Always includes the first and last points.
 */
function sampleRoute(coordinates: [number, number][]): Sample[] {
  if (coordinates.length === 0) return []

  const cumulative: number[] = [0]
  for (let i = 1; i < coordinates.length; i++) {
    cumulative.push(cumulative[i - 1] + haversineMeters(coordinates[i - 1], coordinates[i]))
  }

  if (coordinates.length <= TARGET_SAMPLES) {
    return coordinates.map(([lon, lat], index) => ({
      index,
      lon,
      lat,
      cumulative_m: cumulative[index],
    }))
  }

  const step = (coordinates.length - 1) / (TARGET_SAMPLES - 1)
  const samples: Sample[] = []
  for (let i = 0; i < TARGET_SAMPLES; i++) {
    const idx = i === TARGET_SAMPLES - 1 ? coordinates.length - 1 : Math.round(i * step)
    const [lon, lat] = coordinates[idx]
    samples.push({ index: idx, lon, lat, cumulative_m: cumulative[idx] })
  }
  return samples
}

type OpenTopoDataResponse = {
  status: string
  results: Array<{
    elevation: number | null
    location: { lat: number; lng: number }
    dataset: string
  }>
  error?: string
}

async function fetchElevations(samples: Sample[]): Promise<number[]> {
  // OpenTopoData accepts locations as a "lat,lng|lat,lng|..." pipe-delimited string.
  // The array-of-objects POST body format is documented elsewhere but rejected
  // by their server with INVALID_REQUEST as of 2026-05.
  const locations = samples.map((s) => `${s.lat},${s.lon}`).join('|')
  const res = await fetch(ELEVATION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locations }),
  })
  if (!res.ok) {
    let detail = ''
    try {
      const j = (await res.json()) as { error?: string }
      detail = j.error ?? ''
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(`標高取得失敗: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`)
  }
  const data = (await res.json()) as OpenTopoDataResponse
  if (data.status !== 'OK') {
    throw new Error(`標高取得失敗: ${data.error ?? data.status}`)
  }
  return data.results.map((r) => r.elevation ?? 0)
}

export async function fetchElevationProfile(
  coordinates: [number, number][],
): Promise<ElevationProfile> {
  if (coordinates.length < 2) {
    throw new Error('標高プロファイルには 2 点以上の座標が必要です')
  }
  const samples = sampleRoute(coordinates)
  const elevations = await fetchElevations(samples)

  const points: ElevationPoint[] = samples.map((s, i) => ({
    distance_km: s.cumulative_m / 1000,
    elevation_m: elevations[i],
    lon: s.lon,
    lat: s.lat,
  }))

  let total_ascent_m = 0
  let total_descent_m = 0
  let max_slope_pct = 0
  for (let i = 1; i < points.length; i++) {
    const dz = points[i].elevation_m - points[i - 1].elevation_m
    const dx_m = (points[i].distance_km - points[i - 1].distance_km) * 1000
    if (dz > 0) total_ascent_m += dz
    else total_descent_m += -dz
    if (dx_m > 0) {
      const slope = Math.abs((dz / dx_m) * 100)
      if (slope > max_slope_pct) max_slope_pct = slope
    }
  }

  const elevations_m = points.map((p) => p.elevation_m)
  return {
    points,
    total_distance_km: points[points.length - 1].distance_km,
    total_ascent_m,
    total_descent_m,
    max_slope_pct,
    min_elevation_m: Math.min(...elevations_m),
    max_elevation_m: Math.max(...elevations_m),
  }
}
