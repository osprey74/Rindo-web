import { useEffect, useRef, useState } from 'react'
import {
  CATEGORY_EMOJI,
  CATEGORY_LABEL,
  type LocationCategory,
  type SavedLocation,
} from '../lib/saved-locations'
import './SaveLocationDialog.css'

export type SaveLocationFormValues = {
  name: string
  category: LocationCategory
  lon: number
  lat: number
  notes: string
}

type Props = {
  open: boolean
  /** When 'create', initialLocation may carry initial coords (e.g., map center). */
  mode: 'create' | 'edit'
  initialLocation?: Pick<SavedLocation, 'name' | 'category' | 'lon' | 'lat' | 'notes'> | null
  onSubmit: (values: SaveLocationFormValues) => void | Promise<void>
  onClose: () => void
}

const CATEGORIES: LocationCategory[] = ['home', 'work', 'favorite', 'other']

function fmtCoord(n: number): string {
  return n.toFixed(6)
}

export function SaveLocationDialog({
  open,
  mode,
  initialLocation,
  onSubmit,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<LocationCategory>('other')
  const [lon, setLon] = useState('')
  const [lat, setLat] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(initialLocation?.name ?? '')
    setCategory(initialLocation?.category ?? 'other')
    setLon(initialLocation ? fmtCoord(initialLocation.lon) : '')
    setLat(initialLocation ? fmtCoord(initialLocation.lat) : '')
    setNotes(initialLocation?.notes ?? '')
    setError(null)
    setBusy(false)
  }, [open, initialLocation])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      setTimeout(() => inputRef.current?.select(), 0)
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!name.trim()) {
      setError('名前を入力してください')
      return
    }
    const lonNum = Number(lon)
    const latNum = Number(lat)
    if (!Number.isFinite(lonNum) || !Number.isFinite(latNum)) {
      setError('座標が不正です')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSubmit({
        name: name.trim(),
        category,
        lon: lonNum,
        lat: latNum,
        notes: notes.trim(),
      })
    } catch (err) {
      setError((err as Error).message || '保存に失敗しました')
      setBusy(false)
    }
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current && !busy) onClose()
  }

  const title = mode === 'create' ? '地点を登録' : '地点を編集'
  const submitLabel = mode === 'create' ? '登録' : '更新'

  return (
    <dialog
      ref={dialogRef}
      className="save-loc-dialog"
      onClose={() => !busy && onClose()}
      onClick={handleBackdropClick}
      aria-labelledby="save-loc-title"
    >
      <form className="save-loc-form" onSubmit={handleSubmit}>
        <header className="save-loc-header">
          <h2 id="save-loc-title">{title}</h2>
          <button
            type="button"
            className="save-loc-close"
            onClick={onClose}
            disabled={busy}
            aria-label="閉じる"
          >
            ×
          </button>
        </header>
        <div className="save-loc-body">
          <label className="save-loc-field">
            <span>名前</span>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
              disabled={busy}
              placeholder="自宅 / 職場 / 大通公園 など"
            />
          </label>
          <fieldset className="save-loc-fieldset">
            <legend>カテゴリー</legend>
            <div className="save-loc-categories">
              {CATEGORIES.map((c) => (
                <label key={c} className="save-loc-category">
                  <input
                    type="radio"
                    name="category"
                    value={c}
                    checked={category === c}
                    onChange={() => setCategory(c)}
                    disabled={busy}
                  />
                  <span className="save-loc-category-icon">{CATEGORY_EMOJI[c]}</span>
                  <span>{CATEGORY_LABEL[c]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="save-loc-coords">
            <label className="save-loc-field">
              <span>経度</span>
              <input
                type="text"
                inputMode="decimal"
                value={lon}
                onChange={(e) => setLon(e.target.value)}
                disabled={busy || mode === 'edit'}
              />
            </label>
            <label className="save-loc-field">
              <span>緯度</span>
              <input
                type="text"
                inputMode="decimal"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                disabled={busy || mode === 'edit'}
              />
            </label>
          </div>
          {mode === 'edit' && (
            <p className="save-loc-hint">
              座標は変更できません。位置を変更するには削除して再登録してください。
            </p>
          )}
          <label className="save-loc-field">
            <span>メモ（任意）</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              rows={2}
              disabled={busy}
            />
          </label>
          {error && <div className="save-loc-error">⚠️ {error}</div>}
        </div>
        <footer className="save-loc-footer">
          <button
            type="button"
            className="save-loc-button"
            onClick={onClose}
            disabled={busy}
          >
            キャンセル
          </button>
          <button
            type="submit"
            className="save-loc-button save-loc-button-primary"
            disabled={busy}
          >
            {busy ? '送信中…' : submitLabel}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
