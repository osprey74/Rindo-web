import { decodePolyline } from './polyline'

export type LonLat = { lon: number; lat: number }

export type RouteResult = {
  coordinates: [number, number][]
  distance_km: number
  time_min: number
}

type ValhallaRouteResponse = {
  trip: {
    summary: { length: number; time: number }
    legs: Array<{ shape: string }>
  }
}

export async function fetchBicycleRoute(waypoints: LonLat[]): Promise<RouteResult> {
  if (waypoints.length < 2) {
    throw new Error('ルート計算には出発地と目的地（最低 2 点）が必要です')
  }
  const body = {
    locations: waypoints.map(({ lon, lat }) => ({ lon, lat })),
    costing: 'bicycle',
    costing_options: {
      bicycle: {
        bicycle_type: 'Road',
        use_roads: 0.1,
        use_trails: 1.0,
      },
    },
  }
  const res = await fetch('/api/valhalla/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    try {
      const err = (await res.json()) as { error?: string }
      if (err.error) message = err.error
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(message)
  }
  const data = (await res.json()) as ValhallaRouteResponse
  const coordinates: [number, number][] = []
  for (const leg of data.trip.legs) {
    const segment = decodePolyline(leg.shape, 6)
    if (coordinates.length === 0) {
      coordinates.push(...segment)
    } else {
      coordinates.push(...segment.slice(1))
    }
  }
  return {
    coordinates,
    distance_km: data.trip.summary.length,
    time_min: data.trip.summary.time / 60,
  }
}
