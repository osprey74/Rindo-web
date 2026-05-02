// Snap PDF-digitized cycling roads to OSM via Valhalla /trace_attributes (bicycle costing).
// Run after Valhalla container is up: `bun run scripts/match-cycling-roads.ts`

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const VALHALLA_URL = process.env.VALHALLA_URL ?? 'http://localhost:8002'
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(SCRIPT_DIR, '..')
const INPUT = join(PROJECT_ROOT, 'sapporo-cyclingroad.geojson')
const OUTPUT = join(PROJECT_ROOT, 'sapporo-cyclingroad.matched.geojson')

type LonLat = [number, number]
type LineString = { type: 'LineString'; coordinates: LonLat[] }

type SourceProperties = {
  fid: number
  name: string
  ward: string | null
  road_type: string
  source: string
}

type MatchQuality = 'high' | 'medium' | 'low' | 'unmatched'

type MatchedProperties = Omit<SourceProperties, 'road_type'> & {
  road_type: 'exclusive' | 'shared'
  matched_at: string
  matched_by: string
  match_confidence: number
  match_max_distance_m: number
  match_quality: MatchQuality
  match_error?: string
  original_geometry?: LineString
}

type SourceFeature = {
  type: 'Feature'
  properties: SourceProperties
  geometry: LineString
}

type MatchedFeature = {
  type: 'Feature'
  properties: MatchedProperties
  geometry: LineString
}

type FeatureCollection<P> = {
  type: 'FeatureCollection'
  name?: string
  crs?: unknown
  features: Array<{ type: 'Feature'; properties: P; geometry: LineString }>
}

// Decode encoded polyline (Google algorithm). Valhalla uses precision 6 by default.
function decodePolyline(str: string, precision = 6): LonLat[] {
  const factor = 10 ** precision
  const coords: LonLat[] = []
  let index = 0
  let lat = 0
  let lon = 0
  while (index < str.length) {
    let shift = 0
    let result = 0
    let byte: number
    do {
      byte = str.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    lat += (result & 1) !== 0 ? ~(result >> 1) : result >> 1
    shift = 0
    result = 0
    do {
      byte = str.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    lon += (result & 1) !== 0 ? ~(result >> 1) : result >> 1
    coords.push([lon / factor, lat / factor])
  }
  return coords
}

type TraceAttributesResponse = {
  shape: string
  confidence_score: number
  raw_score?: number
  matched_points?: Array<{
    type?: string
    distance_from_trace_point?: number
    edge_index?: number
  }>
}

type MatchSuccess = {
  ok: true
  matched: LonLat[]
  confidence: number
  max_distance_m: number
}
type MatchFailure = { ok: false; error: string }

async function matchOne(coords: LonLat[]): Promise<MatchSuccess | MatchFailure> {
  const shape = coords.map(([lon, lat]) => ({ lat, lon }))
  const body = JSON.stringify({
    shape,
    costing: 'bicycle',
    shape_match: 'map_snap',
  })
  let res: Response
  try {
    res = await fetch(`${VALHALLA_URL}/trace_attributes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
  } catch (e) {
    return { ok: false, error: `network: ${(e as Error).message}` }
  }
  if (!res.ok) {
    let detail = ''
    try {
      const j = (await res.json()) as { error?: string }
      detail = j.error ?? ''
    } catch {
      // ignore
    }
    return { ok: false, error: `${res.status} ${res.statusText}${detail ? ' — ' + detail : ''}` }
  }
  const data = (await res.json()) as TraceAttributesResponse
  if (!data.shape) return { ok: false, error: 'no shape in response' }
  const matched = decodePolyline(data.shape, 6)
  const distances = (data.matched_points ?? []).map((p) => p.distance_from_trace_point ?? 0)
  const max_distance_m = distances.length ? Math.max(...distances) : 0
  return {
    ok: true,
    matched,
    confidence: data.confidence_score ?? 0,
    max_distance_m,
  }
}

function classifyQuality(confidence: number, maxDistanceM: number): MatchQuality {
  if (confidence >= 0.8 && maxDistanceM < 50) return 'high'
  if (confidence >= 0.5 && maxDistanceM < 150) return 'medium'
  return 'low'
}

async function main(): Promise<void> {
  const raw = readFileSync(INPUT, 'utf8')
  const fc = JSON.parse(raw) as FeatureCollection<SourceProperties>
  const matched_at = new Date().toISOString()
  const matched_by = 'valhalla_3.7.0'

  console.log(`Matching ${fc.features.length} cycling roads via ${VALHALLA_URL}/trace_attributes`)
  console.log()

  const out: FeatureCollection<MatchedProperties> = {
    type: 'FeatureCollection',
    name: 'sapporo-cyclingroad-matched',
    crs: fc.crs,
    features: [],
  }

  for (const f of fc.features as SourceFeature[]) {
    const props = { ...f.properties }
    const road_type = (props.road_type ?? '').trim() as 'exclusive' | 'shared'
    const baseProps = {
      fid: props.fid,
      name: props.name,
      ward: props.ward,
      source: props.source,
      road_type,
      matched_at,
      matched_by,
    }

    const result = await matchOne(f.geometry.coordinates)

    if (!result.ok) {
      console.log(`  fid=${props.fid} "${props.name}" → UNMATCHED (${result.error})`)
      out.features.push({
        type: 'Feature',
        properties: {
          ...baseProps,
          match_confidence: 0,
          match_max_distance_m: 0,
          match_quality: 'unmatched',
          match_error: result.error,
        },
        geometry: f.geometry,
      })
      continue
    }

    const quality = classifyQuality(result.confidence, result.max_distance_m)
    console.log(
      `  fid=${props.fid} "${props.name}" → ${quality.padEnd(7)} conf=${result.confidence.toFixed(2)}  max_dist=${result.max_distance_m.toFixed(1).padStart(6)}m  pts=${f.geometry.coordinates.length}→${result.matched.length}`,
    )

    if (quality === 'low') {
      out.features.push({
        type: 'Feature',
        properties: {
          ...baseProps,
          match_confidence: result.confidence,
          match_max_distance_m: result.max_distance_m,
          match_quality: quality,
        },
        geometry: f.geometry,
      })
    } else {
      out.features.push({
        type: 'Feature',
        properties: {
          ...baseProps,
          match_confidence: result.confidence,
          match_max_distance_m: result.max_distance_m,
          match_quality: quality,
          original_geometry: f.geometry,
        },
        geometry: { type: 'LineString', coordinates: result.matched },
      })
    }
  }

  writeFileSync(OUTPUT, JSON.stringify(out, null, 2) + '\n')

  const counts = out.features.reduce<Record<MatchQuality, number>>(
    (acc, f) => {
      const q = (f.properties as MatchedProperties).match_quality
      acc[q] = (acc[q] ?? 0) + 1
      return acc
    },
    { high: 0, medium: 0, low: 0, unmatched: 0 },
  )

  console.log()
  console.log(`Wrote ${out.features.length} features to ${OUTPUT}`)
  console.log(`Quality distribution:`, counts)
}

await main()
