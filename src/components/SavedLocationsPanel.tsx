import { useEffect, useRef, useState } from 'react'
import {
  CATEGORY_EMOJI,
  CATEGORY_LABEL,
  createSavedLocation,
  deleteSavedLocation,
  listSavedLocations,
  updateSavedLocation,
  type SavedLocation,
} from '../lib/saved-locations'
import { SaveLocationDialog, type SaveLocationFormValues } from './SaveLocationDialog'
import './SavedLocationsPanel.css'

type Props = {
  open: boolean
  onClose: () => void
  /** Called when user clicks "使用" on a row. Adds it as a waypoint. */
  onUseLocation: (location: SavedLocation) => void
  /** Snapshot of the map's current center. Used as default coords when registering. */
  getMapCenter: () => { lon: number; lat: number } | null
  /** Notify parent that the saved-location list changed (so MapView can refresh markers). */
  onChanged?: () => void
}

export function SavedLocationsPanel({
  open,
  onClose,
  onUseLocation,
  getMapCenter,
  onChanged,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [locations, setLocations] = useState<SavedLocation[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create')
  const [editorInitial, setEditorInitial] = useState<SavedLocation | null>(null)

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
      const list = await listSavedLocations()
      setLocations(list)
    } catch (e) {
      setError((e as Error).message || '一覧取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose()
  }

  function openCreate() {
    const center = getMapCenter()
    if (!center) {
      alert('地図の中心が取得できません')
      return
    }
    setEditorInitial({
      id: 0,
      name: '',
      category: 'other',
      lon: center.lon,
      lat: center.lat,
      notes: null,
      created_at: '',
    })
    setEditorMode('create')
    setEditorOpen(true)
  }

  function openEdit(loc: SavedLocation) {
    setEditorInitial(loc)
    setEditorMode('edit')
    setEditorOpen(true)
  }

  async function handleEditorSubmit(values: SaveLocationFormValues) {
    if (editorMode === 'create') {
      await createSavedLocation({
        name: values.name,
        category: values.category,
        lon: values.lon,
        lat: values.lat,
        notes: values.notes || null,
      })
    } else if (editorInitial) {
      await updateSavedLocation(editorInitial.id, {
        name: values.name,
        category: values.category,
        notes: values.notes || null,
        // lon/lat are not updated in edit mode (form fields are disabled)
      })
    }
    setEditorOpen(false)
    setEditorInitial(null)
    await refresh()
    onChanged?.()
  }

  async function handleDelete(loc: SavedLocation) {
    if (!confirm(`「${loc.name}」を削除しますか？`)) return
    try {
      await deleteSavedLocation(loc.id)
      await refresh()
      onChanged?.()
    } catch (e) {
      alert(`削除に失敗しました: ${(e as Error).message}`)
    }
  }

  return (
    <>
      <dialog
        ref={dialogRef}
        className="locs-panel"
        onClose={onClose}
        onClick={handleBackdropClick}
        aria-labelledby="locs-panel-title"
      >
        <header className="locs-panel-header">
          <h2 id="locs-panel-title">
            登録地点{locations ? ` (${locations.length})` : ''}
          </h2>
          <button
            type="button"
            className="locs-panel-close"
            onClick={onClose}
            aria-label="閉じる"
          >
            ×
          </button>
        </header>
        <div className="locs-panel-body">
          {loading && <div className="locs-panel-msg">読み込み中...</div>}
          {error && <div className="locs-panel-msg locs-panel-err">⚠️ {error}</div>}
          {!loading && !error && locations && locations.length === 0 && (
            <div className="locs-panel-msg">
              登録地点はありません。「現在の中心を登録」で追加できます。
            </div>
          )}
          {locations && locations.length > 0 && (
            <ul className="locs-panel-list">
              {locations.map((loc) => (
                <li key={loc.id} className="locs-panel-item">
                  <div className="locs-panel-item-icon">{CATEGORY_EMOJI[loc.category]}</div>
                  <div className="locs-panel-item-main">
                    <div className="locs-panel-item-name">{loc.name}</div>
                    <div className="locs-panel-item-meta">
                      <span>{CATEGORY_LABEL[loc.category]}</span>
                      <span>·</span>
                      <span>
                        {loc.lat.toFixed(4)}, {loc.lon.toFixed(4)}
                      </span>
                    </div>
                    {loc.notes && <div className="locs-panel-item-notes">{loc.notes}</div>}
                  </div>
                  <div className="locs-panel-item-actions">
                    <button
                      type="button"
                      className="locs-panel-button locs-panel-button-primary"
                      onClick={() => onUseLocation(loc)}
                      title="現在のルートに追加"
                    >
                      使用
                    </button>
                    <button
                      type="button"
                      className="locs-panel-button"
                      onClick={() => openEdit(loc)}
                    >
                      編集
                    </button>
                    <button
                      type="button"
                      className="locs-panel-button locs-panel-button-danger"
                      onClick={() => handleDelete(loc)}
                    >
                      削除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <footer className="locs-panel-footer">
          <button
            type="button"
            className="locs-panel-button locs-panel-button-primary"
            onClick={openCreate}
          >
            ＋ 現在の中心を登録
          </button>
        </footer>
      </dialog>
      <SaveLocationDialog
        open={editorOpen}
        mode={editorMode}
        initialLocation={editorInitial}
        onSubmit={handleEditorSubmit}
        onClose={() => {
          setEditorOpen(false)
          setEditorInitial(null)
        }}
      />
    </>
  )
}
