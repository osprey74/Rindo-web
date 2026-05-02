import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { devLogin as apiDevLogin, fetchMe, logout as apiLogout, type User } from '../lib/auth'
import { getStoredToken, setStoredToken } from '../lib/api-client'

type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: User }

type AuthContextValue = {
  state: AuthState
  user: User | null
  devLogin: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    const token = getStoredToken()
    if (!token) {
      setState({ status: 'anonymous' })
      return
    }
    fetchMe()
      .then((user) => {
        if (user) {
          setState({ status: 'authenticated', user })
        } else {
          setStoredToken(null)
          setState({ status: 'anonymous' })
        }
      })
      .catch((err: unknown) => {
        console.error('failed to verify session:', err)
        setStoredToken(null)
        setState({ status: 'anonymous' })
      })
  }, [])

  async function devLogin() {
    const user = await apiDevLogin()
    if (user) setState({ status: 'authenticated', user })
  }

  async function logout() {
    await apiLogout()
    setState({ status: 'anonymous' })
  }

  const user = state.status === 'authenticated' ? state.user : null

  return (
    <AuthContext.Provider value={{ state, user, devLogin, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
