# HANDOFF: Rindo（りんどう）

## プロジェクト概要

**アプリ名**: Rindo（りんどう）
**名前の由来**: 林道（サイクリングロード・自然の道）＋竜胆（北海道に自生する花）
**GitHubリポジトリ**:
- Web版: `github.com/osprey74/rindo-web`
- iOS版: `github.com/osprey74/rindo-ios`

**バンドルID（iOS）**: `com.osprey74.rindo`

札幌市を中心とした道央圏のサイクリングロード限定ナビゲーションアプリ。
Web版（React + MapLibre GL）を先行開発し、将来的にiOS版を展開予定。
OpenStreetMap（OSM）ベースのルーティングエンジン（Valhalla）と、独自登録サイクリングロードDBを組み合わせた地図ナビサービス。

---

## 実装予定機能

| # | 機能 | 優先度 |
|---|------|--------|
| 1 | Webインターフェイスでサイクリングロードを登録 | 高 |
| 2 | 自転車ナビゲーション（サイクリングロード限定） | 高 |
| 3 | 走行情報表示（速度・勾配・消費カロリー・方向・経過時間・所要時間） | 高 |
| 4 | サイクリングロード近隣の駐車場情報表示 | 中 |
| 5 | GPSログのGPXエクスポート | 中 |

---

## 技術スタック

