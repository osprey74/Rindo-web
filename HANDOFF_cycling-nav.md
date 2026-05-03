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
- **フレームワーク**: React + TypeScript
- **地図ライブラリ**: MapLibre GL JS
- **タイルレイヤー**: CyclOSM（自転車特化レンダリング）
  - URL: `https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png`

### バックエンド
- **APIサーバー**: Bun + Hono
- **データベース**: SQLite（better-sqlite3）
- **デプロイ**: Fly.io（東京リージョン `nrt`）

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

### Layer 1: OSM / Overpass API
- `highway=cycleway` タグのウェイ
- `type=route`, `route=bicycle` のリレーション
- リアルタイム取得 or 定期キャッシュ
- ライセンス: ODbL（表示時に © OpenStreetMap contributors 必須）

### Layer 2: 北海道大規模自転車道（北海道庁）
- ライセンス: **CC-BY**（出所明示必須："北海道建設部土木局提供"）
- 入手先: https://www.pref.hokkaido.lg.jp/kn/ddr/94728.html
- 北海道オープンデータポータル: https://www.harp.lg.jp/opendata/

### Layer 3: 独自登録DB（SQLite）
- さっぽろサイクリングマップ（PDF）をQGISでデジタイズしたGeoJSON
  - 参照PDF: https://www.city.sapporo.jp/kensetsu/dokan/jitensha/cyclingmap.html
- 属性: `name`, `ward`, `road_type`（exclusive/shared）, `source`
- ⚠️ 市からのGISデータ公式提供はなし。PDFデジタイズデータのため誤差あり（数十m程度）

---

## DBスキーマ（SQLite）

### cycling_roads テーブル
```sql
CREATE TABLE cycling_roads (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  ward        TEXT,
  road_type   TEXT CHECK(road_type IN ('exclusive', 'shared')),
  geometry    TEXT NOT NULL,  -- GeoJSON LineString文字列
  source      TEXT,
  notes       TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);
```

### `road_type` の値
| 値 | 意味 |
|----|------|
| `exclusive` | 自転車歩行者専用区間 |
| `shared` | 一般道路利用区間 |

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

## APIエンドポイント設計（Bun + Hono）

```
GET  /api/cycling-roads              全サイクリングロード一覧
POST /api/cycling-roads              新規路線登録
PUT  /api/cycling-roads/:id          路線更新
DEL  /api/cycling-roads/:id          路線削除

POST /api/route                      Valhallaへのルート検索プロキシ
GET  /api/parking?lat=&lon=&r=       Overpass APIで駐車場検索
GET  /api/elevation?coords=          OpenTopoDataで標高取得
```

---

## 地図レイヤー表示仕様（MapLibre GL JS）

```typescript
// Layer 1: OSM由来（緑）
'line-color': '#1D9E75'
'line-width': 3

// Layer 2: 北海道大規模自転車道（青）
'line-color': '#3C7B91'
'line-width': 4

// Layer 3: 独自登録・専用道（オレンジ実線）
road_type === 'exclusive'
'line-color': '#E65C00'
'line-width': 4

// Layer 3: 独自登録・共用区間（オレンジ破線）
road_type === 'shared'
'line-color': '#E65C00'
'line-width': 2
'line-dasharray': [4, 2]
```

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
- バックエンド: Bun + Hono + SQLite、Mac mini @ 自宅 + Tailscale serve
- データフロー:
  - Web で計画したルート → バックエンド保存 → iOS が取り込み
  - iOS で記録した走行ログ → バックエンドアップロード → Web で履歴閲覧
- 公開運用（AppStore / 不特定多数）は計画にないため、Apple Sign In は実装しない。将来必要になった場合は Apple Sign In または OAuth プロバイダを別途追加する

## 実装優先順位（Web 版）

### Phase 1（MVP）✅ 完了

1. MapLibreでCyclOSMタイル表示
2. Layer 3 GeoJSONの地図表示（デジタイズ済みデータ → QGIS 補正済み）
3. Valhallaでの bicycle ルーティング（道央圏）
4. 基本ナビゲーション（音声なし・地図表示のみ）

### Phase 2-A（バックエンド不要・フロントエンドのみで完結）

5. **Layer 1（OSM Overpass）と Layer 2（北海道大規模自転車道）の重ね表示**
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
| OSM | ODbL | © OpenStreetMap contributors |
| CyclOSM タイル | ODbL | © CyclOSM, © OpenStreetMap contributors |
| 北海道大規模自転車道 | CC-BY | 北海道建設部土木局提供 |
| さっぽろサイクリングマップ（デジタイズ） | 要確認 | 出典：札幌市建設局 |

---

## 既知の課題・制約

- さっぽろサイクリングマップのデジタイズデータは**数十m程度の位置誤差あり**。将来的にOSMノードへのスナッピング処理（map matching）を検討
- Valhallaの bicycle プロファイルはサイクリングロード「優先」であり「限定」ではない。一般道への進入を完全に防ぐにはAPIレイヤーでのポストフィルタリングが別途必要
- macOS 15 Sequoia + bun の既知問題（SIGKILL）あり。esbuildバイナリの `/opt/homebrew/bin/` 配置でワークアラウンド済みのプロジェクトを参考にすること
- iOS版（Rindo for iOS）は将来対応予定。現時点はWebアプリのみ。Androidは現時点で計画なし
- ダークモードは対応しない（CyclOSM タイルが暗色背景に最適化されていないため）

---

## 参考リンク

- Valhalla公式: https://github.com/valhalla/valhalla
- CyclOSM: https://wiki.openstreetmap.org/wiki/CyclOSM
- GeoFabrik北海道: https://download.geofabrik.de/asia/japan/hokkaido.html
- OpenTopoData: https://www.opentopodata.org
- さっぽろサイクリングマップ: https://www.city.sapporo.jp/kensetsu/dokan/jitensha/cyclingmap.html
- 北海道大規模自転車道OD: https://www.pref.hokkaido.lg.jp/kn/ddr/94728.html
- MapLibre GL JS: https://maplibre.org/maplibre-gl-js/docs/
