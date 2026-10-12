# HANDOFF: Rindo エコシステムの停止状態と再起動手順

2026-10-12 に、Rindo エコシステム（iPhone アプリ Rindo のバックエンドと Web 版）を home Mac mini 上で一時停止した。
このドキュメントは、停止した構成要素と、次回再開するときの手順をまとめたもの。

## 停止した構成要素

| 構成要素 | 管理方法 | ポート | 停止方法 |
|---|---|---|---|
| Valhalla（Docker コンテナ `valhalla`、`--restart unless-stopped`） | Colima 上の Docker | 8002 | `brew services stop colima`（Colima VM ごと停止） |
| rindo-api（Bun + Hono + SQLite、`~/_dev/rindo-api`） | launchd `com.osprey74.rindo-api` | 3000 | `launchctl bootout` + `launchctl disable` |
| Caddy（`~/_dev/Caddyfile`、Rindo-web の配信と `/api/*` のリバースプロキシ） | launchd `com.osprey74.rindo-caddy` | 8080 | `launchctl bootout` + `launchctl disable` |

- plist ファイル（`~/Library/LaunchAgents/com.osprey74.rindo-api.plist` と `com.osprey74.rindo-caddy.plist`）は削除していない。
- `disable` してあるので、Mac mini を再起動しても自動では起動しない。

### 止めていないもの

- **Tailscale 本体**: claude-dashboard（`:8443` → `127.0.0.1:8790`）の公開に使っているため動かしたまま。
- **Tailscale serve の設定** `https://home-mac-mini.taila6ea.ts.net/` → `http://localhost:8080`: 残してある。停止中にアクセスすると 502 になる。再開時に設定し直す必要はない。
- watari（`:8787`）と claude-dashboard（`:8790`）: Rindo とは関係ない。

## 再起動手順

home Mac mini 上で実行する（リモートから操作する場合は `ssh so4330@home-mac-mini`）。

### 1. Valhalla（Colima）

```bash
brew services start colima
```

Colima が起動すると、`--restart unless-stopped` の設定により `valhalla` コンテナも自動で起動する。
タイルの読み込みに数十秒かかる。

```bash
colima status
docker ps --filter name=valhalla          # STATUS が Up であること
curl -s http://localhost:8002/status      # JSON が返れば OK
```

> `docker` が `/var/run/docker.sock` に接続しようとして失敗する場合は、`docker context use colima` を実行するか、
> `DOCKER_HOST=unix://$HOME/.colima/default/docker.sock` を指定する。

コンテナが存在しない場合は、[HANDOFF_cycling-nav.md](./HANDOFF_cycling-nav.md) の Valhalla セットアップ手順（`docker run -d --name valhalla ...`）で作り直す。

### 2. rindo-api と Caddy（launchd）

```bash
for l in com.osprey74.rindo-api com.osprey74.rindo-caddy; do
  launchctl enable gui/$(id -u)/$l
  launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/$l.plist
done
```

確認:

```bash
launchctl list | grep rindo                          # 2 件とも PID が付いていること
lsof -nP -iTCP -sTCP:LISTEN | grep -E ':3000|:8080'
curl -s http://localhost:3000/api/health             # rindo-api
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/   # 200 なら Web 版の配信 OK
```

ログの場所: `~/Library/Logs/Rindo/`（`rindo-api.{out,err}.log`、`caddy.{out,err}.log`）

### 3. 最終確認（Tailnet 経由）

```bash
tailscale serve status    # / → http://localhost:8080 が残っていること
```

- ブラウザで `https://home-mac-mini.taila6ea.ts.net/` を開き、ログインできること、地図上で 2 点をクリックしてルートが引けること（Valhalla まで疎通していること）を確認する。
- iPhone アプリ Rindo でもルート検索と保存ルートの読み込みを確認する。

`tailscale serve` の設定が消えていた場合は、次のコマンドで作り直す。

```bash
tailscale serve --bg --https=443 http://localhost:8080
```

### 4. 停止中に更新があった場合

Rindo-web と rindo-api に停止中の変更がある場合は、起動前に反映しておく。

```bash
cd ~/_dev/Rindo-web && git pull && npm run build     # Caddy が dist/ を配信する
cd ~/_dev/rindo-api && git pull && bun install       # 反映後に rindo-api を再起動
launchctl kickstart -k gui/$(id -u)/com.osprey74.rindo-api
```

## 既知の注意点

- 2026-10-12 15:26 に起動した Colima の VM が 16:56 頃に落ち、`colima start -f` のプロセスだけが残る状態になっていた（原因は未調査）。
  再開後に Valhalla が応答しなくなった場合は、まず `/opt/homebrew/var/log/colima.log` と `colima status` を確認する。
  回復しない場合は `brew services restart colima` を試す。

## 再度停止する場合

```bash
brew services stop colima
for l in com.osprey74.rindo-api com.osprey74.rindo-caddy; do
  launchctl bootout gui/$(id -u)/$l
  launchctl disable gui/$(id -u)/$l
done
```
