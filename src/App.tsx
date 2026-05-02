import { useState } from 'react'
import './App.css'
import { MapView } from './components/MapView'
import { AttributionDialog } from './components/AttributionDialog'
import { AuthBar } from './components/AuthBar'
import { WeatherCard } from './components/WeatherCard'
import { SavedRoutesPanel } from './components/SavedRoutesPanel'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import type { SavedRoute } from './lib/saved-routes'

function AppContent() {
  const { state } = useAuth()
  const isAuthenticated = state.status === 'authenticated'

  const [attribOpen, setAttribOpen] = useState(false)
  const [savedRoutesOpen, setSavedRoutesOpen] = useState(false)
  const [routeToLoad, setRouteToLoad] = useState<SavedRoute | null>(null)

  return (
    <div className="app">
      <header className="app-header">
        <h1>Rindo</h1>
        <p className="tagline">札幌・道央圏サイクリングロードナビ</p>
        <div className="app-header-actions">
          {isAuthenticated && (
            <button
              type="button"
              className="app-header-info"
              onClick={() => setSavedRoutesOpen(true)}
            >
              保存ルート
            </button>
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
          routeToLoad={routeToLoad}
          onRouteLoaded={() => setRouteToLoad(null)}
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
