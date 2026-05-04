# Rindo（りんどう）— Web

札幌市・道央圏のサイクリングロード限定ナビゲーションアプリの **Web 版** です。

名前の由来: 林道（サイクリングロード・自然の道）＋ 竜胆（北海道に自生する花）。

## 概要

- **対象エリア**: 道央圏（北海道）
- **想定利用シーン**: ルート計画・勾配確認・GPX エクスポート（実走行ナビは将来 iOS 版で対応）
- **役割分担**: Web 版はルート計画・管理・サイクリングロード表示、iOS 版は実走行ナビ・走行ログ記録（HANDOFF [Web 版と iOS 版の役割分担](./HANDOFF_cycling-nav.md) 参照）
- **iOS 版**: 開発済み（バンドル ID `com.osprey74.rindo`、Phase iOS-5 まで実装完了）

詳細な技術仕様・データソース・実装フェーズは [HANDOFF_cycling-nav.md](./HANDOFF_cycling-nav.md) を参照してください。

## 実装済み機能

- サイクリングロード表示（16 路線、QGIS 補正済 + Valhalla map matching、Web 専用オーバーレイ）
  - 札幌市サイクリングロード 11 路線 + 追加 3 路線（丘珠空港緑地・屯田防風林・モエレ沼公園一周）
  - 北海道大規模自転車道 2 路線（`large_scale` フラグで識別）
- 路線クリックで詳細ポップアップ（距離・標高スパークライン・「ルートを取り込む」ボタン）
  - ルート取り込み時、保存ダイアログにサイクリングロード名を自動入力
- bicycle ルーティング（Valhalla）+ クリックで複数経由地対応
- 標高プロファイル表示（OpenTopoData SRTM 30m + 線形補間）
- 近隣施設マーカー（コンビニ・駐車場、Overpass API）
- GPX エクスポート（Garmin / Wahoo にインポート可能）
- 札幌の天気予報（気象庁 API）
- 認証（シングルユーザー・セッショントークン方式）
- ルート保存・命名・編集・削除
- 地点登録（自宅・職場・お気に入り）+ 地図上アイコン表示
- 出典・ライセンスダイアログ
- モバイル UI 対応（iPhone でフッタ位置の天気カード、コンパクトヘッダー）

> **Note**: Layer 1（OSM `highway=cycleway`）と Layer 2（OSM `route=bicycle` リレーション）は 2026-05 に全プラットフォームから削除済み。サイクリングロード表示は上記のキュレーション済みデータ（旧 Layer 3）のみ。iOS 版にはサイクリングロードオーバーレイ自体を表示しない設計に変更済み（Web 専用機能）。

## アーキテクチャ

```
[ ブラウザ（PC・iPhone）]
   ↓ Tailscale 経由 https://home-mac-mini.taila6ea.ts.net
[ M2 Mac mini @ 自宅 ]
   ├─ Caddy（リバースプロキシ + 静的配信、port 8080）
   │     ├─ /                  → Rindo-web 静的ファイル（このリポジトリ）
   │     ├─ /api/auth/login    → rindo-api（公開、シングルユーザートークン発行）
   │     ├─ /api/auth/logout   → rindo-api（公開）
   │     ├─ /api/auth/me       → rindo-api（要認証）
   │     ├─ /api/routes/*      → rindo-api（要認証）
   │     ├─ /api/locations/*   → rindo-api（要認証）
   │     ├─ /api/cycling-roads → rindo-api（公開、Tailnet 限定運用のため CRUD すべて認証なし）
   │     ├─ /api/profile       → rindo-api（要認証）
   │     ├─ /api/rides/*       → rindo-api（要認証、走行ログ）
   │     ├─ /api/health        → rindo-api
   │     ├─ /api/valhalla/*    → Valhalla
   │     ├─ /api/elevation     → OpenTopoData（リバプロ）
   │     ├─ /api/overpass      → Overpass API（リバプロ）
   │     └─ /api/weather/{code}→ JMA 気象庁（リバプロ）
   ├─ rindo-api（Bun + Hono + SQLite、port 3000）
   │     - 別リポジトリ: github.com/osprey74/rindo-api
   ├─ Valhalla Docker container（道央圏 PBF、port 8002）
   └─ Tailscale serve（HTTPS 終端、自動証明書）
```

## 技術スタック

