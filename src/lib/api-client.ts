// Helper for calling rindo-api endpoints with the Bearer session token.
//
// Token storage: sessionToken kept in localStorage under TOKEN_KEY. AuthContext
// is the source of truth for in-memory state; this module simply attaches the
// header on every request. Returns 401 are surfaced as ApiUnauthorizedError so
// callers can prompt the user to sign in again.

const TOKEN_KEY = 'rindo:session_token'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

export class ApiUnauthorizedError extends ApiError {
  constructor(message = 'unauthorized') {
    super(message, 401)
    this.name = 'ApiUnauthorizedError'
  }
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setStoredToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  /** Whether to require auth. Defaults to true; set false for public endpoints. */
  authRequired?: boolean
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getStoredToken()
  if (opts.authRequired !== false && token) {
    headers.Authorization = `Bearer ${token}`
  } else if (token && opts.authRequired === false) {
    // Even on "public" endpoints (e.g. logout), attach the token if we have one
    // so the server can clean up the session.
    headers.Authorization = `Bearer ${token}`
  }
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(path, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })

  if (res.status === 401) {
    throw new ApiUnauthorizedError()
  }
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    try {
      const j = (await res.json()) as { error?: string }
      if (j.error) message = j.error
    } catch {
      // ignore JSON parse errors
    }
    throw new ApiError(message, res.status)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
