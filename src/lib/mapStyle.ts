import type { StyleSpecification } from 'maplibre-gl'

// OpenStreetMap Standard tiles. Switched from CyclOSM (openstreetmap.fr) on
// 2026-05-02 because that server returns no response (HTTP 000) for tiles at
// z>=17, causing severe overzoom artifacts when zoomed in.
//
// Trade-off: the base map loses cycling-specific styling (orange highlight on
// dedicated cycle paths). This is acceptable because the app overlays curated
// cycling roads (16 routes) on top, so cycling infrastructure remains visible.
//
// To restore the CyclOSM visual style, sign up for a Stadia Maps account
// (free tier covers personal use) and switch to:
//   https://tiles.stadiamaps.com/tiles/cyclosm/{z}/{x}/{y}.png?api_key=...
export const baseMapStyle: StyleSpecification = {
  version: 8,
  // glyphs are required for symbol layers (text labels). CJK characters are
  // rendered locally via `localIdeographFontFamily` on the Map, so this
  // demotiles URL is only fetched for non-CJK characters (parens, digits).
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    },
  },
  layers: [
    {
      id: 'osm',
      type: 'raster',
      source: 'osm',
    },
  ],
}

export const SAPPORO_CENTER: [number, number] = [141.3544, 43.0618]
export const INITIAL_ZOOM = 11
