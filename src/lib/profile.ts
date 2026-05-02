import { apiRequest } from './api-client'

export type UserProfile = {
  weight_kg: number | null
  height_cm: number | null
  age: number | null
  updated_at: string | null
}

export type ProfilePayload = {
  weight_kg?: number | null
  height_cm?: number | null
  age?: number | null
}

export async function getProfile(): Promise<UserProfile> {
  return apiRequest<UserProfile>('/api/profile')
}

export async function saveProfile(payload: ProfilePayload): Promise<UserProfile> {
  return apiRequest<UserProfile>('/api/profile', {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}
