// Fetch parking lots and convenience stores near the start and end of a route
// via Overpass API (proxied through Vite to avoid CORS).
//
// Search radii (HANDOFF L273 suggests 2km for parking; reduced here to keep the
// result count manageable on the map):
//   - parking (amenity=parking):     1000m
//   - convenience (shop=convenience): 500m

import type { LonLat } from './routing'

const OVERPASS_URL = '/api/overpass'
const PARKING_RADIUS_M = 1000
const CONVENIENCE_RADIUS_M = 500

export type FacilityType = 'parking' | 'convenience'

export type Facility = {
  id: string
  type: FacilityType
  lat: number
  lon: number
  name: string | null
}

type OverpassElement = {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

type OverpassResponse = {
  elements: OverpassElement[]
  remark?: string
}

function classify(tags: Record<string, string> | undefined): FacilityType | null {
  if (!tags) return null
  if (tags.amenity === 'parking') return 'parking'
  if (tags.shop === 'convenience') return 'convenience'
  return null
}

function elementCoordinates(el: OverpassElement): { lat: number; lon: number } | null {
  if (typeof el.lat === 'number' && typeof el.lon === 'number') {
    return { lat: el.lat, lon: el.lon }
  }
  if (el.center) {
    return el.center
  }
  return null
}

export async function fetchNearbyFacilities(
  start: LonLat,
  end: LonLat,
): Promise<Facility[]> {
  const query = `
    [out:json][timeout:25];
    (
      nwr["amenity"="parking"](around:${PARKING_RADIUS_M},${start.lat},${start.lon});
      nwr["amenity"="parking"](around:${PARKING_RADIUS_M},${end.lat},${end.lon});
      nwr["shop"="convenience"](around:${CONVENIENCE_RADIUS_M},${start.lat},${start.lon});
      nwr["shop"="convenience"](around:${CONVENIENCE_RADIUS_M},${end.lat},${end.lon});
    );
    out center;
  `.trim()

  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  })
  if (!res.ok) {
    throw new Error(`近隣施設取得失敗: ${res.status} ${res.statusText}`)
  }
  const data = (await res.json()) as OverpassResponse

  const seen = new Set<string>()
  const facilities: Facility[] = []
  for (const el of data.elements) {
    const type = classify(el.tags)
    if (!type) continue
    const coords = elementCoordinates(el)
    if (!coords) continue
    const id = `${el.type}/${el.id}`
    if (seen.has(id)) continue
    seen.add(id)
    facilities.push({
      id,
      type,
      lat: coords.lat,
      lon: coords.lon,
      name: el.tags?.name ?? el.tags?.brand ?? null,
    })
  }
  return facilities
}
