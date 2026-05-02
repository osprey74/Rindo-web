import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
//
// Proxy entries match by longest prefix first. Specific external endpoints come
// before the rindo-api catch-alls. Note `/api/valhalla/route` (singular, Valhalla)
// is renamed from the previous `/api/route` to avoid colliding with the rindo-api
// `/api/routes` (plural, saved routes) endpoint.
//
// Targets:
//   - Valhalla:        http://localhost:8002
//   - rindo-api:       http://localhost:3000
//   - OpenTopoData:    https://api.opentopodata.org
//   - Overpass:        https://overpass-api.de
//   - JMA:             https://www.jma.go.jp
//
// In production these will all be served from the rindo-api backend (which
// proxies/caches the external services). In dev we hit them directly.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/valhalla/route': {
        target: 'http://localhost:8002',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/valhalla/, ''),
      },
      '/api/elevation': {
        target: 'https://api.opentopodata.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/elevation/, '/v1/srtm30m'),
      },
      '/api/overpass': {
        target: 'https://overpass-api.de',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/overpass/, '/api/interpreter'),
      },
      '/api/weather': {
        target: 'https://www.jma.go.jp',
        changeOrigin: true,
        rewrite: (path) => {
          const m = path.match(/^\/api\/weather\/(\d+)/)
          if (!m) return path
          return `/bosai/forecast/data/forecast/${m[1]}.json`
        },
      },
      // rindo-api endpoints — auth, saved routes, locations, cycling roads, health.
      // These all forward to localhost:3000 untouched.
      '/api/auth': { target: 'http://localhost:3000', changeOrigin: true },
      '/api/routes': { target: 'http://localhost:3000', changeOrigin: true },
      '/api/locations': { target: 'http://localhost:3000', changeOrigin: true },
      '/api/cycling-roads': { target: 'http://localhost:3000', changeOrigin: true },
      '/api/health': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
})
