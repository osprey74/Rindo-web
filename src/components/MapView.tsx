import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { useAuth } from '../contexts/AuthContext'
import { baseMapStyle, SAPPORO_CENTER, INITIAL_ZOOM } from '../lib/mapStyle'
import { fetchBicycleRoute, type LonLat, type RouteResult } from '../lib/routing'
import { fetchElevationProfile, type ElevationProfile } from '../lib/elevation'
import { estimateCaloriesFromProfile } from '../lib/calorie'
import type { UserProfile } from '../lib/profile'
import { fetchNearbyFacilities, type Facility } from '../lib/facilities'
import { buildGpx, downloadGpx } from '../lib/gpx'
import { createSavedRoute, type SavedRoute } from '../lib/saved-routes'
import { CATEGORY_EMOJI, type SavedLocation } from '../lib/saved-locations'
import { ElevationChart } from './ElevationChart'
import { SaveRouteDialog } from './SaveRouteDialog'
import {
  geometryToCoords,
  geometryLengthMeters,
  popupSkeletonHTML,
  popupFilledHTML,
  popupErrorHTML,
} from '../lib/curated-road-stats'
import cyclingRoadsUrl from '../../sapporo-cyclingroad.corrected.geojson?url'
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
const ROUTE_COLOR = '#2563EB'
const ROUTE_OUTLINE_COLOR = '#FFFFFF'
const START_MARKER_COLOR = '#22C55E'
const END_MARKER_COLOR = '#EF4444'
const VIA_MARKER_COLOR = '#8B5CF6'

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

