import { apiRequest } from './api-client'

export type LocationCategory = 'home' | 'work' | 'favorite' | 'other'

export type SavedLocation = {
  id: number
  name: string
  category: LocationCategory
  lon: number
  lat: number
  notes: string | null
  created_at: string
}

export type SaveLocationPayload = {
  name: string
  category?: LocationCategory
  lon: number
  lat: number
  notes?: string | null
}

export type UpdateLocationPayload = Partial<SaveLocationPayload>

export const CATEGORY_EMOJI: Record<LocationCategory, string> = {
  home: '🏠',
  work: '🏢',
  favorite: '⭐',
  other: '📍',
}

export const CATEGORY_LABEL: Record<LocationCategory, string> = {
  home: '自宅',
  work: '職場',
  favorite: 'お気に入り',
  other: 'その他',
}

export async function listSavedLocations(): Promise<SavedLocation[]> {
  const data = await apiRequest<{ locations: SavedLocation[] }>('/api/locations')
  return data.locations
}

export async function createSavedLocation(payload: SaveLocationPayload): Promise<SavedLocation> {
  return apiRequest<SavedLocation>('/api/locations', { method: 'POST', body: payload })
}

export async function updateSavedLocation(
  id: number,
  payload: UpdateLocationPayload,
): Promise<SavedLocation> {
  return apiRequest<SavedLocation>(`/api/locations/${id}`, { method: 'PUT', body: payload })
}

export async function deleteSavedLocation(id: number): Promise<void> {
  await apiRequest(`/api/locations/${id}`, { method: 'DELETE' })
}