### フロントエンド（Web）
- **フレームワーク**: React 19 + TypeScript + Vite
- **地図ライブラリ**: MapLibre GL JS
- **タイルレイヤー**: OpenStreetMap 標準（`https://tile.openstreetmap.org/{z}/{x}/{y}.png`、max zoom 19）
  - 当初 CyclOSM（`tile-cyclosm.openstreetmap.fr`）を採用したが、zoom 17 以上で応答が返らずオーバーズーム時に著しく劣化したため 2026-05-02 に OSM 標準へ切替
  - 自転車道情報は Web 側オーバーレイ（Layer 1: 緑、OSM `highway=cycleway`）で確保
  - CyclOSM の見た目を復活させたい場合は [Stadia Maps](https://stadiamaps.com/) の無料 API キーを取得して切替可能

### バックエンド
- **APIサーバー**: Bun + Hono
- **データベース**: SQLite（`bun:sqlite` 内蔵）
- **デプロイ**: 自宅 M2 Mac mini + Tailscale serve（HTTPS 終端・自動証明書）
  - エンドポイント: `https://home-mac-mini.taila6ea.ts.net`
  - 個人利用・Tailnet 内限定運用前提（AppStore 公開・不特定多数公開の予定なし）

### ルーティングエンジン
- **エンジン**: Valhalla（公式Dockerイメージ使用）
- **Dockerイメージ**: `ghcr.io/valhalla/valhalla-scripted:latest`
  - ⚠️ `nilsnolde/docker-valhalla` は2025年7月22日にアーカイブ済み。使用禁止。
- **プロファイル**: `bicycle`（costing_options でサイクリングロード優先に調整）
- **対象範囲**: 道央圏（北海道・osmiumでbbox切り出し）

### OSMデータ
- **ソース**: GeoFabrik 北海道エクストラクト（177MB）
  - URL: `https://download.geofabrik.de/asia/japan/hokkaido-latest.osm.pbf`
- **切り出しツール**: osmium-tool
- **道央圏 bounding box**: `140.8,42.4,142.6,43.6`（lon_min,lat_min,lon_max,lat_max）

### 標高データ
- **API**: OpenTopoData（SRTM 30m精度、無料）
  - URL: `https://api.opentopodata.org/v1/srtm30m`

---

## データソース

サイクリングロード関連レイヤーは 3 層構成。Layer 1/2 は固定的なコンテンツのため、Web 版・iOS 版とも **ビルド時にバンドルされた静的 GeoJSON** を読み込む（ランタイムで Overpass を叩かない）。Layer 3 のみ rindo-api 経由で動的に取得する。

### Layer 1: OSM `highway=cycleway`（緑、線幅 3）
- OSM の `highway=cycleway` タグが付与されたウェイ
- 取得方法: `Rindo-web/scripts/fetch-osm-cycleways.ts` で Overpass API から事前取得 → `Rindo-web/sapporo-osm-cycleways.geojson` として保存
- 配信方法: Vite が静的 GeoJSON として import（[Rindo-web/src/components/MapView.tsx](src/components/MapView.tsx) の `osmCyclewaysUrl`）
- データ更新頻度: 数か月に 1 回スクリプトを再実行する想定（個人利用のため OSM のリアルタイム性は重視しない）
- ライセンス: ODbL（表示時に © OpenStreetMap contributors 必須）

### Layer 2: OSM `route=bicycle` リレーション（青、線幅 4）
- OSM の `type=route, route=bicycle` リレーション（道央圏）
- 取得方法: `Rindo-web/scripts/fetch-osm-bicycle-routes.ts` で Overpass API から事前取得 → `Rindo-web/dosou-osm-bicycle-routes.geojson` として保存
- 配信方法: Layer 1 と同じく Vite の静的 import
- ライセンス: ODbL（表示時に © OpenStreetMap contributors 必須）
- ⚠️ 旧仕様では「北海道大規模自転車道（北海道庁）」を Layer 2 としていたが、現在は Layer 3 に統合済み（後述の `large_scale` フラグで識別）

### Layer 3: 独自登録 DB（SQLite、オレンジ）
- 札幌市公式 13 サイクリングロード（QGIS デジタイズ + Valhalla map matching 補正）
  - さっぽろサイクリングマップ（PDF）を QGIS でデジタイズした GeoJSON
  - 参照 PDF: https://www.city.sapporo.jp/kensetsu/dokan/jitensha/cyclingmap.html
  - データソース: `Rindo-web/sapporo-cyclingroad.corrected.geojson`
- 北海道大規模自転車道（北海道庁・CC-BY）も同テーブル内に `large_scale=true` フラグ付きで格納
  - 入手先: https://www.pref.hokkaido.lg.jp/kn/ddr/94728.html
  - タグ付与スクリプト: `Rindo-web/scripts/tag-large-scale.ts`
- 配信方法: rindo-api の `GET /api/cycling-roads` から GeoJSON FeatureCollection で取得
- 属性: `id`, `name`, `ward`, `road_type`（`exclusive` / `shared`）, `source`, `notes`, `large_scale`（boolean）
- 描画スタイル:
  - `road_type='exclusive'`: オレンジ実線（線幅 4）
  - `road_type='shared'`: オレンジ破線（線幅 2、`line-dasharray: [4, 2]`）
- ⚠️ 札幌市からの GIS データ公式提供はなし。PDF デジタイズのため誤差あり（数十 m 程度）
- ライセンス: 札幌市建設局（要出典明示）/ 北海道建設部土木局提供（CC-BY）

---

## DBスキーマ（SQLite）

実装は [rindo-api/migrations/001_init.sql](https://github.com/osprey74/rindo-api/blob/main/migrations/001_init.sql) を正とする。テーブル: `users` / `routes` / `saved_locations` / `cycling_roads`。

### cycling_roads テーブル
```sql
CREATE TABLE IF NOT EXISTS cycling_roads (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  ward          TEXT,
  road_type     TEXT CHECK(road_type IN ('exclusive', 'shared')),
  geometry_json TEXT NOT NULL,  -- GeoJSON LineString or MultiLineString 文字列
  source        TEXT,
  notes         TEXT,
  large_scale   INTEGER NOT NULL DEFAULT 0,  -- 1 = 北海道大規模自転車道（CC-BY）
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `road_type` の値
| 値 | 意味 |
|----|------|
| `exclusive` | 自転車歩行者専用区間 |
| `shared` | 一般道路利用区間 |

### `large_scale` フラグ
| 値 | 意味 |
|----|------|
| `0` | 札幌市公式 13 サイクリングロード（既定値） |
| `1` | 北海道大規模自転車道（北海道庁オープンデータ・CC-BY） |

---

## Valhalla セットアップ手順

### 1. 道央圏PBF切り出し
```bash
# osmium インストール（macOS）
brew install osmium-tool

# 北海道PBFダウンロード
wget https://download.geofabrik.de/asia/japan/hokkaido-latest.osm.pbf

# 道央圏切り出し（bbox: 西端,南端,東端,北端）
osmium extract \
  --bbox 140.8,42.4,142.6,43.6 \
  hokkaido-latest.osm.pbf \
  --output dosou-latest.osm.pbf
```

### 2. Valhalla起動（Docker）
```bash
mkdir -p ~/valhalla/custom_files

# PBFをcustom_filesに配置
cp dosou-latest.osm.pbf ~/valhalla/custom_files/

docker run -d \
  --name valhalla \
  --restart unless-stopped \
  -p 8002:8002 \
  -v ~/valhalla/custom_files:/custom_files \
  -e build_elevation=False \
  -e build_admins=True \
  ghcr.io/valhalla/valhalla-scripted:latest

# ログ確認（タイルビルド完了まで待つ）
docker logs -f valhalla
```

> ⚠️ `build_elevation=True` を有効にすると enhance ステージで `valhalla_build_tiles` が segfault する事象を 2026-05-01 に確認済み（valhalla-scripted v3.7.0、道央圏 PBF）。
> 標高データはフロントエンド側の OpenTopoData API で取得する設計のため、Valhalla 側の `build_elevation` は **False** で起動すること。

### 3. 動作確認
```bash
curl -X POST http://localhost:8002/route \
  -H 'Content-Type: application/json' \
  -d '{
    "locations": [
      {"lon": 141.3468, "lat": 43.0686},
      {"lon": 141.3514, "lat": 43.0607}
    ],
    "costing": "bicycle",
    "costing_options": {
      "bicycle": {
        "bicycle_type": "Road",
        "use_roads": 0.1,
        "use_trails": 1.0
      }
    }
  }'
```

### 4. Mac mini メモリ割り当て
Docker Desktop → Resources → Memory: 最低2GB（道央圏）、北海道全域なら4GB推奨

---

## APIエンドポイント

実装は [rindo-api](https://github.com/osprey74/rindo-api)（Bun + Hono）。Mac mini 上の Caddy リバースプロキシが `/api/*` を rindo-api または各種外部サービスに振り分ける。

### rindo-api 直接ハンドリング

```
# 公開（認証不要）
GET  /api/health                          死活確認
POST /api/auth/login                      シングルユーザーセッショントークン発行
POST /api/auth/logout                     セッション無効化（best-effort）

# 要認証（Authorization: Bearer <token>）
GET  /api/auth/me                         現在ユーザー情報
GET  /api/routes                          保存ルート一覧
POST /api/routes                          ルート作成
GET  /api/routes/:id                      ルート詳細
PUT  /api/routes/:id                      ルート更新
DELETE /api/routes/:id                    ルート削除
GET  /api/locations                       地点登録一覧
POST /api/locations                       地点作成
PUT  /api/locations/:id                   地点更新
DELETE /api/locations/:id                 地点削除
GET  /api/cycling-roads                   Layer 3（GeoJSON FeatureCollection）
GET  /api/cycling-roads/:id               単体取得（GeoJSON Feature）
POST /api/cycling-roads                   新規作成
PUT  /api/cycling-roads/:id               更新
DELETE /api/cycling-roads/:id             削除
GET  /api/profile                         プロフィール取得
PUT  /api/profile                         プロフィール更新
```

### Caddy 経由のリバースプロキシ（rindo-api を経由しない）

```
POST /api/valhalla/route                  Valhalla（localhost:8002）へ
GET  /api/elevation?coords=...            OpenTopoData（SRTM 30m）へ
GET  /api/overpass?...                    Overpass API（コンビニ・駐車場検索）へ
GET  /api/weather/{areaCode}              気象庁 API へ
```

### 認証方式

シングルユーザー・セッショントークン方式。`POST /api/auth/login` でリクエストすると seeded 単一ユーザー（`users.id = 1`）のセッションが発行される。トークンはクライアント側で永続化し、以降の API 呼び出しに `Authorization: Bearer <token>` で付加する。Apple Sign In、OAuth、dev-login 等は実装していない。

---

## 地図レイヤー表示仕様（MapLibre GL JS）

実装は [Rindo-web/src/components/MapView.tsx](src/components/MapView.tsx) の `setupLayers` 関数。iOS 版も同じ色・幅で描画して表示一貫性を確保する。

```typescript
// Layer 1: OSM `highway=cycleway`（緑）
'line-color': '#1D9E75'  // OSM_CYCLEWAY_COLOR
'line-width': 3
'line-opacity': 0.85

// Layer 2: OSM `route=bicycle` リレーション（青）
'line-color': '#3C7B91'  // OSM_ROUTE_COLOR
'line-width': 4
'line-opacity': 0.9

// Layer 3: 独自登録・専用道（オレンジ実線）
road_type === 'exclusive'
'line-color': '#E65C00'  // CURATED_COLOR
'line-width': 4

// Layer 3: 独自登録・共用区間（オレンジ破線）
road_type === 'shared'
'line-color': '#E65C00'  // CURATED_COLOR
'line-width': 2
'line-dasharray': [4, 2]

// Layer 3: 路線名ラベル（minzoom 10、symbol-spacing 320）
text-color: '#5C2C00'
text-halo-color: 'rgba(255, 255, 255, 0.95)'
```

`large_scale` フラグは描画スタイルには影響せず、出典・ライセンス表示の判別と将来のフィルタリング用。

---

## 走行情報の計算方法

### 速度・方向
```typescript
// Web Geolocation API
navigator.geolocation.watchPosition(
  (pos) => {
    speed = pos.coords.speed;        // m/s → km/hに変換
    heading = pos.coords.heading;    // 度（北=0）
  },
  null,
  { enableHighAccuracy: true }
);
```

### 勾配
```
区間ごとに (標高差[m] / 水平距離[m]) × 100 = 勾配%
OpenTopoDataでルートの各座標に標高を付与して計算
```

### 消費カロリー
```
kcal = MET × 体重(kg) × 時間(h)
MET（平地） = 7.5
MET（勾配補正） = 7.5 × (1 + 勾配% × 0.1)
※ 体重・年齢はユーザー設定から取得
```

### 所要時間
```
Valhallaレスポンスの summary.time（秒）を使用
```

---

## GPXエクスポート仕様

```xml
<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Rindo">
  <trk>
    <name>走行ログ YYYY-MM-DD</name>
    <trkseg>
      <trkpt lat="43.0686" lon="141.3468">
        <ele>15.2</ele>
        <time>2026-05-01T09:00:00Z</time>
        <extensions>
          <speed>14.5</speed>
        </extensions>
      </trkpt>
    </trkseg>
  </trk>
</gpx>
```

---

## 駐車場検索（Overpass API）

```
// サイクリングロード起終点から半径2km以内の駐車場
[out:json][timeout:10];
(
  node["amenity"="parking"](around:2000, {lat}, {lon});
  way["amenity"="parking"](around:2000, {lat}, {lon});
);
out center;
```

---

## Web 版と iOS 版の役割分担

| 役割 | Web 版（このリポジトリ） | iOS 版（rindo-ios・将来開発） |
|---|---|---|
| 主用途 | **ルート計画・データ管理・履歴閲覧** | **実走行ナビゲーション・走行ログ記録** |
| ベースマップ表示 | ✅ | ✅ |
| サイクリングロード表示（Layer 1/2/3） | ✅ | ✅ |
| ルート検索（Valhalla） | ✅ | ✅（同 API 共有） |
| サイクリングロード CRUD | ✅ | — |
| QGIS データ補正パイプライン | ✅ | — |
| ルート保存・命名・編集 | ✅ | 取り込み専用 |
| 複数ウェイポイント対応 | ✅ | ✅ |
| 地点登録（自宅・職場・お気に入り） | ✅ | ✅ |
| 標高プロファイル（事前確認） | ✅ | ✅（横向きで全ルート確認） |
| GPX エクスポート（計画ルート） | ✅ | ✅ |
| 近隣施設表示（コンビニ・駐車場） | ✅ 計画用 | ✅ 走行中 |
| ライセンス・出典表示画面 | ✅ | ✅ |
| 天気予報 | ✅ 計画日 | ✅ 走行中 |
| ルート共有（短縮 URL） | ✅ | — |
| **リアルタイム走行情報**（速度・方向・経過時間） | — | ✅ iOS 専用 |
| **詳細ナビゲーション**（現在地 + 進行方向） | — | ✅ iOS 専用 |
| **簡易ナビゲーション**（矢印 + 距離） | — | ✅ iOS 専用 |
| **GPS 走行ログ記録** | — | ✅ iOS 専用 |
| **消費カロリー（実走行）** | — | ✅ iOS 専用 |
| **オフラインマップ** | — | ✅ iOS 専用 |
| **音声案内** | — | ✅ iOS 専用 |
| **休憩・補給リマインダー** | — | ✅ iOS 専用 |
| **Apple Watch 連携** | — | ✅ iOS 専用 |
| **緊急時機能（転倒検知 + SOS）** | — | ✅ iOS 専用 |
| **写真スポット記録** | — | ✅ iOS 専用 |
| **走行モード（通勤/レジャー/トレーニング）** | — | ✅ iOS 専用 |
| 走行履歴グラフ表示 | ✅ iOS から受信した走行ログを集計 | — |
| 走行ログのクラウドアップロード | — | ✅ iOS 専用 |

## データ受け渡し（Web ⇄ iOS）

**方式: シングルユーザー・セッショントークン**

個人利用・Tailnet 内限定運用のためマルチユーザー認証は不採用。Apple Sign In や OAuth は使わず、Web/iOS の両クライアントは「ログイン」ボタン一発で seeded 単一ユーザー（`users.id = 1`）のセッショントークンを取得する。トークンはクライアント側で永続化し、以降の API 呼び出しに `Authorization: Bearer ...` で付加する。

- 認証エンドポイント: `POST /api/auth/login`（rindo-api）
- バックエンド: Bun + Hono + SQLite、自宅 M2 Mac mini + Tailscale serve（`https://home-mac-mini.taila6ea.ts.net`）
- データフロー:
  - Web で計画したルート → バックエンド保存 → iOS が取り込み
  - iOS で記録した走行ログ → バックエンドアップロード → Web で履歴閲覧（走行ログ用 `POST /api/rides` は未実装。iOS Phase 3 着手時に rindo-api 側で `rides` テーブル＋ハンドラを追加実装する）
- 公開運用（AppStore / 不特定多数）は計画にないため、Apple Sign In は実装しない。`users.apple_user_id` カラムは将来拡張用に残してあるが現状は `'local-user'` 固定値が入っているのみ

## 実装優先順位（Web 版）

### Phase 1（MVP）✅ 完了

1. MapLibre で OSM 標準タイル表示（当初 CyclOSM だったが zoom 17+ で配信不安定のため 2026-05-02 切替）
2. Layer 3 GeoJSON の地図表示（QGIS デジタイズ + Valhalla map matching 補正）
3. Valhalla での bicycle ルーティング（道央圏）
4. 基本ナビゲーション（音声なし・地図表示のみ）

### Phase 2-A（バックエンド不要・フロントエンドのみで完結）✅ 完了

5. **Layer 1（OSM `highway=cycleway`）と Layer 2（OSM `route=bicycle` リレーション）の重ね表示**（静的 GeoJSON バンドル）
6. **複数ウェイポイント対応**
7. **勾配グラフ（OpenTopoData 連携・事前確認版）**
8. **近隣施設表示**（コンビニ、駐車場 — Overpass）
9. **GPX エクスポート（計画ルート）**
10. **ライセンス・出典表示画面**
11. **天気予報**（気象庁 API）

### Phase 2-B（バックエンド初期化と認証統合）

12. **Bun + Hono + SQLite バックエンド構築**（シングルユーザー・セッショントークン）
13. **ルート保存・命名・編集・削除**
14. **サイクリングロード CRUD UI**
15. **地点登録（自宅・職場・お気に入り）**
16. **ルート共有（短縮 URL）**

### Phase 2-C（クライアント側の機能拡充）

17. **ルート名ラベル**（複数箇所表示）
18. **路線クリックで詳細ポップアップ**（距離・標高・スパークライン・ルート取り込み）
19. **プロフィール登録 + 消費カロリー算出**（MET ベース）
20. **走行履歴グラフ**（月間距離・累積カロリー・頻出ルート — iOS データ受信後）

### iOS 版開発開始時に着手（Web 版にも影響あるもの）

- バックエンドの走行ログ受信エンドポイント仕様確定
- ルート取り込み URL スキーム or Universal Link 設計

---

## ライセンス・出典表示義務

| データ | ライセンス | 表示必要テキスト |
|--------|-----------|----------------|
| OSM 標準タイル | ODbL | © OpenStreetMap contributors |
| OSM `highway=cycleway`（Layer 1） | ODbL | © OpenStreetMap contributors |
| OSM `route=bicycle` リレーション（Layer 2） | ODbL | © OpenStreetMap contributors |
| 北海道大規模自転車道（Layer 3 内 `large_scale=true`） | CC-BY | 北海道建設部土木局提供 |
| さっぽろサイクリングマップ（Layer 3 内 `large_scale=false`） | 要確認 | 出典：札幌市建設局 |
| OpenTopoData / NASA SRTM 30m | ODbL / public domain | NASA SRTM 30m via OpenTopoData |
| Valhalla | BSD-3-Clause | Routing by Valhalla |
| 気象庁 API | — | 気象庁 |

---

## 既知の課題・制約

- さっぽろサイクリングマップのデジタイズデータは**数十m程度の位置誤差あり**。Valhalla `/trace_attributes` で OSM にスナップする map matching 処理は実装済み（`Rindo-web/scripts/match-cycling-roads.ts`）だが、QGIS での手動補正余地は残る
- Valhalla の bicycle プロファイルはサイクリングロード「優先」であり「限定」ではない。一般道への進入を完全に防ぐには API レイヤーでのポストフィルタリングが別途必要
- macOS 15 Sequoia + bun の既知問題（SIGKILL）あり。esbuild バイナリの `/opt/homebrew/bin/` 配置でワークアラウンド済みのプロジェクトを参考にすること
- iOS 版（Rindo for iOS）は将来対応予定。現時点は Web アプリのみ。Android は現時点で計画なし
- iOS の走行ログアップロード用 `POST /api/rides` は rindo-api 未実装。iOS Phase 3 着手時に `rides` テーブル＋ハンドラを rindo-api に追加する

---

## 参考リンク

- Valhalla 公式: https://github.com/valhalla/valhalla
- GeoFabrik 北海道: https://download.geofabrik.de/asia/japan/hokkaido.html
- OpenTopoData: https://www.opentopodata.org
- さっぽろサイクリングマップ: https://www.city.sapporo.jp/kensetsu/dokan/jitensha/cyclingmap.html
- 北海道大規模自転車道 OD: https://www.pref.hokkaido.lg.jp/kn/ddr/94728.html
- MapLibre GL JS: https://maplibre.org/maplibre-gl-js/docs/
- Stadia Maps（CyclOSM 復活時のホスト候補）: https://stadiamaps.com/

---

## ドキュメント更新履歴

### 2026-05-03 — 3 リポジトリ間の不整合解消・実装追従

`Rindo-web` / `Rindo-iOS` / `rindo-api` 間でドキュメントが乖離していたため、Web 実装と rindo-api 実装を正として全ドキュメント（本ファイル含む）を一斉更新。対象ファイル: 本ファイル、`Rindo-web/README.md`、`Rindo-iOS/README.md`、`Rindo-iOS/HANDOFF_rindo-ios.md`、`rindo-api/README.md`。

#### ① Layer 定義を Web 実装に追従

| | 旧仕様（マスター HANDOFF） | 新仕様（Web 実装） |
|---|---|---|
| Layer 1 | OSM `highway=cycleway` + `route=bicycle` リレーション（Overpass 実時間取得想定） | OSM `highway=cycleway` のみ（バンドル GeoJSON） |
| Layer 2 | 北海道大規模自転車道（北海道庁 CC-BY） | OSM `route=bicycle` リレーション（バンドル GeoJSON） |
| Layer 3 | 独自登録 DB（札幌市 13 路線のみ） | 独自登録 DB（札幌市 13 路線 + 北海道大規模自転車道、`large_scale` フラグで識別） |

→ 北海道大規模自転車道は `cycling_roads` テーブルに `large_scale=true` で取り込み済み。`/api/cycling-roads` で Layer 2/3 が同居する形に変更。

#### ② iOS の運用前提を明文化

- 個人使用専用、AppStore 公開予定なし
- Web/バックエンドは自宅 **M2 Mac mini** で稼働（旧表記「M1」は全削除）、iPhone から Tailscale 経由（`https://home-mac-mini.taila6ea.ts.net`）
- **Apple ID 認証は不採用**。シングルユーザー・セッショントークン方式（`POST /api/auth/login`）に統一

#### ③ 認証エンドポイントを実装に揃え

| 旧 iOS HANDOFF 記述 | 実装の真実 |
|---|---|
| `POST /api/auth/apple` | **存在しない**（削除） |
| `POST /api/auth/dev-login` | **存在しない**（削除） |
| — | `POST /api/auth/login`（公開）/ `POST /api/auth/logout`（公開）/ `GET /api/auth/me`（要認証） |

→ rindo-api/README.md からも Apple Sign In セットアップ手順（Apple Developer Portal の操作、`RINDO_APPLE_*` 環境変数、ngrok 等）を全削除。

#### ④ Layer 1/2 はバンドル GeoJSON 方式で確定

Web/iOS とも、ユーザーが変更できない固定コンテンツのためランタイムで Overpass を叩かず、`scripts/fetch-osm-*.ts` で事前生成した GeoJSON をビルド時にバンドルする方針に統一。

#### ⑤ デプロイ先を実態に修正

旧「Fly.io（東京リージョン nrt）」→ 新「自宅 M2 Mac mini + Tailscale serve」。Caddy リバースプロキシで `/api/valhalla/*` ・ `/api/elevation` ・ `/api/overpass` ・ `/api/weather/*` を直接プロキシ、`/api/auth/*` ・ `/api/routes/*` ・ `/api/locations/*` ・ `/api/cycling-roads` ・ `/api/profile` を rindo-api に振り分け。

#### ⑥ タイルレイヤーを実装に追従

旧 CyclOSM（zoom 17+ で `openstreetmap.fr` が応答せず）→ 2026-05-02 に **OSM 標準タイル**へ切替済み。CyclOSM 復活希望時は Stadia Maps の無料 API キーで対応可能と注記。「ダークモード非対応（CyclOSM 由来）」の制約は削除。

#### 副次的な整理

- `cycling_roads` テーブルのスキーマを実装に合わせ修正（`geometry` → `geometry_json`、`large_scale INTEGER` 列追加）
- rindo-api のスキーマ一覧を `001_init.sql` / `002_sessions.sql` / `003_user_profile.sql` の 3 マイグレーションで提示
- iOS の走行ログ用 `POST /api/rides` は **rindo-api 未実装** と明示。iOS Phase 3 着手時に `rides` テーブル＋ハンドラを新規追加する宿題として記録
