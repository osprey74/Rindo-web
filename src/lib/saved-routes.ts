import { apiRequest } from './api-client'
import type { LonLat } from './routing'

export type SavedRoute = {
  id: number
  name: string
  description: string | null
  waypoints: LonLat[]
  geometry: GeoJSON.LineString
  distance_km: number | null
  duration_min: number | null
  ascent_m: number | null
  descent_m: number | null
  created_at: string
  updated_at: string
}

export type SaveRoutePayload = {
  name: string
  description?: string | null
  waypoints: LonLat[]
  geometry: GeoJSON.LineString
  distance_km?: number | null
  duration_min?: number | null
  ascent_m?: number | null
  descent_m?: number | null
}

export type UpdateRoutePayload = Partial<SaveRoutePayload>

export async function listSavedRoutes(): Promise<SavedRoute[]> {
  const data = await apiRequest<{ routes: SavedRoute[] }>('/api/routes')
  return data.routes
}

export async function createSavedRoute(payload: SaveRoutePayload): Promise<SavedRoute> {
  return apiRequest<SavedRoute>('/api/routes', { method: 'POST', body: payload })
}

export async function updateSavedRoute(id: number, payload: UpdateRoutePayload): Promise<SavedRoute> {
  return apiRequest<SavedRoute>(`/api/routes/${id}`, { method: 'PUT', body: payload })
}

export async function deleteSavedRoute(id: number): Promise<void> {
  await apiRequest(`/api/routes/${id}`, { method: 'DELETE' })
}
