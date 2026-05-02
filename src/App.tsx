import { useEffect, useRef, useState } from 'react'
import './App.css'
import { MapView, type MapViewHandle } from './components/MapView'
import { AttributionDialog } from './components/AttributionDialog'
import { AuthBar } from './components/AuthBar'
import { WeatherCard } from './components/WeatherCard'
import { SavedRoutesPanel } from './components/SavedRoutesPanel'
import { SavedLocationsPanel } from './components/SavedLocationsPanel'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import type { SavedRoute } from './lib/saved-routes'
import { listSavedLocations, type SavedLocation } from './lib/saved-locations'
import type { LonLat } from './lib/routing'

function AppContent() {
  const { state } = useAuth()
  const isAuthenticated = state.status === 'authenticated'

  const mapViewRef = useRef<MapViewHandle>(null)
  const [attribOpen, setAttribOpen] = useState(false)
  const [savedRoutesOpen, setSavedRoutesOpen] = useState(false)
  const [savedLocationsOpen, setSavedLocationsOpen] = useState(false)
  const [routeToLoad, setRouteToLoad] = useState<SavedRoute | null>(null)
  const [pendingWaypoint, setPendingWaypoint] = useState<LonLat | null>(null)
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>([])

  // Load saved locations whenever auth state turns authenticated, so the
  // map markers and panel are populated immediately on login.
  useEffect(() => {
    if (!isAuthenticated) {
      setSavedLocations([])
      return
    }
    let cancelled = false
    listSavedLocations()
      .then((list) => {
        if (!cancelled) setSavedLocations(list)
      })
      .catch((err: unknown) => {
        console.error('failed to load saved locations:', err)
      })
    return () => {
      cancelled = true
    }
  }, [isAuthenticated])

  function refreshSavedLocations() {
    listSavedLocations()
      .then((list) => setSavedLocations(list))
      .catch((err: unknown) => {
        console.error('failed to refresh saved locations:', err)
      })
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Rindo</h1>
        <p className="tagline">札幌・道央圏サイクリングロードナビ</p>
        <div className="app-header-actions">
          {isAuthenticated && (
            <>
              <button
                type="button"
                className="app-header-info"
                onClick={() => setSavedLocationsOpen(true)}
              >
                📍 地点
              </button>
              <button
                type="button"
                className="app-header-info"
                onClick={() => setSavedRoutesOpen(true)}
              >
                保存ルート
              </button>
            </>
          )}
          <AuthBar />
          <button
            type="button"
            className="app-header-info"
            onClick={() => setAttribOpen(true)}
          >
            出典・ライセンス
          </button>
        </div>
      </header>
      <main className="app-main">
        <MapView
          ref={mapViewRef}
          routeToLoad={routeToLoad}
          onRouteLoaded={() => setRouteToLoad(null)}
          pendingWaypoint={pendingWaypoint}
          onPendingWaypointConsumed={() => setPendingWaypoint(null)}
          savedLocations={isAuthenticated ? savedLocations : undefined}
        />
        <WeatherCard />
      </main>
      <AttributionDialog open={attribOpen} onClose={() => setAttribOpen(false)} />
      <SavedRoutesPanel
        open={savedRoutesOpen}
        onClose={() => setSavedRoutesOpen(false)}
        onLoad={(route) => {
          setRouteToLoad(route)
          setSavedRoutesOpen(false)
        }}
      />
      <SavedLocationsPanel
        open={savedLocationsOpen}
        onClose={() => setSavedLocationsOpen(false)}
        onUseLocation={(loc) => {
          setPendingWaypoint({ lon: loc.lon, lat: loc.lat })
          setSavedLocationsOpen(false)
        }}
        getMapCenter={() => mapViewRef.current?.getCenter() ?? null}
        onChanged={refreshSavedLocations}
      />
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
