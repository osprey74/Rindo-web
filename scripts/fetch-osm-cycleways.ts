// Fetch OSM `highway=cycleway` ways for the Sapporo area via Overpass API and
// save as GeoJSON. Run periodically to refresh Layer 1 in MapView.
//
// Usage: bun run scripts/fetch-osm-cycleways.ts
//
// Bbox is slightly larger than the corrected.geojson extent so that future route
// expansions outside Sapporo proper are still covered.

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(SCRIPT_DIR, '..')
const OUTPUT = join(PROJECT_ROOT, 'sapporo-osm-cycleways.geojson')

// DISPLAY_BBOX = Layer 3 (curated cycling roads) extent + ~3km buffer.
// Used both as the Overpass query bbox and as a strict containment filter so that
// only ways whose every node lies inside Sapporo proper survive. Ways that cross
// the boundary are dropped entirely (rather than clipped) per HANDOFF policy.
const DISPLAY_BBOX = { south: 42.89, west: 141.21, north: 43.19, east: 141.6 }
const BBOX = DISPLAY_BBOX

// Public Overpass endpoints. Fallback list because the primary one occasionally
// rate-limits or is down for maintenance.
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
]

const QUERY = `
[out:json][timeout:60];
(
  way["highway"="cycleway"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
);
out geom;
`.trim()

type OverpassWay = {
  type: 'way'
  id: number
  tags?: Record<string, string>
  geometry?: Array<{ lat: number; lon: number }>
}

type OverpassResponse = {
  elements: OverpassWay[]
  generator?: string
  osm3s?: { timestamp_osm_base?: string }
}

async function fetchFromOverpass(): Promise<OverpassResponse> {
  let lastError = ''
  for (const endpoint of OVERPASS_ENDPOINTS) {
    console.log(`Querying ${endpoint}...`)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(QUERY)}`,
      })
      if (!res.ok) {
        lastError = `${endpoint}: ${res.status} ${res.statusText}`
        console.log(`  failed: ${lastError}`)
        continue
      }
      return (await res.json()) as OverpassResponse
    } catch (e) {
      lastError = `${endpoint}: ${(e as Error).message}`
      console.log(`  failed: ${lastError}`)
    }
  }
  throw new Error(`All Overpass endpoints failed. Last error: ${lastError}`)
}

const data = await fetchFromOverpass()

const allWays = data.elements.filter(
  (e): e is OverpassWay & { geometry: NonNullable<OverpassWay['geometry']> } =>
    e.type === 'way' && Array.isArray(e.geometry) && e.geometry.length >= 2,
)

const ways = allWays.filter((way) =>
  way.geometry.every(
    (p) =>
      p.lon >= DISPLAY_BBOX.west &&
      p.lon <= DISPLAY_BBOX.east &&
      p.lat >= DISPLAY_BBOX.south &&
      p.lat <= DISPLAY_BBOX.north,
  ),
)

console.log(
  `Received ${data.elements.length} elements, ${allWays.length} cycleway ways, ${ways.length} fully inside DISPLAY_BBOX.`,
)

const featureCollection = {
  type: 'FeatureCollection' as const,
  name: 'sapporo-osm-cycleways',
  attribution: '© OpenStreetMap contributors',
  metadata: {
    source: 'Overpass API',
    query: QUERY,
    bbox: BBOX,
    display_bbox: DISPLAY_BBOX,
    fetched_at: new Date().toISOString(),
    osm_timestamp: data.osm3s?.timestamp_osm_base ?? null,
    way_count: ways.length,
    way_count_before_filter: allWays.length,
  },
  features: ways.map((way) => ({
    type: 'Feature' as const,
    id: way.id,
    properties: {
      osm_id: way.id,
      ...(way.tags ?? {}),
    },
    geometry: {
      type: 'LineString' as const,
      coordinates: way.geometry.map((p) => [p.lon, p.lat]),
    },
  })),
}

writeFileSync(OUTPUT, JSON.stringify(featureCollection) + '\n')

const totalPoints = featureCollection.features.reduce(
  (acc, f) => acc + f.geometry.coordinates.length,
  0,
)
console.log()
console.log(`Wrote ${featureCollection.features.length} features (${totalPoints} points) to ${OUTPUT}`)
