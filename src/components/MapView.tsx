import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { cyclosmStyle, SAPPORO_CENTER, INITIAL_ZOOM } from '../lib/mapStyle'
import { fetchBicycleRoute, type LonLat, type RouteResult } from '../lib/routing'
import cyclingRoadsUrl from '../../sapporo-cyclingroad.corrected.geojson?url'
import './MapView.css'

type CyclingRoadProperties = {
  fid: number
  name: string
  ward: string | null
  road_type: 'exclusive' | 'shared'
  source: string
}

const CYCLING_ROAD_COLOR = '#E65C00'
const ROUTE_COLOR = '#2563EB'
const ROUTE_OUTLINE_COLOR = '#FFFFFF'
const START_MARKER_COLOR = '#22C55E'
const END_MARKER_COLOR = '#EF4444'

async function loadCyclingRoads(): Promise<GeoJSON.FeatureCollection> {
  const response = await fetch(cyclingRoadsUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch cycling roads: ${response.status} ${response.statusText}`)
  }
  const data = (await response.json()) as GeoJSON.FeatureCollection
  for (const feature of data.features) {
    const props = feature.properties as Partial<CyclingRoadProperties> | null
    if (props && typeof props.road_type === 'string') {
      props.road_type = props.road_type.trim() as CyclingRoadProperties['road_type']
    }
  }
  return data
}

function addCyclingRoadLayers(map: maplibregl.Map, data: GeoJSON.FeatureCollection) {
  map.addSource('cycling-roads', { type: 'geojson', data })

  map.addLayer({
    id: 'cycling-roads-exclusive',
    type: 'line',
    source: 'cycling-roads',
    filter: ['==', ['get', 'road_type'], 'exclusive'],
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': CYCLING_ROAD_COLOR,
      'line-width': 4,
    },
  })

  map.addLayer({
    id: 'cycling-roads-shared',
    type: 'line',
    source: 'cycling-roads',
    filter: ['==', ['get', 'road_type'], 'shared'],
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': CYCLING_ROAD_COLOR,
      'line-width': 2,
      'line-dasharray': [4, 2],
    },
  })
}

function addRouteLayers(map: maplibregl.Map) {
  map.addSource('route', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })
  map.addLayer({
    id: 'route-outline',
    type: 'line',
    source: 'route',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': ROUTE_OUTLINE_COLOR,
      'line-width': 8,
    },
  })
  map.addLayer({
    id: 'route-line',
    type: 'line',
    source: 'route',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': ROUTE_COLOR,
      'line-width': 5,
    },
  })
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const startMarkerRef = useRef<maplibregl.Marker | null>(null)
  const endMarkerRef = useRef<maplibregl.Marker | null>(null)

  const [start, setStart] = useState<LonLat | null>(null)
  const [end, setEnd] = useState<LonLat | null>(null)
  const [route, setRoute] = useState<RouteResult | null>(null)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startRef = useRef(start)
  const endRef = useRef(end)
  const fetchTokenRef = useRef(0)
  useEffect(() => {
    startRef.current = start
  }, [start])
  useEffect(() => {
    endRef.current = end
  }, [end])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: cyclosmStyle,
      center: SAPPORO_CENTER,
      zoom: INITIAL_ZOOM,
      attributionControl: { compact: false },
    })

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')

    map.on('load', () => {
      addRouteLayers(map)
      loadCyclingRoads()
        .then((data) => {
          if (mapRef.current !== map) return
          addCyclingRoadLayers(map, data)
        })
        .catch((err: unknown) => {
          console.error('Failed to load cycling roads layer:', err)
        })
    })

    map.on('click', (e) => {
      const ll: LonLat = { lon: e.lngLat.lng, lat: e.lngLat.lat }
      if (!startRef.current) {
        setStart(ll)
        setEnd(null)
        setRoute(null)
        setError(null)
        setFetching(false)
      } else if (!endRef.current) {
        setEnd(ll)
      } else {
        setStart(ll)
        setEnd(null)
        setRoute(null)
        setError(null)
        setFetching(false)
      }
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      startMarkerRef.current = null
      endMarkerRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (start) {
      if (!startMarkerRef.current) {
        startMarkerRef.current = new maplibregl.Marker({ color: START_MARKER_COLOR })
          .setLngLat([start.lon, start.lat])
          .addTo(map)
      } else {
        startMarkerRef.current.setLngLat([start.lon, start.lat])
      }
    } else {
      startMarkerRef.current?.remove()
      startMarkerRef.current = null
    }
  }, [start])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (end) {
      if (!endMarkerRef.current) {
        endMarkerRef.current = new maplibregl.Marker({ color: END_MARKER_COLOR })
          .setLngLat([end.lon, end.lat])
          .addTo(map)
      } else {
        endMarkerRef.current.setLngLat([end.lon, end.lat])
      }
    } else {
      endMarkerRef.current?.remove()
      endMarkerRef.current = null
    }
  }, [end])

  useEffect(() => {
    if (!start || !end) return
    fetchTokenRef.current += 1
    const token = fetchTokenRef.current
    setFetching(true)
    setError(null)
    fetchBicycleRoute(start, end)
      .then((r) => {
        if (token !== fetchTokenRef.current) return
        setRoute(r)
        setFetching(false)
      })
      .catch((err: Error) => {
        if (token !== fetchTokenRef.current) return
        setError(err.message || 'ルート計算に失敗しました')
        setRoute(null)
        setFetching(false)
      })
  }, [start, end])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const source = map.getSource('route') as maplibregl.GeoJSONSource | undefined
    if (!source) return
    if (route) {
      source.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: route.coordinates },
          },
        ],
      })
    } else {
      source.setData({ type: 'FeatureCollection', features: [] })
    }
  }, [route])

  function reset() {
    setStart(null)
    setEnd(null)
    setRoute(null)
    setError(null)
    setFetching(false)
  }

  let statusText: string
  if (error) {
    statusText = `⚠️ ${error}`
  } else if (fetching) {
    statusText = '⏳ ルート計算中...'
  } else if (route) {
    statusText = `🚲 ${route.distance_km.toFixed(2)} km · ${Math.round(route.time_min)} 分`
  } else if (start && !end) {
    statusText = '📍 目的地をクリックしてください'
  } else {
    statusText = '📍 出発地点をクリックしてください'
  }

  const showResetButton = start !== null || end !== null || route !== null || error !== null

  return (
    <>
      <div ref={containerRef} className="map-canvas" />
      <div className="map-status" role="status" aria-live="polite">
        <span className="map-status-text">{statusText}</span>
        {showResetButton && (
          <button type="button" className="map-status-reset" onClick={reset}>
            リセット
          </button>
        )}
      </div>
    </>
  )
}
