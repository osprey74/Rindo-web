import { useEffect, useRef, useState } from 'react'
import './SaveRouteDialog.css'

export type SaveRouteFormValues = {
  name: string
  description: string
}

type Props = {
  open: boolean
  mode: 'create' | 'rename'
  initialName?: string
  initialDescription?: string
  onSubmit: (values: SaveRouteFormValues) => void | Promise<void>
  onClose: () => void
}

const defaultName = (): string => {
  const d = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `ルート ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function SaveRouteDialog({
  open,
  mode,
  initialName,
  initialDescription,
  onSubmit,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName(initialName ?? defaultName())
      setDescription(initialDescription ?? '')
      setError(null)
      setBusy(false)
    }
  }, [open, initialName, initialDescription])

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
    setBusy(true)
    setError(null)
    try {
      await onSubmit({ name: name.trim(), description: description.trim() })
    } catch (err) {
      setError((err as Error).message || '保存に失敗しました')
      setBusy(false)
    }
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current && !busy) onClose()
  }

  const title = mode === 'create' ? 'ルートを保存' : 'ルート名を変更'
  const submitLabel = mode === 'create' ? '保存' : '更新'

  return (
    <dialog
      ref={dialogRef}
      className="save-dialog"
      onClose={() => !busy && onClose()}
      onClick={handleBackdropClick}
      aria-labelledby="save-dialog-title"
    >
      <form className="save-dialog-form" onSubmit={handleSubmit}>
        <header className="save-dialog-header">
          <h2 id="save-dialog-title">{title}</h2>
          <button
            type="button"
            className="save-dialog-close"
            onClick={onClose}
            disabled={busy}
            aria-label="閉じる"
          >
            ×
          </button>
        </header>
        <div className="save-dialog-body">
          <label className="save-dialog-field">
            <span>名前</span>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
              disabled={busy}
            />
          </label>
          {mode === 'create' && (
            <label className="save-dialog-field">
              <span>メモ（任意）</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={3}
                disabled={busy}
              />
            </label>
          )}
          {error && <div className="save-dialog-error">⚠️ {error}</div>}
        </div>
        <footer className="save-dialog-footer">
          <button
            type="button"
            className="save-dialog-button"
            onClick={onClose}
            disabled={busy}
          >
            キャンセル
          </button>
          <button
            type="submit"
            className="save-dialog-button save-dialog-button-primary"
            disabled={busy}
          >
            {busy ? '送信中…' : submitLabel}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