- **フロントエンド**: React 19 + TypeScript + Vite
- **地図ライブラリ**: MapLibre GL JS
- **タイル**: OpenStreetMap 標準（`tile.openstreetmap.org`、max zoom 19）
  - 当初 CyclOSM を採用したが `openstreetmap.fr` の提供サーバが zoom 17 以上で応答しないため OSM 標準に切替（2026-05-02）
  - 自転車道情報はキュレーション済みサイクリングロード（16 路線）のオーバーレイで表示（Web 専用）
  - CyclOSM の見た目を復活させたい場合は [Stadia Maps](https://stadiamaps.com/) の無料 API キーを取得して切替可能
- **バックエンド**: [github.com/osprey74/rindo-api](https://github.com/osprey74/rindo-api)（Bun + Hono + SQLite、自宅 Mac mini で常時稼働）
- **ルーティング**: Valhalla（bicycle プロファイル、Docker、道央圏 OSM 切り出し）
- **認証**: シングルユーザー・セッショントークン方式（`POST /api/auth/login`、個人利用・Tailnet 内限定運用前提、Apple Sign In は不採用）
- **デプロイ**: 自宅 M2 Mac mini + Tailscale serve（Fly.io 相当の運用、月額電気代のみ）

## ローカル開発セットアップ

```bash
npm install
npm run dev
```

開発サーバが http://localhost:5173 で起動します。Vite proxy が以下にフォワード：

- `/api/valhalla/*` → http://localhost:8002（ローカル Valhalla）
- `/api/auth, /routes, /locations, /cycling-roads, /health` → http://localhost:3000（ローカル rindo-api）
- `/api/elevation, /overpass, /weather` → 各外部サービス

ローカル開発時は **Valhalla Docker** + **rindo-api 別ターミナル** を立ち上げる必要があります。詳細は [rindo-api の README](https://github.com/osprey74/rindo-api) と [HANDOFF_cycling-nav.md](./HANDOFF_cycling-nav.md) 参照。

## スクリプト

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバ起動（HMR 有効） |
| `npm run build` | 本番ビルド（`tsc -b && vite build`） |
| `npm run preview` | ビルド成果物のローカルプレビュー |
| `npm run lint` | ESLint 実行 |
| `bun run scripts/match-cycling-roads.ts` | Valhalla `/trace_attributes` で `sapporo-cyclingroad.geojson` を OSM にスナップ → `sapporo-cyclingroad.matched.geojson` 生成 |
| `bun run scripts/prepare-corrected.ts` | matched 版から内部メタデータを除去 → QGIS 編集用 `sapporo-cyclingroad.corrected.geojson` 生成 |
| `bun run scripts/dedup-vertices.ts` | 重複頂点除去（QGIS 編集後の整理） |
| `bun run scripts/tag-large-scale.ts` | corrected.geojson に `large_scale` フラグ付与（北海道大規模自転車道該当路線） |
| `bun run scripts/fetch-osm-cycleways.ts` | Overpass で `highway=cycleway` を取得 → `sapporo-osm-cycleways.geojson`（参考用、アプリでは未使用） |
| `bun run scripts/fetch-osm-bicycle-routes.ts` | Overpass で `route=bicycle` リレーションを取得 → `dosou-osm-bicycle-routes.geojson`（参考用、アプリでは未使用） |

## サイクリングロードデータと QGIS 編集ワークフロー

リポジトリ直下に 3 つの GeoJSON ファイルがあります（同じ路線セットの異なるバージョン）。

| ファイル | 内容 | 用途 |
|---|---|---|
| `sapporo-cyclingroad.geojson` | さっぽろサイクリングマップ（PDF）の QGIS デジタイズ原本 | 出典証跡。**変更しない** |
| `sapporo-cyclingroad.matched.geojson` | Valhalla で OSM にスナップした補正版（信頼スコア・元ジオメトリのバックアップ含む） | 補正の中間生成物・デバッグ用 |
| **`sapporo-cyclingroad.corrected.geojson`** | matched 版から内部メタデータを取り除いたクリーン版 | **アプリが参照する正本。QGIS で手動補正可能** |

OSM 由来データ（参考用、アプリでは未使用。Layer 1/2 は 2026-05 に削除済み）:

| ファイル | 内容 |
|---|---|
| `sapporo-osm-cycleways.geojson` | OSM `highway=cycleway` ways（札幌 bbox） |
| `dosou-osm-bicycle-routes.geojson` | OSM `route=bicycle` リレーション（道央圏） |

### 手動補正フロー（QGIS）

1. QGIS で `sapporo-cyclingroad.corrected.geojson` を開く
2. レイヤーパネルで右クリック → **編集モード切替**（鉛筆アイコン）
3. **頂点ツール**（V）で:
   - 不要な頂点を選択 → Delete キーで削除
   - 頂点をドラッグで移動
   - セグメント上をダブルクリックで頂点追加
4. （任意）**ベクタ → ジオメトリツール → ジオメトリの簡素化** で一括減点
5. **Ctrl+S** で保存（GeoJSON 形式のまま上書き）
6. ローカル dev server なら F5、Mac mini の本番なら git push → Mac mini で pull + rebuild

### 再マッチング（補正データ更新時）

PDF 原本（`sapporo-cyclingroad.geojson`）に新規路線を追加・既存路線を修正した場合:

```bash
# 前提: Valhalla コンテナが localhost:8002 で稼働中
bun run scripts/match-cycling-roads.ts   # → matched.geojson 再生成
bun run scripts/prepare-corrected.ts     # → corrected.geojson 再生成（!! 手動補正は失われる !!）
bun run scripts/tag-large-scale.ts       # → large_scale フラグ再付与
```

**注意**: `prepare-corrected.ts` は `corrected.geojson` を上書きします。QGIS で手動補正した内容を保持したい場合は事前に別名バックアップ。

### Valhalla（道央圏ローカルセットアップ）

`scripts/match-cycling-roads.ts` 実行には Valhalla の bicycle ルーティングサーバが `localhost:8002` で必要。セットアップ手順は [HANDOFF_cycling-nav.md](./HANDOFF_cycling-nav.md#valhalla-セットアップ手順) を参照（要 Docker Desktop）。

## デプロイ

本番運用は自宅 M2 Mac mini + Tailscale serve。詳細は [HANDOFF_cycling-nav.md](./HANDOFF_cycling-nav.md) のデプロイセクション参照。

更新フロー:

```bash
# Web 側のコード変更後
git push

# Mac mini に SSH して
ssh so4330@home-mac-mini
cd ~/dev/Rindo-web
git pull
npm run build
# launchd 管理の Caddy が dist/ を即座に配信開始
```

## ライセンス・出典表示

アプリ内に「出典・ライセンス」ダイアログ実装済み。詳細は [HANDOFF_cycling-nav.md](./HANDOFF_cycling-nav.md) を参照。

- © OpenStreetMap contributors（ODbL）
- 北海道建設部土木局提供（CC-BY、北海道大規模自転車道）
- 出典：札幌市建設局（さっぽろサイクリングマップ デジタイズデータ）
- NASA SRTM 30m / OpenTopoData（標高）
- Valhalla（BSD-3-Clause、ルーティング）
- 気象庁（天気予報）
