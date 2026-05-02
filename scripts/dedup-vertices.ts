// Remove consecutive duplicate vertices from sapporo-cyclingroad.corrected.geojson.
// QGIS editing can leave zero-length segments when vertices are accidentally moved
// onto each other. This script removes any consecutive vertex pair within
// TOLERANCE_M meters of each other, keeping the first.
//
// A backup is written to <target>.bak before the file is overwritten.

import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(SCRIPT_DIR, '..')
const TARGET = join(PROJECT_ROOT, 'sapporo-cyclingroad.corrected.geojson')
const BACKUP = TARGET + '.bak'

// Two consecutive vertices closer than this are treated as a single point.
// 0.1m is well below GPS / mapping precision but catches floating-point drift
// from QGIS save round-trips.
const TOLERANCE_M = 0.1

type LonLat = [number, number]
type LineString = { type: 'LineString'; coordinates: LonLat[] }
type MultiLineString = { type: 'MultiLineString'; coordinates: LonLat[][] }
type Geometry = LineString | MultiLineString
type Feature = { type: 'Feature'; properties: Record<string, unknown>; geometry: Geometry }
type FeatureCollection = {
  type: 'FeatureCollection'
  name?: string
  crs?: unknown
  features: Feature[]
}

function distanceM(a: LonLat, b: LonLat): number {
  const R = 6371000
  const lat1 = (a[1] * Math.PI) / 180
  const lat2 = (b[1] * Math.PI) / 180
  const dlat = lat2 - lat1
  const dlon = ((b[0] - a[0]) * Math.PI) / 180
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function dedup(coords: LonLat[]): LonLat[] {
  if (coords.length <= 1) return coords.slice()
  const out: LonLat[] = [coords[0]]
  for (let i = 1; i < coords.length; i++) {
    const prev = out[out.length - 1]
    const cur = coords[i]
    if (distanceM(prev, cur) >= TOLERANCE_M) out.push(cur)
  }
  return out
}

function countPoints(g: Geometry): number {
  if (g.type === 'LineString') return g.coordinates.length
  return g.coordinates.reduce((acc, line) => acc + line.length, 0)
}

const raw = readFileSync(TARGET, 'utf8')
const fc = JSON.parse(raw) as FeatureCollection

let totalBefore = 0
let totalAfter = 0
const reports: string[] = []

for (const f of fc.features) {
  const before = countPoints(f.geometry)
  if (f.geometry.type === 'LineString') {
    f.geometry.coordinates = dedup(f.geometry.coordinates)
  } else if (f.geometry.type === 'MultiLineString') {
    f.geometry.coordinates = f.geometry.coordinates.map(dedup)
  }
  const after = countPoints(f.geometry)
  totalBefore += before
  totalAfter += after
  if (before !== after) {
    const fid = f.properties.fid as number
    const name = f.properties.name as string
    reports.push(`  fid=${fid} "${name}": ${before} → ${after} pts (-${before - after})`)
  }
}

if (reports.length === 0) {
  console.log(`No duplicate vertices found in ${fc.features.length} features. File unchanged.`)
} else {
  console.log('Duplicates removed:')
  for (const r of reports) console.log(r)
  console.log()
  console.log(`Total: ${totalBefore} → ${totalAfter} pts (-${totalBefore - totalAfter})`)
  copyFileSync(TARGET, BACKUP)
  writeFileSync(TARGET, JSON.stringify(fc, null, 2) + '\n')
  console.log()
  console.log(`Backup: ${BACKUP}`)
  console.log(`Wrote:  ${TARGET}`)
}