function setupLayers(map: maplibregl.Map) {
  map.addSource('cycling-roads', { type: 'geojson', data: EMPTY_FC })
  map.addSource('route', { type: 'geojson', data: EMPTY_FC })

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

  // Route name labels following the line. `symbol-spacing` causes long routes
  // to repeat the name at multiple positions automatically.
  map.addLayer({
    id: 'cycling-roads-labels',
    type: 'symbol',
    source: 'cycling-roads',
    minzoom: 10,
    layout: {
      'symbol-placement': 'line',
      'symbol-spacing': 320,
      'text-field': ['get', 'name'],
      'text-font': ['Open Sans Regular'],
      'text-size': 12,
      'text-padding': 4,
      'text-rotation-alignment': 'map',
      'text-pitch-alignment': 'viewport',
      'text-keep-upright': true,
    },
    paint: {
      'text-color': '#5C2C00',
      'text-halo-color': 'rgba(255, 255, 255, 0.95)',
      'text-halo-width': 1.6,
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
  /** User profile (weight/height/age) used to estimate calorie burn. */
  profile?: UserProfile | null
}

export const MapView = forwardRef<MapViewHandle, Props>(function MapView({
  routeToLoad,
  onRouteLoaded,
  onRouteSaved,
  pendingWaypoint,
  onPendingWaypointConsumed,
  savedLocations,
  profile,
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
  const [saveDialogInitialName, setSaveDialogInitialName] = useState<string | undefined>(undefined)
  const [saveError, setSaveError] = useState<string | null>(null)

  const fetchTokenRef = useRef(0)
  const elevationTokenRef = useRef(0)
  const facilitiesTokenRef = useRef(0)
  const skipNextFetchRef = useRef(false)
  const curatedPopupRef = useRef<maplibregl.Popup | null>(null)
  const curatedPopupTokenRef = useRef(0)
  const curatedEndpointMarkersRef = useRef<maplibregl.Marker[]>([])
  // Cache of loaded cycling-road features keyed by fid. Needed because
  // MapLibre clips line geometries to tile bounds, so click events only
  // expose the segment within the clicked tile.
  const curatedFeaturesRef = useRef<Map<number, GeoJSON.Feature>>(new Map())
  // Data backing the currently-open popup, used by the "ルートを取り込む"
  // button click handler (delegated on the popup element).
  const curatedPopupDataRef = useRef<{
    coords: [number, number][]
    lengthM: number
    profile: ElevationProfile | null
    name: string
  } | null>(null)

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
      // Render Japanese characters using OS fonts (no glyph PBF fetch needed).
      localIdeographFontFamily: '"Hiragino Sans", "Yu Gothic", "Noto Sans JP", system-ui, sans-serif',
    })

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      'top-right',
    )
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')

    map.on('load', () => {
      setupLayers(map)

      fetchGeoJson(cyclingRoadsUrl, 'curated cycling roads')
        .then(normalizeCuratedRoadTypes)
        .then((data) => {
          if (mapRef.current !== map) return
          const source = map.getSource('cycling-roads') as maplibregl.GeoJSONSource | undefined
          source?.setData(data)
          curatedFeaturesRef.current.clear()
          for (const f of data.features) {
            const fid = (f.properties as { fid?: number } | null)?.fid
            if (typeof fid === 'number') curatedFeaturesRef.current.set(fid, f)
          }
        })
        .catch((err: unknown) => {
          console.error(err)
        })
    })

    const clearCuratedEndpoints = () => {
      for (const m of curatedEndpointMarkersRef.current) m.remove()
      curatedEndpointMarkersRef.current = []
    }

    const addCuratedEndpoint = (coord: [number, number], kind: 'start' | 'end') => {
      const el = document.createElement('div')
      el.className = `curated-endpoint curated-endpoint-${kind}`
      el.textContent = kind === 'start' ? 'S' : 'G'
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(coord)
        .addTo(map)
      curatedEndpointMarkersRef.current.push(marker)
    }

    const importCuratedRoute = () => {
      const data = curatedPopupDataRef.current
      if (!data || data.coords.length < 2) return
      setSaveDialogInitialName(data.name)
      const { coords, lengthM, profile } = data

      const distance_km = profile?.total_distance_km ?? lengthM / 1000
      // Average bicycle cruising speed used to estimate duration when we
      // don't go through Valhalla. 15 km/h is the default Valhalla bicycle
      // base speed, kept consistent so imported and planned routes look alike.
      const AVG_SPEED_KMH = 15
      const time_min = (distance_km / AVG_SPEED_KMH) * 60

      skipNextFetchRef.current = true
      setWaypoints([
        { lon: coords[0][0], lat: coords[0][1], id: newWaypointId() },
        {
          lon: coords[coords.length - 1][0],
          lat: coords[coords.length - 1][1],
          id: newWaypointId(),
        },
      ])
      setRoute({
        coordinates: coords,
        distance_km,
        time_min,
      })
      setError(null)
      setFetching(false)

      curatedPopupRef.current?.remove()
      curatedPopupRef.current = null
      clearCuratedEndpoints()
      curatedPopupDataRef.current = null

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

    const showCuratedPopup = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      const feature = e.features?.[0]
      if (!feature) return

      curatedPopupRef.current?.remove()
      clearCuratedEndpoints()
      curatedPopupTokenRef.current += 1
      const token = curatedPopupTokenRef.current

      const props = feature.properties as CyclingRoadProperties
      // The clicked feature.geometry is clipped to the tile that received the
      // click, so for long routes the start/end appear at tile boundaries.
      // Look up the original full feature by fid for accurate geometry.
      const fullFeature = curatedFeaturesRef.current.get(props.fid)
      const geometry = fullFeature?.geometry ?? feature.geometry
      const lengthM = geometryLengthMeters(geometry)
      const coords = geometryToCoords(geometry)

      curatedPopupDataRef.current = { coords, lengthM, profile: null, name: props.name }

      if (coords.length >= 2) {
        addCuratedEndpoint(coords[0], 'start')
        addCuratedEndpoint(coords[coords.length - 1], 'end')
      }

      const popup = new maplibregl.Popup({ offset: 6, maxWidth: '320px' })
        .setLngLat(e.lngLat)
        .setHTML(popupSkeletonHTML(props, lengthM))
        .addTo(map)
      curatedPopupRef.current = popup

      // Delegate clicks on the import button to importCuratedRoute. The popup
      // element persists across setHTML calls, so a single listener works.
      const popupEl = popup.getElement()
      popupEl.addEventListener('click', (ev) => {
        const target = ev.target as HTMLElement | null
        if (target?.closest('[data-action="import-route"]')) {
          ev.preventDefault()
          ev.stopPropagation()
          importCuratedRoute()
        }
      })

      popup.on('close', () => {
        if (curatedPopupRef.current === popup) {
          curatedPopupRef.current = null
          curatedPopupDataRef.current = null
        }
        clearCuratedEndpoints()
      })

      fetchElevationProfile(coords)
        .then((profile) => {
          if (token !== curatedPopupTokenRef.current) return
          if (curatedPopupRef.current !== popup) return
          curatedPopupDataRef.current = { coords, lengthM, profile, name: props.name }
          popup.setHTML(popupFilledHTML(props, profile))
        })
        .catch((err: unknown) => {
          if (token !== curatedPopupTokenRef.current) return
          if (curatedPopupRef.current !== popup) return
          const message = err instanceof Error ? err.message : '標高取得に失敗しました'
          popup.setHTML(popupErrorHTML(props, lengthM, message))
        })
    }

    const curatedLayers = ['cycling-roads-exclusive', 'cycling-roads-shared', 'cycling-roads-labels']
    for (const layerId of curatedLayers) {
      map.on('click', layerId, showCuratedPopup)
      map.on('mouseenter', layerId, () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', layerId, () => {
        map.getCanvas().style.cursor = ''
      })
    }

    map.on('click', (e) => {
      // Suppress waypoint creation when the click landed on a curated cycling
      // road; that click already opened the info popup.
      const hits = map.queryRenderedFeatures(e.point, { layers: curatedLayers })
      if (hits.length > 0) return
      const wp: Waypoint = { lon: e.lngLat.lng, lat: e.lngLat.lat, id: newWaypointId() }
      setWaypoints((prev) => [...prev, wp])
      setSaveDialogInitialName(undefined)
      setError(null)
    })

    mapRef.current = map

    return () => {
      curatedPopupRef.current?.remove()
      curatedPopupRef.current = null
      for (const m of curatedEndpointMarkersRef.current) m.remove()
      curatedEndpointMarkersRef.current = []
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
    const kcal =
      profile?.weight_kg != null
        ? estimateCaloriesFromProfile(profile.weight_kg, route.time_min, elevation)
        : null
    const kcalSuffix = kcal != null ? ` · 約 ${Math.round(kcal)} kcal` : ''
    statusText = `🚲 ${route.distance_km.toFixed(2)} km · ${Math.round(route.time_min)} 分${kcalSuffix}${viaSuffix}`
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
      <svg
        className="map-crosshair"
        width="22"
        height="22"
        viewBox="0 0 22 22"
        aria-hidden="true"
      >
        <g className="map-crosshair-stroke" fill="none" strokeWidth="1.2">
          <line x1="11" y1="2" x2="11" y2="8" />
          <line x1="11" y1="14" x2="11" y2="20" />
          <line x1="2" y1="11" x2="8" y2="11" />
          <line x1="14" y1="11" x2="20" y2="11" />
          <circle cx="11" cy="11" r="3" />
        </g>
        <circle className="map-crosshair-dot" cx="11" cy="11" r="0.8" />
      </svg>
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
        initialName={saveDialogInitialName}
        onSubmit={handleSaveRoute}
        onClose={() => setSaveDialogOpen(false)}
      />
    </>
  )
})
