import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { useAuth } from '../contexts/AuthContext'
import { baseMapStyle, SAPPORO_CENTER, INITIAL_ZOOM } from '../lib/mapStyle'
import { fetchBicycleRoute, type LonLat, type RouteResult } from '../lib/routing'
import { fetchElevationProfile, type ElevationProfile } from '../lib/elevation'
import { fetchNearbyFacilities, type Facility } from '../lib/facilities'
import { buildGpx, downloadGpx } from '../lib/gpx'
import { createSavedRoute, type SavedRoute } from '../lib/saved-routes'
import { CATEGORY_EMOJI, type SavedLocation } from '../lib/saved-locations'
import { ElevationChart } from './ElevationChart'
import { SaveRouteDialog } from './SaveRouteDialog'
import cyclingRoadsUrl from '../../sapporo-cyclingroad.corrected.geojson?url'
import osmCyclewaysUrl from '../../sapporo-osm-cycleways.geojson?url'
import osmBicycleRoutesUrl from '../../dosou-osm-bicycle-routes.geojson?url'
import './MapView.css'

export type MapViewHandle = {
  /** Returns the current map center as { lon, lat }, or null if not ready. */
  getCenter: () => { lon: number; lat: number } | null
}

type CyclingRoadProperties = {
  fid: number
  name: string
  ward: string | null
  road_type: 'exclusive' | 'shared'
  source: string
  large_scale?: boolean
}

type Waypoint = LonLat & { id: string }

const CURATED_COLOR = '#E65C00'
const OSM_CYCLEWAY_COLOR = '#1D9E75'
const OSM_ROUTE_COLOR = '#3C7B91'
const ROUTE_COLOR = '#2563EB'
const ROUTE_OUTLINE_COLOR = '#FFFFFF'
const START_MARKER_COLOR = '#22C55E'
const END_MARKER_COLOR = '#EF4444'
const VIA_MARKER_COLOR = '#8B5CF6'

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

function setupLayers(map: maplibregl.Map) {
  map.addSource('osm-cycleways', { type: 'geojson', data: EMPTY_FC })
  map.addSource('osm-bicycle-routes', { type: 'geojson', data: EMPTY_FC })
  map.addSource('cycling-roads', { type: 'geojson', data: EMPTY_FC })
  map.addSource('route', { type: 'geojson', data: EMPTY_FC })

  map.addLayer({
    id: 'osm-cycleways',
    type: 'line',
    source: 'osm-cycleways',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': OSM_CYCLEWAY_COLOR,
      'line-width': 3,
      'line-opacity': 0.85,
    },
  })

  map.addLayer({
    id: 'osm-bicycle-routes',
    type: 'line',
    source: 'osm-bicycle-routes',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': OSM_ROUTE_COLOR,
      'line-width': 4,
      'line-opacity': 0.9,
    },
  })

  map.addLayer({
    id: 'cycling-roads-exclusive',
    type: 'line',
    source: 'cycling-roads',
    filter: ['==', ['get', 'road_type'], 'exclusive'],
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': CURATED_COLOR,
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
      'line-color': CURATED_COLOR,
      'line-width': 2,
      'line-dasharray': [4, 2],
    },
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

async function fetchGeoJson(url: string, label: string): Promise<GeoJSON.FeatureCollection> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch ${label}: ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as GeoJSON.FeatureCollection
}

function normalizeCuratedRoadTypes(data: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  for (const feature of data.features) {
    const props = feature.properties as Partial<CyclingRoadProperties> | null
    if (props && typeof props.road_type === 'string') {
      props.road_type = props.road_type.trim() as CyclingRoadProperties['road_type']
    }
  }
  return data
}

function markerColorFor(index: number, total: number): string {
  if (index === 0) return START_MARKER_COLOR
  if (index === total - 1 && total > 1) return END_MARKER_COLOR
  return VIA_MARKER_COLOR
}

