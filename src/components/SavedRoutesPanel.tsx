import { useEffect, useRef, useState } from 'react'
import {
  deleteSavedRoute,
  listSavedRoutes,
  updateSavedRoute,
  type SavedRoute,
} from '../lib/saved-routes'
import { SaveRouteDialog, type SaveRouteFormValues } from './SaveRouteDialog'
import './SavedRoutesPanel.css'

type Props = {
  open: boolean
  onClose: () => void
  onLoad: (route: SavedRoute) => void
  /** Notify caller that the saved route count changed (e.g., after delete). */
  onChanged?: () => void
}

function formatDistance(km: number | null): string {
  if (km === null) return '-'
  return km >= 1 ? `${km.toFixed(2)} km` : `${(km * 1000).toFixed(0)} m`
}

function formatDuration(min: number | null): string {
  if (min === null) return '-'
  const m = Math.round(min)
  if (m < 60) return `${m} 分`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r === 0 ? `${h} 時間` : `${h} 時間 ${r} 分`
}

function formatDate(iso: string): string {
  const d = new Date(iso.replace(' ', 'T') + (iso.includes('T') ? '' : 'Z'))
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

export function SavedRoutesPanel({ open, onClose, onLoad, onChanged }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [routes, setRoutes] = useState<SavedRoute[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [renameTarget, setRenameTarget] = useState<SavedRoute | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    void refresh()
  }, [open])

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const list = await listSavedRoutes()
      setRoutes(list)
    } catch (e) {
      setError((e as Error).message || '一覧取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose()
  }

  async function handleDelete(route: SavedRoute) {
    if (!confirm(`「${route.name}」を削除しますか？`)) return
    try {
      await deleteSavedRoute(route.id)
      await refresh()
      onChanged?.()
    } catch (e) {
      alert(`削除に失敗しました: ${(e as Error).message}`)
    }
  }

  async function handleRename(values: SaveRouteFormValues) {
    if (!renameTarget) return
    await updateSavedRoute(renameTarget.id, { name: values.name })
    setRenameTarget(null)
    await refresh()
    onChanged?.()
  }

  return (
    <>
      <dialog
        ref={dialogRef}
        className="routes-panel"
        onClose={onClose}
        onClick={handleBackdropClick}
        aria-labelledby="routes-panel-title"
      >
        <header className="routes-panel-header">
          <h2 id="routes-panel-title">
            保存ルート{routes ? ` (${routes.length})` : ''}
          </h2>
          <button
            type="button"
            className="routes-panel-close"
            onClick={onClose}
            aria-label="閉じる"
          >
            ×
          </button>
        </header>
        <div className="routes-panel-body">
          {loading && <div className="routes-panel-loading">読み込み中...</div>}
          {error && <div className="routes-panel-error">⚠️ {error}</div>}
          {!loading && !error && routes && routes.length === 0 && (
            <div className="routes-panel-empty">
              保存されたルートはありません。地図でルートを計算した後、ステータスバーの「ルート保存」ボタンで保存できます。
            </div>
          )}
          {routes && routes.length > 0 && (
            <ul className="routes-panel-list">
              {routes.map((r) => (
                <li key={r.id} className="routes-panel-item">
                  <div className="routes-panel-item-main">
                    <div className="routes-panel-item-name">{r.name}</div>
                    <div className="routes-panel-item-meta">
                      <span>{formatDistance(r.distance_km)}</span>
                      <span>·</span>
                      <span>{formatDuration(r.duration_min)}</span>
                      <span>·</span>
                      <span>{formatDate(r.updated_at)}</span>
                      {r.waypoints.length > 2 && (
                        <>
                          <span>·</span>
                          <span>経由地 {r.waypoints.length - 2}</span>
                        </>
                      )}
                    </div>
                    {r.description && (
                      <div className="routes-panel-item-desc">{r.description}</div>
                    )}
                  </div>
                  <div className="routes-panel-item-actions">
                    <button
                      type="button"
                      className="routes-panel-button routes-panel-button-primary"
                      onClick={() => onLoad(r)}
                    >
                      読み込み
                    </button>
                    <button
                      type="button"
                      className="routes-panel-button"
                      onClick={() => setRenameTarget(r)}
                    >
                      名前変更
                    </button>
                    <button
                      type="button"
                      className="routes-panel-button routes-panel-button-danger"
                      onClick={() => handleDelete(r)}
                    >
                      削除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </dialog>
      <SaveRouteDialog
        open={renameTarget !== null}
        mode="rename"
        initialName={renameTarget?.name}
        onSubmit={handleRename}
        onClose={() => setRenameTarget(null)}
      />
    </>
  )
}
