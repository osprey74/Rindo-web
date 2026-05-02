// Tag features in sapporo-cyclingroad.corrected.geojson that correspond to
// 北海道大規模自転車道 (Hokkaido large-scale cycling roads, designated by 北海道庁,
// CC-BY: 北海道建設部土木局提供).
//
// Of the 10 large-scale routes in Hokkaido, 2 fall within Sapporo and are
// already present in our curated dataset:
//   - 真駒内茨戸東雁来自転車道路 (split by ward: fid=1, 2, 3)
//   - 滝野上野幌自転車道路 (split by ward: fid=10, 11)
// The remaining 8 routes are outside the 道央圏 PBF extract scope and are
// out of scope for routing.
//
// This script is additive: it only sets the `large_scale` property and writes
// a backup to <target>.bak before overwriting.

import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(SCRIPT_DIR, '..')
const TARGET = join(PROJECT_ROOT, 'sapporo-cyclingroad.corrected.geojson')
const BACKUP = TARGET + '.bak'

const LARGE_SCALE_FIDS = new Set<number>([1, 2, 3, 10, 11])

type AnyFeature = {
  type: 'Feature'
  properties: Record<string, unknown>
  geometry: unknown
}

type FeatureCollection = {
  type: 'FeatureCollection'
  name?: string
  crs?: unknown
  features: AnyFeature[]
}

const raw = readFileSync(TARGET, 'utf8')
const fc = JSON.parse(raw) as FeatureCollection

let changed = 0
const changes: string[] = []

for (const f of fc.features) {
  const fid = f.properties.fid as number
  const expected = LARGE_SCALE_FIDS.has(fid)
  const current = f.properties.large_scale === true
  if (expected !== current) {
    f.properties.large_scale = expected
    changed += 1
    const name = String(f.properties.name ?? '')
    changes.push(`  fid=${fid} "${name}": large_scale = ${expected}`)
  }
}

if (changed === 0) {
  console.log(`No changes needed. ${LARGE_SCALE_FIDS.size} features already tagged.`)
} else {
  for (const c of changes) console.log(c)
  console.log()
  console.log(`Updated ${changed} features.`)
  copyFileSync(TARGET, BACKUP)
  writeFileSync(TARGET, JSON.stringify(fc, null, 2) + '\n')
  console.log(`Backup: ${BACKUP}`)
  console.log(`Wrote:  ${TARGET}`)
}
