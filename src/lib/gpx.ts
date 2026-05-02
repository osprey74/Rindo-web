// GPX 1.1 export for planned routes.
//
// Output structure:
//   - <metadata>: name + generation time
//   - <wpt>: user-selected waypoints (start / via / end), labelled
//   - <trk> / <trkseg> / <trkpt>: full Valhalla route geometry
//     - <ele> attached when an ElevationProfile is provided (linear interp)

import type { ElevationProfile } from './elevation'

const GPX_NS = 'http://www.topografix.com/GPX/1/1'

export type GpxWaypoint = {
  lon: number
  lat: number
  label: string
}

export type GpxInput = {
  name: string
  waypoints: GpxWaypoint[]
  routeCoordinates: [number, number][]
  elevationProfile?: ElevationProfile
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

function interpolateElevation(profile: ElevationProfile, distanceKm: number): number | null {
  const pts = profile.points
  if (pts.length === 0) return null
  if (distanceKm <= pts[0].distance_km) return pts[0].elevation_m
  if (distanceKm >= pts[pts.length - 1].distance_km) return pts[pts.length - 1].elevation_m
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].distance_km >= distanceKm) {
      const span = pts[i].distance_km - pts[i - 1].distance_km
      const t = span > 0 ? (distanceKm - pts[i - 1].distance_km) / span : 0
      return pts[i - 1].elevation_m + t * (pts[i].elevation_m - pts[i - 1].elevation_m)
    }
  }
  return pts[pts.length - 1].elevation_m
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function buildGpx(input: GpxInput): string {
  const { name, waypoints, routeCoordinates, elevationProfile } = input
  const generatedAt = new Date().toISOString()
  const escName = escapeXml(name)

  const cumKm: number[] = [0]
  for (let i = 1; i < routeCoordinates.length; i++) {
    cumKm.push(cumKm[i - 1] + haversineMeters(routeCoordinates[i - 1], routeCoordinates[i]) / 1000)
  }

  const lines: string[] = []
  lines.push('<?xml version="1.0" encoding="UTF-8"?>')
  lines.push(`<gpx version="1.1" creator="Rindo" xmlns="${GPX_NS}">`)
  lines.push('  <metadata>')
  lines.push(`    <name>${escName}</name>`)
  lines.push(`    <time>${generatedAt}</time>`)
  lines.push('  </metadata>')

  for (const wp of waypoints) {
    lines.push(`  <wpt lat="${wp.lat.toFixed(6)}" lon="${wp.lon.toFixed(6)}">`)
    lines.push(`    <name>${escapeXml(wp.label)}</name>`)
    lines.push('  </wpt>')
  }

  lines.push('  <trk>')
  lines.push(`    <name>${escName}</name>`)
  lines.push('    <trkseg>')
  for (let i = 0; i < routeCoordinates.length; i++) {
    const [lon, lat] = routeCoordinates[i]
    const ele = elevationProfile ? interpolateElevation(elevationProfile, cumKm[i]) : null
    if (ele !== null) {
      lines.push(
        `      <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"><ele>${ele.toFixed(1)}</ele></trkpt>`,
      )
    } else {
      lines.push(`      <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"/>`)
    }
  }
  lines.push('    </trkseg>')
  lines.push('  </trk>')
  lines.push('</gpx>')
  lines.push('')

  return lines.join('\n')
}

export function downloadGpx(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/gpx+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 0)
}
