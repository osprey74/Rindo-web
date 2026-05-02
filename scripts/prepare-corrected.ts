// Strip Valhalla matching metadata from sapporo-cyclingroad.matched.geojson and emit a
// clean GeoJSON suitable for QGIS editing. The output file becomes the authoritative
// source after the user finishes manual correction in QGIS.
//
// Geometry is emitted as MultiLineString so that QGIS allows merging non-touching
// features into a single feature without the "single-part / multi-part incompatible" error.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(SCRIPT_DIR, '..')
const INPUT = join(PROJECT_ROOT, 'sapporo-cyclingroad.matched.geojson')
const OUTPUT = join(PROJECT_ROOT, 'sapporo-cyclingroad.corrected.geojson')

type LonLat = [number, number]
type LineString = { type: 'LineString'; coordinates: LonLat[] }
type MultiLineString = { type: 'MultiLineString'; coordinates: LonLat[][] }

type CleanProperties = {
  fid: number
  name: string
  ward: string | null
  road_type: 'exclusive' | 'shared'
  source: string
}

type SourceFeature = { type: 'Feature'; properties: Record<string, unknown>; geometry: LineString }
type SourceFeatureCollection = {
  type: 'FeatureCollection'
  name?: string
  crs?: unknown
  features: SourceFeature[]
}

type CleanFeature = { type: 'Feature'; properties: CleanProperties; geometry: MultiLineString }
type CleanFeatureCollection = {
  type: 'FeatureCollection'
  name?: string
  crs?: unknown
  features: CleanFeature[]
}

const raw = readFileSync(INPUT, 'utf8')
const fc = JSON.parse(raw) as SourceFeatureCollection

const out: CleanFeatureCollection = {
  type: 'FeatureCollection',
  name: 'sapporo-cyclingroad-corrected',
  crs: fc.crs,
  features: fc.features.map((f) => ({
    type: 'Feature',
    properties: {
      fid: f.properties.fid as number,
      name: f.properties.name as string,
      ward: (f.properties.ward as string | null) ?? null,
      road_type: ((f.properties.road_type as string) ?? '').trim() as 'exclusive' | 'shared',
      source: (f.properties.source as string) ?? '',
    },
    geometry: {
      type: 'MultiLineString',
      coordinates: [f.geometry.coordinates],
    },
  })),
}

writeFileSync(OUTPUT, JSON.stringify(out, null, 2) + '\n')

const totalPoints = out.features.reduce(
  (acc, f) => acc + f.geometry.coordinates.reduce((a, line) => a + line.length, 0),
  0,
)
console.log(`Wrote ${out.features.length} features (${totalPoints} total points) to ${OUTPUT}`)
