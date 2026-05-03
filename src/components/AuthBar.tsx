import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import './AuthBar.css'

export function AuthBar() {
  const { state, user, login, logout } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogin() {
    setBusy(true)
    setError(null)
    try {
      await login()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleLogout() {
    setBusy(true)
    setError(null)
    try {
      await logout()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (state.status === 'loading') {
    return <span className="auth-bar auth-bar-loading">…</span>
  }

  if (state.status === 'authenticated' && user) {
    const label = user.name || user.email || `user #${user.id}`
    return (
      <span className="auth-bar auth-bar-authed">
        <span className="auth-bar-user" title={label}>
          {label}
        </span>
        <button
          type="button"
          className="auth-bar-button"
          onClick={handleLogout}
          disabled={busy}
        >
          ログアウト
        </button>
        {error && <span className="auth-bar-error">{error}</span>}
      </span>
    )
  }

  return (
    <span className="auth-bar auth-bar-anonymous">
      <button
        type="button"
        className="auth-bar-button auth-bar-button-primary"
        onClick={handleLogin}
        disabled={busy}
      >
        ログイン
      </button>
      {error && <span className="auth-bar-error">{error}</span>}
    </span>
  )
}
