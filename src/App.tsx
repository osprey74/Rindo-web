import './App.css'
import { MapView } from './components/MapView'

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Rindo</h1>
        <p className="tagline">札幌・道央圏サイクリングロードナビ</p>
      </header>
      <main className="app-main">
        <MapView />
      </main>
    </div>
  )
}

export default App
