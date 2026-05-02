# Rindo（りんどう）— Web

札幌市・道央圏のサイクリングロード限定ナビゲーションアプリの **Web 版** です。

名前の由来: 林道（サイクリングロード・自然の道）＋ 竜胆（北海道に自生する花）。

## 概要

- **対象エリア**: 道央圏（北海道）
- **想定利用シーン**: サイクリングロードを優先する自転車ナビ・走行情報表示・GPX エクスポート
- **iOS 版**: 後続展開予定（バンドル ID `com.osprey74.rindo`）

詳細な技術仕様・データソース・実装フェーズは [HANDOFF_cycling-nav.md](./HANDOFF_cycling-nav.md) を参照してください。

## 技術スタック

- **フロントエンド**: React 19 + TypeScript + Vite
- **地図ライブラリ**: MapLibre GL JS
- **タイル**: CyclOSM（自転車特化レンダリング）
- **バックエンド**（別途）: Bun + Hono + SQLite、Fly.io（nrt）
- **ルーティング**（別途）: Valhalla（bicycle プロファイル）

## セットアップ

```bash
npm install
npm run dev
```

開発サーバが http://localhost:5173 で起動します。

## スクリプト

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバ起動（HMR 有効） |
| `npm run build` | 本番ビルド（`tsc -b && vite build`） |
| `npm run preview` | ビルド成果物のローカルプレビュー |
| `npm run lint` | ESLint 実行 |
| `bun run scripts/match-cycling-roads.ts` | Valhalla `/trace_attributes` で `sapporo-cyclingroad.geojson` を OSM にスナップ → `sapporo-cyclingroad.matched.geojson` を生成 |
| `bun run scripts/prepare-corrected.ts` | matched 版から内部メタデータを除去 → QGIS 編集用の `sapporo-cyclingroad.corrected.geojson` を生成 |

## サイクリングロードデータと QGIS 編集ワークフロー

リポジトリ直下に 3 つの GeoJSON ファイルがあります（同じ路線セットの異なるバージョン）。

| ファイル | 内容 | 用途 |
|---|---|---|
| `sapporo-cyclingroad.geojson` | さっぽろサイクリングマップ（PDF）の QGIS デジタイズ原本 | 出典証跡。**変更しない** |
| `sapporo-cyclingroad.matched.geojson` | Valhalla で OSM にスナップした補正版（信頼スコア・元ジオメトリのバックアップを含む） | 補正の中間生成物。デバッグ用 |
| **`sapporo-cyclingroad.corrected.geojson`** | matched 版から内部メタデータを取り除いたクリーン版 | **アプリが参照する正本。QGIS で手動補正可能** |

### 手動補正フロー（QGIS）

1. QGIS で `sapporo-cyclingroad.corrected.geojson` を開く
2. レイヤーパネルで右クリック → **編集モード切替**（鉛筆アイコン）
3. **頂点ツール**（V）で:
   - 不要な頂点を選択 → Delete キーで削除
   - 頂点をドラッグで移動
   - セグメント上をダブルクリックで頂点追加
4. （任意）**ベクタ → ジオメトリツール → ジオメトリの簡素化** で一括減点
5. **Ctrl+S** で保存（GeoJSON 形式のまま上書き）
6. ブラウザで開発サーバを **F5** で再読み込み → 編集結果が即時反映

#### 背景レイヤーの追加（推奨）

QGIS で OSM タイルを背景表示するには:
- メニュー: ブラウザパネル → XYZ Tiles → OpenStreetMap（QGIS 3.x 標準で含まれる）
- または CyclOSM タイルを追加: 新規 XYZ Layer に `https://a.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png` を設定

### 再マッチング（補正データ更新時）

PDF 原本（`sapporo-cyclingroad.geojson`）に新規路線を追加・既存路線を修正した場合:

```bash
# 前提: Valhalla コンテナが localhost:8002 で稼働中
bun run scripts/match-cycling-roads.ts   # → matched.geojson を再生成
bun run scripts/prepare-corrected.ts     # → corrected.geojson を再生成（!! QGIS で手動補正した内容は失われるので注意 !!）
```

**注意**: `prepare-corrected.ts` は `matched.geojson` から `corrected.geojson` を上書き生成します。QGIS で `corrected.geojson` を直接編集している場合、再生成前に別名でバックアップしてください。

### Valhalla（道央圏ローカルセットアップ）

`scripts/match-cycling-roads.ts` 実行には Valhalla の bicycle ルーティングサーバが `localhost:8002` で必要です。セットアップ手順は [HANDOFF_cycling-nav.md](./HANDOFF_cycling-nav.md#valhalla-セットアップ手順) を参照（要 Docker Desktop）。

## ライセンス・出典表示

このアプリは複数のオープンデータを利用します。表示時には以下の出典明記が必要です（詳細は [HANDOFF_cycling-nav.md](./HANDOFF_cycling-nav.md)）。

- © OpenStreetMap contributors（ODbL）
- © CyclOSM, © OpenStreetMap contributors
- 北海道建設部土木局提供（CC-BY、北海道大規模自転車道）
- 出典：札幌市建設局（さっぽろサイクリングマップ デジタイズデータ）
