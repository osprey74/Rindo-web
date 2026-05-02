import { useEffect, useRef, useState } from 'react'
import { getProfile, saveProfile, type UserProfile } from '../lib/profile'
import './SettingsDialog.css'

type Props = {
  open: boolean
  onClose: () => void
  onSaved?: (profile: UserProfile) => void
}

function fmtNumber(n: number | null): string {
  return n === null ? '' : String(n)
}

function parseOptionalNumber(value: string): number | null | 'invalid' {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  if (!Number.isFinite(n)) return 'invalid'
  return n
}

export function SettingsDialog({ open, onClose, onSaved }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [weight, setWeight] = useState('')
  const [height, setHeight] = useState('')
  const [age, setAge] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setBusy(false)
    setLoading(true)
    let cancelled = false
    getProfile()
      .then((p) => {
        if (cancelled) return
        setWeight(fmtNumber(p.weight_kg))
        setHeight(fmtNumber(p.height_cm))
        setAge(fmtNumber(p.age))
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError((err as Error).message || 'プロフィール取得に失敗しました')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return

    const w = parseOptionalNumber(weight)
    const h = parseOptionalNumber(height)
    const a = parseOptionalNumber(age)
    if (w === 'invalid' || h === 'invalid' || a === 'invalid') {
      setError('数値が不正です')
      return
    }
    if (a !== null && !Number.isInteger(a)) {
      setError('年齢は整数で入力してください')
      return
    }

    setBusy(true)
    setError(null)
    try {
      const saved = await saveProfile({ weight_kg: w, height_cm: h, age: a })
      onSaved?.(saved)
      onClose()
    } catch (err) {
      setError((err as Error).message || '保存に失敗しました')
      setBusy(false)
    }
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current && !busy) onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className="settings-dialog"
      onClose={() => !busy && onClose()}
      onClick={handleBackdropClick}
      aria-labelledby="settings-title"
    >
      <form className="settings-form" onSubmit={handleSubmit}>
        <header className="settings-header">
          <h2 id="settings-title">プロフィール設定</h2>
          <button
            type="button"
            className="settings-close"
            onClick={onClose}
            disabled={busy}
            aria-label="閉じる"
          >
            ×
          </button>
        </header>
        <div className="settings-body">
          <p className="settings-hint">
            消費カロリーの目安計算に使用します。空欄のままでも構いません。
          </p>
          {loading ? (
            <div className="settings-loading">読み込み中…</div>
          ) : (
            <>
              <label className="settings-field">
                <span>体重 (kg)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min={20}
                  max={250}
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  disabled={busy}
                  placeholder="例: 65"
                />
              </label>
              <label className="settings-field">
                <span>身長 (cm)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min={80}
                  max={250}
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  disabled={busy}
                  placeholder="例: 170"
                />
              </label>
              <label className="settings-field">
                <span>年齢</span>
                <input
                  type="number"
                  inputMode="numeric"
                  step="1"
                  min={5}
                  max={120}
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  disabled={busy}
                  placeholder="例: 35"
                />
              </label>
            </>
          )}
          {error && <div className="settings-error">⚠️ {error}</div>}
        </div>
        <footer className="settings-footer">
          <button
            type="button"
            className="settings-button"
            onClick={onClose}
            disabled={busy}
          >
            キャンセル
          </button>
          <button
            type="submit"
            className="settings-button settings-button-primary"
            disabled={busy || loading}
          >
            {busy ? '保存中…' : '保存'}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