function newWaypointId(): string {
  return crypto.randomUUID()
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

type Props = {
  /** When set, the map loads this saved route into its current state. */
  routeToLoad?: SavedRoute | null
  /** Called after routeToLoad has been consumed, so the parent can clear it. */
  onRouteLoaded?: () => void
  /** Called after a route is successfully saved (so panels can refresh). */
  onRouteSaved?: () => void
  /** When set, append this point to the current waypoints (used by location picker). */
  pendingWaypoint?: LonLat | null
  /** Called after pendingWaypoint has been consumed. */
  onPendingWaypointConsumed?: () => void
  /** Saved locations to render as small markers on the map. */
  savedLocations?: SavedLocation[]
}

export const MapView = forwardRef<MapViewHandle, Props>(function MapView({
  routeToLoad,
  onRouteLoaded,
  onRouteSaved,
  pendingWaypoint,
  onPendingWaypointConsumed,
  savedLocations,
}, ref) {
  const { state: authState } = useAuth()
  const isAuthenticated = authState.status === 'authenticated'

  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const facilityMarkersRef = useRef<maplibregl.Marker[]>([])
  const locationMarkersRef = useRef<maplibregl.Marker[]>([])

  useImperativeHandle(
    ref,
    () => ({
      getCenter: () => {
        const m = mapRef.current
        if (!m) return null
        const c = m.getCenter()
        return { lon: c.lng, lat: c.lat }
      },
    }),
    [],
  )

  const [waypoints, setWaypoints] = useState<Waypoint[]>([])
  const [route, setRoute] = useState<RouteResult | null>(null)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [elevation, setElevation] = useState<ElevationProfile | null>(null)
  const [elevationError, setElevationError] = useState<string | null>(null)
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const fetchTokenRef = useRef(0)
  const elevationTokenRef = useRef(0)
  const facilitiesTokenRef = useRef(0)
  const skipNextFetchRef = useRef(false)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: baseMapStyle,
      center: SAPPORO_CENTER,
      zoom: INITIAL_ZOOM,
      maxZoom: 19,
      maxTileCacheSize: 256,
      attributionControl: { compact: false },
    })

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')

    map.on('load', () => {
      setupLayers(map)

      fetchGeoJson(osmCyclewaysUrl, 'OSM cycleways')
        .then((data) => {
          if (mapRef.current !== map) return
          const source = map.getSource('osm-cycleways') as maplibregl.GeoJSONSource | undefined
          source?.setData(data)
        })
        .catch((err: unknown) => {
          console.error(err)
        })

      fetchGeoJson(osmBicycleRoutesUrl, 'OSM bicycle route relations')
        .then((data) => {
          if (mapRef.current !== map) return
          const source = map.getSource('osm-bicycle-routes') as maplibregl.GeoJSONSource | undefined
          source?.setData(data)
        })
        .catch((err: unknown) => {
          console.error(err)
        })

      fetchGeoJson(cyclingRoadsUrl, 'curated cycling roads')
        .then(normalizeCuratedRoadTypes)
        .then((data) => {
          if (mapRef.current !== map) return
          const source = map.getSource('cycling-roads') as maplibregl.GeoJSONSource | undefined
          source?.setData(data)
        })
        .catch((err: unknown) => {
          console.error(err)
        })
    })

    map.on('click', (e) => {
      const wp: Waypoint = { lon: e.lngLat.lng, lat: e.lngLat.lat, id: newWaypointId() }
      setWaypoints((prev) => [...prev, wp])
      setError(null)
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      markersRef.current = []
      facilityMarkersRef.current = []
      locationMarkersRef.current = []
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    for (const m of markersRef.current) m.remove()
    markersRef.current = []

    waypoints.forEach((wp, i) => {
      const color = markerColorFor(i, waypoints.length)
      const marker = new maplibregl.Marker({ color })
        .setLngLat([wp.lon, wp.lat])
        .addTo(map)
      const el = marker.getElement()
      el.style.cursor = 'pointer'
      el.title = 'クリックで削除'
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        setWaypoints((prev) => prev.filter((p) => p.id !== wp.id))
      })
      markersRef.current.push(marker)
    })
  }, [waypoints])

  // Render saved locations as small emoji markers. Tapping one appends a
  // waypoint at that point so the user can compose routes from saved spots.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    for (const m of locationMarkersRef.current) m.remove()
    locationMarkersRef.current = []

    if (!savedLocations) return

    for (const loc of savedLocations) {
      const el = document.createElement('div')
      el.className = `location-marker location-marker-${loc.category}`
      el.textContent = CATEGORY_EMOJI[loc.category]
      el.title = `${loc.name}（クリックで経由地に追加）`
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        setWaypoints((prev) => [
          ...prev,
          { lon: loc.lon, lat: loc.lat, id: newWaypointId() },
        ])
        setError(null)
      })
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([loc.lon, loc.lat])
        .addTo(map)
      locationMarkersRef.current.push(marker)
    }
  }, [savedLocations])

  useEffect(() => {
    if (waypoints.length < 2) {
      setRoute(null)
      setFetching(false)
      return
    }
    if (skipNextFetchRef.current) {
      // Caller (e.g. loadSavedRoute) has already populated `route`; skip the
      // automatic Valhalla refetch so we don't perturb the saved geometry.
      skipNextFetchRef.current = false
      return
    }
    fetchTokenRef.current += 1
    const token = fetchTokenRef.current
    setFetching(true)
    setError(null)
    fetchBicycleRoute(waypoints.map((w) => ({ lon: w.lon, lat: w.lat })))
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
  }, [waypoints])

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

  useEffect(() => {
    if (!route || route.coordinates.length < 2) {
      setElevation(null)
      setElevationError(null)
      return
    }
    elevationTokenRef.current += 1
    const token = elevationTokenRef.current
    setElevationError(null)
    fetchElevationProfile(route.coordinates)
      .then((profile) => {
        if (token !== elevationTokenRef.current) return
        setElevation(profile)
      })
      .catch((err: Error) => {
        if (token !== elevationTokenRef.current) return
        setElevation(null)
        setElevationError(err.message || '標高プロファイル取得に失敗しました')
      })
  }, [route])

  // Append a waypoint when the parent provides pendingWaypoint (e.g. from
  // the saved-locations panel "use" action).
  useEffect(() => {
    if (!pendingWaypoint) return
    setWaypoints((prev) => [
      ...prev,
      { lon: pendingWaypoint.lon, lat: pendingWaypoint.lat, id: newWaypointId() },
    ])
    setError(null)
    onPendingWaypointConsumed?.()
  }, [pendingWaypoint, onPendingWaypointConsumed])

  useEffect(() => {
    if (waypoints.length < 2) {
      setFacilities([])
      return
    }
    const start = waypoints[0]
    const end = waypoints[waypoints.length - 1]
    facilitiesTokenRef.current += 1
    const token = facilitiesTokenRef.current
    fetchNearbyFacilities(
      { lon: start.lon, lat: start.lat },
      { lon: end.lon, lat: end.lat },
    )
      .then((list) => {
        if (token !== facilitiesTokenRef.current) return
        setFacilities(list)
      })
      .catch((err: unknown) => {
        if (token !== facilitiesTokenRef.current) return
        console.error('Failed to load nearby facilities:', err)
        setFacilities([])
      })
  }, [waypoints])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    for (const m of facilityMarkersRef.current) m.remove()
    facilityMarkersRef.current = []

    for (const f of facilities) {
      const el = document.createElement('div')
      el.className = `facility-marker facility-${f.type}`
      el.textContent = f.type === 'parking' ? 'P' : 'コ'

      const popup = new maplibregl.Popup({ offset: 14, closeButton: false }).setHTML(
        `<div class="facility-popup">
          <div class="facility-popup-name">${f.name ? escapeHtml(f.name) : '(名称不明)'}</div>
          <div class="facility-popup-type">${f.type === 'parking' ? '🅿️ 駐車場' : '🏪 コンビニ'}</div>
        </div>`,
      )

      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([f.lon, f.lat])
        .setPopup(popup)
        .addTo(map)
      facilityMarkersRef.current.push(marker)
    }
  }, [facilities])

  // Load a saved route when the parent passes one in. We skip the automatic
  // Valhalla refetch (skipNextFetchRef) since the saved geometry is the source
  // of truth, then fit the map to its bounds.
  useEffect(() => {
    if (!routeToLoad) return
    const map = mapRef.current
    skipNextFetchRef.current = true
    const restored: Waypoint[] = routeToLoad.waypoints.map((w) => ({
      lon: w.lon,
      lat: w.lat,
      id: newWaypointId(),
    }))
    setWaypoints(restored)
    setRoute({
      coordinates: routeToLoad.geometry.coordinates as [number, number][],
      distance_km: routeToLoad.distance_km ?? 0,
      time_min: routeToLoad.duration_min ?? 0,
    })
    setError(null)
    setFetching(false)
    setSaveError(null)

    if (map && routeToLoad.geometry.coordinates.length > 0) {
      const coords = routeToLoad.geometry.coordinates
      let minLon = Infinity
      let minLat = Infinity
      let maxLon = -Infinity
      let maxLat = -Infinity
      for (const [lon, lat] of coords) {
        if (lon < minLon) minLon = lon
        if (lon > maxLon) maxLon = lon
        if (lat < minLat) minLat = lat
        if (lat > maxLat) maxLat = lat
      }
      map.fitBounds(
        [
          [minLon, minLat],
          [maxLon, maxLat],
        ],
        { padding: 60, duration: 600, maxZoom: 16 },
      )
    }

    onRouteLoaded?.()
  }, [routeToLoad, onRouteLoaded])

  async function handleSaveRoute(values: { name: string; description: string }) {
    if (!route || waypoints.length < 2) return
    setSaveError(null)
    try {
      await createSavedRoute({
        name: values.name,
        description: values.description || null,
        waypoints: waypoints.map((w) => ({ lon: w.lon, lat: w.lat })),
        geometry: { type: 'LineString', coordinates: route.coordinates },
        distance_km: route.distance_km,
        duration_min: route.time_min,
        ascent_m: elevation?.total_ascent_m ?? null,
        descent_m: elevation?.total_descent_m ?? null,
      })
      setSaveDialogOpen(false)
      onRouteSaved?.()
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e))
    }
  }

  function reset() {
    setWaypoints([])
    setRoute(null)
    setError(null)
    setFetching(false)
    setElevation(null)
    setElevationError(null)
    setFacilities([])
    setSaveError(null)
  }

  function exportGpx() {
    if (!route || waypoints.length < 2) return
    const labels = waypoints.map((_, i) => {
      if (i === 0) return '出発'
      if (i === waypoints.length - 1) return '目的地'
      return `経由 ${i}`
    })
    const stamp = new Date()
      .toISOString()
      .replace(/[T:]/g, '-')
      .replace(/\..+$/, '')
    const name = `Rindo route ${stamp}`
    const filename = `rindo-route-${stamp}.gpx`
    const xml = buildGpx({
      name,
      waypoints: waypoints.map((w, i) => ({ lon: w.lon, lat: w.lat, label: labels[i] })),
      routeCoordinates: route.coordinates,
      elevationProfile: elevation ?? undefined,
    })
    downloadGpx(filename, xml)
  }

  const viaCount = Math.max(waypoints.length - 2, 0)

  let statusText: string
  if (error) {
    statusText = `⚠️ ${error}`
  } else if (fetching) {
    statusText = '⏳ ルート計算中...'
  } else if (route) {
    const viaSuffix = viaCount > 0 ? ` · 経由地 ${viaCount}` : ''
    statusText = `🚲 ${route.distance_km.toFixed(2)} km · ${Math.round(route.time_min)} 分${viaSuffix}`
  } else if (waypoints.length === 0) {
    statusText = '📍 出発地点をクリックしてください'
  } else if (waypoints.length === 1) {
    statusText = '📍 目的地をクリックしてください（クリックで経由地追加）'
  } else {
    statusText = '📍 経由地を追加（マーカークリックで削除）'
  }

  const showResetButton =
    waypoints.length > 0 || route !== null || error !== null

  return (
    <>
      <div ref={containerRef} className="map-canvas" />
      <div className="map-status" role="status" aria-live="polite">
        <span className="map-status-text">{statusText}</span>
        {route && isAuthenticated && (
          <button
            type="button"
            className="map-status-save"
            onClick={() => {
              setSaveError(null)
              setSaveDialogOpen(true)
            }}
            title="現在のルートを名前付きで保存"
          >
            ルート保存
          </button>
        )}
        {route && (
          <button
            type="button"
            className="map-status-export"
            onClick={exportGpx}
            title="GPX 形式でルートをダウンロード"
          >
            GPX 保存
          </button>
        )}
        {showResetButton && (
          <button type="button" className="map-status-reset" onClick={reset}>
            リセット
          </button>
        )}
      </div>
      {saveError && (
        <div className="elev-error" role="status">
          ⚠️ {saveError}
        </div>
      )}
      {elevation && <ElevationChart profile={elevation} />}
      {elevationError && !elevation && (
        <div className="elev-error" role="status">
          ⚠️ {elevationError}
        </div>
      )}
      <SaveRouteDialog
        open={saveDialogOpen}
        mode="create"
        onSubmit={handleSaveRoute}
        onClose={() => setSaveDialogOpen(false)}
      />
    </>
  )
})
