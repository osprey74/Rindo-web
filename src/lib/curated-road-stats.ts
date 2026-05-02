// Helpers for the cycling-road click popup. Computes line length, formats
// metadata strings, and renders the popup HTML (initial skeleton + filled).

import type { ElevationProfile } from './elevation'

export type CuratedRoadProperties = {
  fid: number
  name: string
  ward?: string | null
  road_type: 'exclusive' | 'shared'
  source?: string | null
  large_scale?: boolean
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

function lineLength(coords: [number, number][]): number {
  let total = 0
  for (let i = 1; i < coords.length; i++) {
    total += haversineMeters(coords[i - 1], coords[i])
  }
  return total
}

/** Flatten a (Multi)LineString to a single coordinate array. */
export function geometryToCoords(geom: GeoJSON.Geometry): [number, number][] {
  if (geom.type === 'LineString') return geom.coordinates as [number, number][]
  if (geom.type === 'MultiLineString') {
    return (geom.coordinates as [number, number][][]).flat()
  }
  return []
}

/** Total line length (meters), summed per segment for MultiLineString. */
export function geometryLengthMeters(geom: GeoJSON.Geometry): number {
  if (geom.type === 'LineString') return lineLength(geom.coordinates as [number, number][])
  if (geom.type === 'MultiLineString') {
    return (geom.coordinates as [number, number][][]).reduce(
      (sum, seg) => sum + lineLength(seg),
      0,
    )
  }
  return 0
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const ROAD_TYPE_LABEL: Record<CuratedRoadProperties['road_type'], string> = {
  exclusive: '自転車歩行者専用',
  shared: '一般道路共用',
}

const SPARK_W = 260
const SPARK_H = 56

function sparklineSVG(profile: ElevationProfile): string {
  const yMin = profile.min_elevation_m
  const yMax = profile.max_elevation_m
  const yRange = Math.max(yMax - yMin, 1)
  const totalKm = profile.total_distance_km

  const scaleX = (km: number) => (totalKm > 0 ? (km / totalKm) * SPARK_W : 0)
  const scaleY = (m: number) => SPARK_H - ((m - yMin) / yRange) * (SPARK_H - 4) - 2

  const linePath = profile.points
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'} ${scaleX(p.distance_km).toFixed(1)} ${scaleY(p.elevation_m).toFixed(1)}`,
    )
    .join(' ')
  const fillPath = `${linePath} L ${SPARK_W.toFixed(1)} ${SPARK_H.toFixed(1)} L 0 ${SPARK_H.toFixed(1)} Z`

  return `<svg class="curated-popup-spark" viewBox="0 0 ${SPARK_W} ${SPARK_H}" preserveAspectRatio="none" role="img" aria-label="標高プロファイル">
    <path d="${fillPath}" fill="#3B82F6" fill-opacity="0.18" />
    <path d="${linePath}" fill="none" stroke="#2563EB" stroke-width="1.6" />
  </svg>`
}

function metaHTML(props: CuratedRoadProperties): string {
  const parts: string[] = []
  if (props.ward) parts.push(`<span>${escapeHtml(props.ward)}</span>`)
  parts.push(`<span>${ROAD_TYPE_LABEL[props.road_type]}</span>`)
  if (props.large_scale) {
    parts.push('<span class="curated-popup-large">大規模自転車道</span>')
  }
  return `<div class="curated-popup-meta">${parts.join('')}</div>`
}

function statRow(label: string, value: string): string {
  return `<div class="curated-popup-stat"><span>${label}</span><strong>${value}</strong></div>`
}

const IMPORT_BUTTON = `<button type="button" class="curated-popup-import" data-action="import-route">ルートを取り込む</button>`

/** Initial popup shown immediately on click. Stats / chart are placeholders. */
export function popupSkeletonHTML(
  props: CuratedRoadProperties,
  lengthMeters: number,
): string {
  const km = (lengthMeters / 1000).toFixed(2)
  return `<div class="curated-popup">
    <div class="curated-popup-name">${escapeHtml(props.name)}</div>
    ${metaHTML(props)}
    <div class="curated-popup-stats">
      ${statRow('距離', `${km} km`)}
      ${statRow('↑ 上昇', '— m')}
      ${statRow('↓ 下降', '— m')}
      ${statRow('最大勾配', '— %')}
    </div>
    <div class="curated-popup-loading">標高を取得中…</div>
    ${IMPORT_BUTTON}
  </div>`
}

/** Filled popup after elevation profile arrives. */
export function popupFilledHTML(
  props: CuratedRoadProperties,
  profile: ElevationProfile,
): string {
  const km = profile.total_distance_km.toFixed(2)
  const ascent = Math.round(profile.total_ascent_m)
  const descent = Math.round(profile.total_descent_m)
  const maxSlope = profile.max_slope_pct.toFixed(1)
  const elevMin = Math.round(profile.min_elevation_m)
  const elevMax = Math.round(profile.max_elevation_m)
  return `<div class="curated-popup">
    <div class="curated-popup-name">${escapeHtml(props.name)}</div>
    ${metaHTML(props)}
    <div class="curated-popup-stats">
      ${statRow('距離', `${km} km`)}
      ${statRow('↑ 上昇', `${ascent} m`)}
      ${statRow('↓ 下降', `${descent} m`)}
      ${statRow('最大勾配', `${maxSlope} %`)}
    </div>
    ${sparklineSVG(profile)}
    <div class="curated-popup-elev-range">標高 ${elevMin} m 〜 ${elevMax} m</div>
    ${IMPORT_BUTTON}
  </div>`
}

/** Error state when elevation fetch fails. */
export function popupErrorHTML(
  props: CuratedRoadProperties,
  lengthMeters: number,
  message: string,
): string {
  const km = (lengthMeters / 1000).toFixed(2)
  return `<div class="curated-popup">
    <div class="curated-popup-name">${escapeHtml(props.name)}</div>
    ${metaHTML(props)}
    <div class="curated-popup-stats">
      ${statRow('距離', `${km} km`)}
    </div>
    <div class="curated-popup-error">${escapeHtml(message)}</div>
    ${IMPORT_BUTTON}
  </div>`
}
