import { useEffect, useRef } from 'react'
import './AttributionDialog.css'

type Props = {
  open: boolean
  onClose: () => void
}

export function AttributionDialog({ open, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === ref.current) onClose()
  }

  return (
    <dialog
      ref={ref}
      className="attrib-dialog"
      onClose={onClose}
      onClick={handleBackdropClick}
      aria-labelledby="attrib-title"
    >
      <header className="attrib-header">
        <h2 id="attrib-title">出典・ライセンス</h2>
        <button
          type="button"
          className="attrib-close"
          onClick={onClose}
          aria-label="閉じる"
        >
          ×
        </button>
      </header>
      <div className="attrib-body">
        <section>
          <h3>地図・経路データ</h3>
          <ul>
            <li>
              <strong>© OpenStreetMap contributors</strong>{' '}
              <span className="attrib-license">(ODbL)</span>
              <p>
                ベースマップ、近隣施設（コンビニ・駐車場）、Valhalla ルーティングのすべての元データ。
              </p>
              <p>
                <a
                  href="https://www.openstreetmap.org/copyright"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  https://www.openstreetmap.org/copyright
                </a>
              </p>
            </li>
          </ul>
        </section>

        <section>
          <h3>サイクリングロードデータ</h3>
          <ul>
            <li>
              <strong>札幌市サイクリングロード（16 路線）</strong>
              <p>
                出典：<strong>札幌市建設局</strong>「さっぽろサイクリングマップ」（PDF）を QGIS でデジタイズし、Valhalla map matching で OSM にスナッピング、QGIS で手動補正済み。
              </p>
              <p>
                <a
                  href="https://www.city.sapporo.jp/kensetsu/dokan/jitensha/cyclingmap.html"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  https://www.city.sapporo.jp/kensetsu/dokan/jitensha/cyclingmap.html
                </a>
              </p>
            </li>
            <li>
              <strong>北海道大規模自転車道</strong>{' '}
              <span className="attrib-license">(CC-BY)</span>
              <p>
                <strong>北海道建設部土木局提供</strong>（札幌恵庭線・滝野上野幌線等）。
              </p>
              <p>
                <a
                  href="https://www.pref.hokkaido.lg.jp/kn/ddr/94728.html"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  https://www.pref.hokkaido.lg.jp/kn/ddr/94728.html
                </a>
              </p>
            </li>
          </ul>
        </section>

        <section>
          <h3>標高データ</h3>
          <ul>
            <li>
              <strong>NASA SRTM 30m</strong>{' '}
              <span className="attrib-license">(Public Domain)</span>
              <p>
                <a
                  href="https://www.opentopodata.org/datasets/srtm/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  OpenTopoData
                </a>
                {' '}経由で取得。
              </p>
            </li>
          </ul>
        </section>

        <section>
          <h3>ルーティングエンジン</h3>
          <ul>
            <li>
              <strong>Valhalla</strong>{' '}
              <span className="attrib-license">(BSD-3-Clause)</span>
              <p>
                自転車プロファイルでローカル動作（道央圏 OSM extract）。
              </p>
              <p>
                <a
                  href="https://github.com/valhalla/valhalla"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  https://github.com/valhalla/valhalla
                </a>
              </p>
            </li>
          </ul>
        </section>

        <section>
          <h3>ソフトウェア</h3>
          <ul>
            <li>
              <a href="https://maplibre.org/" target="_blank" rel="noopener noreferrer">
                MapLibre GL JS
              </a>{' '}
              <span className="attrib-license">(BSD-3-Clause)</span>
            </li>
            <li>
              <a href="https://react.dev/" target="_blank" rel="noopener noreferrer">
                React
              </a>
              {', '}
              <a href="https://vite.dev/" target="_blank" rel="noopener noreferrer">
                Vite
              </a>
              {', '}
              <a href="https://www.typescriptlang.org/" target="_blank" rel="noopener noreferrer">
                TypeScript
              </a>{' '}
              <span className="attrib-license">(MIT / Apache-2.0)</span>
            </li>
          </ul>
        </section>

        <section>
          <h3>本アプリ</h3>
          <p>
            <strong>Rindo（りんどう）</strong> — 個人プロジェクト
          </p>
          <p>
            <a
              href="https://github.com/osprey74/Rindo-web"
              target="_blank"
              rel="noopener noreferrer"
            >
              https://github.com/osprey74/Rindo-web
            </a>
          </p>
        </section>
      </div>
    </dialog>
  )
}
