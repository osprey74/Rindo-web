// Fetch OSM bicycle route relations (`type=route, route=bicycle`) for the 道央圏
// area via Overpass API. Each relation becomes one MultiLineString feature with
// the relation's tags as properties.
//
// Usage: bun run scripts/fetch-osm-bicycle-routes.ts
//
// Bbox matches the Valhalla extract scope. Relations that have no member ways
// inside the bbox (e.g., regional routes barely clipped at the edge) are kept
// only if at least one member way has resolvable geometry.

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(SCRIPT_DIR, '..')
const OUTPUT = join(PROJECT_ROOT, 'dosou-osm-bicycle-routes.geojson')

// DISPLAY_BBOX = Layer 3 (curated cycling roads) extent + ~3km buffer.
// Used both as the Overpass query bbox and as a strict containment filter so that
// relations whose member ways extend outside Sapporo proper are dropped entirely
// (e.g., 札幌恵庭線 spans Sapporo→Eniwa and is excluded). Per HANDOFF policy:
// routes are not clipped, only included if fully contained.
const DISPLAY_BBOX = { south: 42.89, west: 141.21, north: 43.19, east: 141.6 }
const BBOX = DISPLAY_BBOX

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
]

const QUERY = `
[out:json][timeout:90];
(
  relation["type"="route"]["route"="bicycle"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
);
(._;>;);
out geom;
`.trim()

type LonLat = [number, number]

type OverpassWay = {
  type: 'way'
  id: number
  tags?: Record<string, string>
  geometry?: Array<{ lat: number; lon: number }>
}

type OverpassRelationMember = {
  type: 'way' | 'node' | 'relation'
  ref: number
  role?: string
}

type OverpassRelation = {
  type: 'relation'
  id: number
  tags?: Record<string, string>
  members: OverpassRelationMember[]
}

type OverpassNode = {
  type: 'node'
  id: number
}

type OverpassElement = OverpassWay | OverpassRelation | OverpassNode

type OverpassResponse = {
  elements: OverpassElement[]
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

const relations = data.elements.filter(
  (e): e is OverpassRelation =>
    e.type === 'relation' && e.tags?.type === 'route' && e.tags?.route === 'bicycle',
)

const wayMap = new Map<number, OverpassWay>()
for (const e of data.elements) {
  if (e.type === 'way' && Array.isArray((e as OverpassWay).geometry)) {
    wayMap.set(e.id, e as OverpassWay)
  }
}

console.log(
  `Received ${relations.length} bicycle route relations referencing ${wayMap.size} ways with geometry.`,
)

function isInsideDisplayBbox([lon, lat]: LonLat): boolean {
  return (
    lon >= DISPLAY_BBOX.west &&
    lon <= DISPLAY_BBOX.east &&
    lat >= DISPLAY_BBOX.south &&
    lat <= DISPLAY_BBOX.north
  )
}

let droppedForOutOfBbox = 0
const features = relations
  .map((rel) => {
    const lines: LonLat[][] = []
    for (const member of rel.members) {
      if (member.type !== 'way') continue
      const way = wayMap.get(member.ref)
      if (!way?.geometry || way.geometry.length < 2) continue
      lines.push(way.geometry.map((p) => [p.lon, p.lat]))
    }
    if (lines.length === 0) return null
    const fullyInside = lines.every((line) => line.every(isInsideDisplayBbox))
    if (!fullyInside) {
      droppedForOutOfBbox += 1
      return null
    }
    return {
      type: 'Feature' as const,
      id: rel.id,
      properties: {
        osm_relation_id: rel.id,
        ...(rel.tags ?? {}),
      },
      geometry: {
        type: 'MultiLineString' as const,
        coordinates: lines,
      },
    }
  })
  .filter((f): f is NonNullable<typeof f> => f !== null)

console.log(
  `Filtered: ${features.length} relations fully inside DISPLAY_BBOX (dropped ${droppedForOutOfBbox} that extend outside).`,
)

const featureCollection = {
  type: 'FeatureCollection' as const,
  name: 'dosou-osm-bicycle-routes',
  attribution: '© OpenStreetMap contributors',
  metadata: {
    source: 'Overpass API',
    query: QUERY,
    bbox: BBOX,
    display_bbox: DISPLAY_BBOX,
    fetched_at: new Date().toISOString(),
    osm_timestamp: data.osm3s?.timestamp_osm_base ?? null,
    relation_count: features.length,
    relation_count_before_filter: relations.length,
  },
  features,
}

writeFileSync(OUTPUT, JSON.stringify(featureCollection) + '\n')

const totalParts = features.reduce((acc, f) => acc + f.geometry.coordinates.length, 0)
const totalPoints = features.reduce(
  (acc, f) => acc + f.geometry.coordinates.reduce((a, line) => a + line.length, 0),
  0,
)
console.log()
console.log(`Wrote ${features.length} relation features (${totalParts} parts, ${totalPoints} points) to ${OUTPUT}`)

if (features.length > 0) {
  console.log()
  console.log('Sample relations:')
  for (const f of features.slice(0, 8)) {
    const tags = f.properties as Record<string, unknown>
    const name = tags.name ?? tags['name:ja'] ?? tags['name:en'] ?? '(no name)'
    const network = tags.network ?? '-'
    const ref = tags.ref ?? '-'
    console.log(`  rel=${f.properties.osm_relation_id}  network=${network}  ref=${ref}  name=${name}`)
  }
}
