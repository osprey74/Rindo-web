import { apiRequest, setStoredToken, ApiUnauthorizedError } from './api-client'

export type User = {
  id: number
  email: string | null
  name: string | null
  apple_user_id: string | null
}

type LoginResponse = { token: string; user: User | null }
type MeResponse = { user: User }

export async function devLogin(): Promise<User | null> {
  const data = await apiRequest<LoginResponse>('/api/auth/dev-login', {
    method: 'POST',
    authRequired: false,
  })
  setStoredToken(data.token)
  return data.user
}

export async function appleSignIn(idToken: string, name?: string): Promise<User> {
  const body: Record<string, unknown> = { id_token: idToken }
  if (name) {
    body.user = { name: { firstName: name } }
  }
  const data = await apiRequest<LoginResponse>('/api/auth/apple/callback', {
    method: 'POST',
    body,
    authRequired: false,
  })
  setStoredToken(data.token)
  if (!data.user) throw new Error('Apple Sign In response missing user')
  return data.user
}

export async function fetchMe(): Promise<User | null> {
  try {
    const data = await apiRequest<MeResponse>('/api/auth/me')
    return data.user
  } catch (e) {
    if (e instanceof ApiUnauthorizedError) return null
    throw e
  }
}

export async function logout(): Promise<void> {
  try {
    await apiRequest('/api/auth/logout', { method: 'POST', authRequired: false })
  } catch {
    // ignore — we still clear local token below
  }
  setStoredToken(null)
}
