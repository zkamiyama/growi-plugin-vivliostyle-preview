GitHub Copilot

ポリシー
- 常に GitHub 上 (origin main) の内容を正とする。
- **tsx/css 等のソース変更後は必ず `npm run build` を実行し、生成された `dist/` ディレクトリもコミットに含めてから push しないと GROWI 上の動作は変わらない。**
- ローカル作業後は必ず pull/rebase で整合を確認してから push。
- *.md を現在は .gitignore で無視しているため、仕様や決定事項は追跡したい場合拡張子を .mdx などに変更するか ignore を調整する。
- Vivliostyle プレビューは紙面 (ページ) 幅で固定し、画面が狭い場合は横スクロール (縮小スケール禁止)。
- ページ幅推定: ユーザー CSS の @page size から取得。未指定時は A5 幅を既定。

メモ
- 縮小が発生した場合、iframe 親チェーンの flex 収縮 / max-width / transform / zoom を確認し、min-width と overflow-x:auto で防止。
- ビルド ID ログ: [vivlio:min] BUILD_ID で dist 反映を確認。

更新履歴
- 2025-09-03: 初版作成 (GitHub 正規化方針と固定レイアウト方針記載)# AGENTS: 自動化エージェント / 役割定義

目的: 本プロジェクトにおける“エージェント”(人/コンポーネント/自動タスク)の責務・インターフェース・KPI・失敗モードを明確化し、拡張時の一貫性/監視性を担保する。

> 設計方針: 各エージェントは *単一責務* + *明確な入出力契約* + *観測指標* を持ち、疎結合メッセージ (HTTP / postMessage / ファイル境界) でやり取りする。

---
## 0. 目次
1. 定義一覧 (RACI 風)
2. 個別仕様テンプレ (Contract)
3. エージェント詳細
4. シーケンスフロー
5. エラー/リカバリ戦略
6. 観測指標 (Metrics Map)
7. 拡張/差し替え戦略

---
## 1. エージェント一覧 (R: 実行, A: 責任, C: 相談, I: 共有)
| エージェントID | 名称 | 主責務 | R | A | C | I |
|----------------|------|--------|---|---|---|---|
| A_AUTHOR | 著者 (人) | コンテンツ執筆 | A_AUTHOR |  | A_PLUGIN_UI | A_MONITOR |
| A_PLUGIN_UI | プラグイン UI | エディタ拡張/入力収集/UI描画 | A_PLUGIN_UI | A_PLUGIN_UI | A_TRANSFORM | A_MONITOR |
| A_TRANSFORM | 変換パイプライン | Markdown→HTML 拡張変換 | A_TRANSFORM | A_PLUGIN_UI | A_BUILDER | A_MONITOR |
| A_PREVIEW_ORCH | プレビューオーケストレータ | 差分計算/Viewer 反映 | A_PREVIEW_ORCH | A_PLUGIN_UI | A_VIEWER | A_MONITOR |
| A_VIEWER | Vivliostyle Viewer | ページネーション表示 | A_VIEWER | (外部) | A_PREVIEW_ORCH | A_MONITOR |
| A_BUILDER | PDF ビルダー | Vivliostyle CLI 実行 | A_BUILDER | A_BUILDER | A_QUEUE, A_TRANSFORM | A_MONITOR |
| A_QUEUE | ビルドキュー | ジョブ調停/レート | A_QUEUE | A_BUILDER | A_TRIGGER | A_MONITOR |
| A_TRIGGER | 保存トリガ | GROWI保存→キュー投入 | A_TRIGGER | A_PLUGIN_UI | A_QUEUE | A_MONITOR |
| A_ASSETS | アセットマネージャ | CSS/フォント配信 | A_ASSETS | A_PLUGIN_UI | A_BUILDER | A_MONITOR |
| A_SECURITY | セキュリティ/ゲートキーパー | 認証/レート/公開制御 | A_SECURITY | A_SECURITY | A_PLUGIN_UI | 全体 |
| A_MONITOR | 監視/集計 | Metrics/Logs/Alerts 集約 | A_MONITOR | A_MONITOR | 全体 | 全体 |
| A_RELEASE | リリース管理 | バージョン/変更配布 | A_RELEASE | A_RELEASE | A_SECURITY | 全体 |

---
## 2. 契約テンプレ (Contract Template)
| 項目 | 説明 |
|------|------|
| Inputs | 外部から受け取るデータ/イベント/環境変数 |
| Outputs | 他エージェントへ渡す成果 (メッセージ, Artifact) |
| Triggers | 実行開始契機 (イベント名/ポーリング) |
| Side Effects | ファイル書込/ネットワーク/状態遷移 |
| Failure Modes | 想定エラー分類 (Validation, Network, Timeout, Capacity, Logic) |
| Retries/Backoff | リトライ方式 (指数/線形/なし) |
| Idempotency Key | 冪等性識別子 (ジョブID/ハッシュ) |
| Observability | ログフィールド/メトリク名/トレーススパン |
| KPIs | p95 時間/成功率/スループット 等 |
| Security | 認証/権限/入力検証/レート制限 |
| Config | 必須環境変数/設定キー |
| Extension Points | 将来差し替えや Hook 領域 |

---
## 3. エージェント詳細
### 3.1 A_PLUGIN_UI (プラグイン UI)
- Inputs: キー入力, GROWI ページ初期 Markdown, 設定 (テーマCSS, 章ルート)
- Outputs: 差分 Markdown, postMessage(HTML_PATCH), Telemetry(beacon JSON)
- Triggers: エディタ onChange / caretMove / 設定変更
- Failure Modes: DOM例外, 大量入力バースト
- Retries: 変換失敗→最新安定版へフォールバック
- Observability: log.event=preview_update, ms, size.delta_chars
- KPIs: preview_update_ms p95 <400
- Security: GROWI 権限チェックのみ (追加資格不要)

### 3.2 A_TRANSFORM (変換)
- Inputs: Markdown (全文/差分), 拡張設定 (ルビ/縦中横), 章メタ
- Outputs: HTML (normalized), AST キャッシュ
- Triggers: debounce 後 / ビルド要求 (フル再構築)
- Failure Modes: パースエラー
- Idempotency: content_hash

### 3.3 A_PREVIEW_ORCH
- Inputs: HTML 差分, Viewer 状態 (pageMap)
- Outputs: postMessage(UPDATE_DOM_SEGMENTS), metrics
- Failure Modes: Viewer 応答無 (timeout)
- Retries: 1回 + degrade (フル再ロード)

### 3.4 A_VIEWER
- Inputs: 初期 HTML, テーマCSS, フォント
- Outputs: ページ# マップ, レイアウト完了イベント
- KPIs: initial_layout_ms, reflow_ms

### 3.5 A_QUEUE
- Inputs: build_request(job_spec)
- Outputs: dequeued_job → A_BUILDER, 状態 (queued|running|done)
- Failure Modes: 容量超過, 重複
- Idempotency: job_key = (target_root, commit_hash)
- Policy: FIFO + coalesce (同 job_key は1件維持)

### 3.6 A_BUILDER
- Inputs: job_spec (target_root, theme_css_path, fonts_path)
- Actions: GROWI REST fetch → HTML 合成 → vivliostyle-cli → PDF attach
- Outputs: artifact_url, metrics(build_duration_s)
- Failure Modes: Fetch 404/timeout, CLI 失敗, OOM
- Retries: ネットワーク系指数 (max3) / CLI失敗は1回
- KPIs: build_success_rate ≥99%, build_duration_s p95 <120

### 3.7 A_TRIGGER
- Inputs: 保存イベント (GROWI内部 Hook / WebSocket)
- Outputs: build_request
- Rate Limit: 1 per user / 30s (burst 3)

### 3.8 A_ASSETS
- Inputs: theme.css / フォントファイル
- Outputs: 静的配信 (ETag, Cache-Control)
- KPI: asset_delivery_ms p95 <50 (内部NW)

### 3.9 A_SECURITY
- Inputs: 外部リクエスト, 認証情報, Funnel 設定
- Controls: Basic認証, Tailnet制限, レートヘッダ
- Outputs: 許可/拒否ログ

### 3.10 A_MONITOR
- Inputs: 各エージェント metrics/log events
- Outputs: ダッシュボード, アラート (閾値超過)
- KPIs: Metrics 完整率 (連続 5m で drop <1%)

### 3.11 A_RELEASE
- Inputs: git tags, CHANGELOG
- Outputs: plugin package (dist), builder image
- Policy: SemVer, 破壊変更は minor+ ドキュメント

---
## 4. 主要シーケンス
### 4.1 編集→プレビュー
1. A_AUTHOR 入力
2. A_PLUGIN_UI debounce→差分抽出
3. A_TRANSFORM 差分 HTML 生成 (AST キャッシュ更新)
4. A_PREVIEW_ORCH postMessage(HTML_PATCH) → A_VIEWER
5. A_VIEWER レイアウト完了→ページマップ返却
6. A_MONITOR 指標集計

### 4.2 保存→ビルド
1. GROWI 保存イベント → A_TRIGGER
2. A_TRIGGER rate-limit 通過で A_QUEUE.enqueue(job)
3. A_QUEUE dispatch → A_BUILDER
4. A_BUILDER fetch→合成→CLI→PDF 添付
5. 成功: artifact_url 更新 / 失敗: 再試行 or dead-letter
6. A_MONITOR 指標

### 4.3 スクロール同期
Editor caret move → A_PREVIEW_ORCH resolve anchor→page# → postMessage(scrollToPage) → A_VIEWER scroll/flash highlight

---
## 5. エラー/リカバリ戦略
| 障害種別 | 例 | 対応 |
|----------|----|------|
| Validation | ルビ構文不正 | マークアップを literal 表示 + 警告バナー |
| Network | REST timeout | 1,2,5s backoff リトライ後 degrade (最終成功版利用) |
| Capacity | キュー溢れ | oldest duplicate drop + アラート |
| Logic | 差分適用失敗 | フル再描画 fallback |
| Security | 認証失敗 | 401 ログ + レート記録 |
| OOM | CLI PDF 大型 | 章分割再試行 + 警告 |

Dead-letter: 連続失敗ジョブは `jobs/dead-letter/` に JSON 保存 + 通知。

---
## 6. 観測指標マッピング
| Metric | 収集元 | 型 | ラベル |
|--------|--------|----|-------|
| preview_initial_ms | A_PREVIEW_ORCH | histogram | doc_size_bucket |
| preview_update_ms | A_PREVIEW_ORCH | histogram | delta_chars_bucket |
| build_duration_s | A_BUILDER | histogram | pages_bucket |
| build_success_total | A_BUILDER | counter | status=(ok|fail) |
| queue_depth | A_QUEUE | gauge |  |
| queue_wait_s | A_QUEUE | histogram |  |
| transform_parse_ms | A_TRANSFORM | histogram |  |
| viewer_relayout_ms | A_VIEWER | histogram | pages_affected |
| asset_delivery_ms | A_ASSETS | histogram | type=(css|font) |
| error_total | 全体 | counter | agent, type |
| memory_rss_mb | Builder/Plugin | gauge | agent |

アラート閾値 (初期):
- build_success_rate < 97% (5m) で Warn / < 90% (15m) Critical
- preview_update_ms p95 > 800 連続 5m
- queue_depth > 5 連続 10m

---
## 7. 拡張/差し替え戦略
| 項目 | 現行 | 差し替え例 |
|------|------|-----------|
| Transform | remark/markdown-it | WASM パーサ / AST サービス化 |
| Queue | インメモリ | Redis / BullMQ |
| Builder | 単一プロセス | 並列ワーカー / Serverless trigger |
| Viewer | Vivliostyle | (将来) 別 CSS 組版エンジン A/B |
| Security | Basic + Tailnet | OIDC 統合 / JWT claims based |
| Metrics | prom-client | OpenTelemetry Collector |
| Visual Diff | Playwright screenshot | DOM sematic diff + OCR |

---
## 8. 決定事項 (現時点)
- Coalesceキーは (target_root + latest_commit_hash)
- 差分適用は節点ID (見出し/段落) 単位
- 初期は Redis 不使用 (シンプル優先)
- プラグイン公開運用: すべての push (main への) 前に `pnpm --filter growi-plugin-vivliostyle-preview build` を実行し `plugin/dist/` を最新化 (dist コミット方針)。将来 CI 導入で tag 時のみ dist 更新へ移行可。

### 8.1 プレビュー用 build+push 標準手順 (B案: 手動ワンステップ運用)

目的: GROWI 側が GitHub 上の最新ビルド済み `plugin-publish/dist/client-entry.js` を常に取得できるよう、人手オペでも再現性ある手順を固定化。

手順 (作業ディレクトリ: リポジトリ root):
1. 変更を作成 / 保存
2. BUILD_ID 自動付与 & ビルド: `pnpm --filter growi-plugin-vivliostyle-preview run build` または 全体 `pnpm build`
	- ※ build スクリプトは `plugin-publish/client-entry.tsx` 内の `export const BUILD_ID = 'LOCAL_PLACEHOLDER'` を置換してキャッシュバスト用 ID を埋め込む
3. 差分確認: `git diff --name-only`
4. 必要に応じて dist 生成物を含めステージ: `git add plugin-publish/client-entry.tsx plugin-publish/dist/client-entry.js plugin-publish/dist/assets/client-entry-*.js`
5. コミット: `git commit -m "feat: <要約> (BUILD_ID:<自動挿入ID>)"`
6. プッシュ: `git push origin main`
7. GROWI 管理画面またはブラウザでキャッシュクリア (Ctrl+Shift+R) → コンソールで `[vivlio:min] BUILD_ID` が更新されているか確認

補足:
- 白画面防止のため viewer スクリプトは base64 で iframe に埋め込み → about:srcdoc 内 SyntaxError を回避。
- 新しい viewer 反映が見えない場合: (a) Service Worker / CDN キャッシュ, (b) ブラウザキャッシュ, (c) 誤った dist パス参照 のいずれか。Network パネルで `client-entry.js` を開き `viewerB64` 文字列を含むか確認。
- ラピッドな反復時は (4)-(6) をまとめて `scripts/build-and-push.mjs` を利用 (今後の自動化拡張点)。

既知の落とし穴:
- Windows でワイルドカード add が失敗する場合は個別パス指定。
- Git が差分を検出しない場合はコメントに日時を追記して再ビルドしハッシュ変更を誘発。

将来 CI 案:
- main push 時はテスト + lint のみ、`release/*` ブランチ / tag 時に dist 再生成 & GitHub Releaseへ添付。

---
## 9. 未決定 (要要件確定)
- 章識別方式 (front-matter vs h1 連番)
- 数式/脚注 記法サポート範囲
- PDF/X 対応を v1.0.0 に含めるか (現状 optional)

---
## 10. 参照
- Vivliostyle CLI / Viewer ドキュメント (機能境界)
- GROWI Plugin Dev ガイド (Script/Remark API)
- Prometheus Best Practices (metrics 命名)

---
## 11. ローカル変更 → GROWI 反映フロー (何度も忘れがちな手順の固定化)

目的: 「コード直したのに GROWI 上で古い挙動/古いログのまま」という再発を防ぐ。

### 11.1 最低限フロー (手動運用期)
1. ソース変更 (`client-entry.tsx` など) を保存
2. `npm run build` 実行
	- 出力: `dist/assets/client-entry-<hash>.js` + `dist/client-entry.js` (postbuild コピー)
3. 生成物を必ず Git に含める: `git add src/... dist/... package.json`
4. キャッシュ強制更新が欲しい場合: `package.json` の `version` を patch++ しつつ `BUILD_ID`(日時/短ハッシュ) を埋め込む
5. `git commit -m "feat: ... (build: <hash>)"`
6. `git push origin main`
7. GROWI (本番/検証) が参照するブランチが更新されたらブラウザで Hard Reload
	- Chrome/Edge: DevTools 開き Network: Disable cache → Ctrl+F5
8. コンソールで `BUILD_ID` と `version` を確認し、新ハッシュが Network タブに出ていることを確認

### 11.2 うまく更新されない典型パターン & 対策
| 症状 | 原因 | 対策 |
|------|------|------|
| 新しいログが出ない | 古い `client-entry.js` がブラウザキャッシュ | Hard Reload / DevTools で Disable cache |
| ハッシュ付き JS が古い | `npm run build` 忘れ / dist 未コミット | ビルド→`git status` で dist 差分を確認 |
| 期待 CSS/縦書きが反映されない | iframe 内 viewer が旧バンドル | BUILD_ID を console で照合 |
| 何度リロードしても同じ | CDN/Reverse Proxy キャッシュ | URL に一時 `?v=<version>` を付与 or バージョンアップ |

### 11.3 ベストプラクティス (CI 導入前)
- 1 変更 1 build 1 commit (dist をまとめて後コミットしない)
- コミットメッセージに `build:` でハッシュ or BUILD_ID 記録
- `dist/.vite/manifest.json` もコミット (トレーサビリティ)
- 大きな変更前に `version` を上げておく (キャッシュ切替明示)

### 11.4 将来の自動化 TODO
- GitHub Actions: push(main) で build → dist アーティファクト commit or Release tag 時のみ dist 生成
- Viewer キャッシュバスティング: `<script src="...client-entry.js?rev=<git-short-sha>">` へ改修
- BUILD_ID を `process.env.GIT_SHA` から自動埋め込み

### 11.5 チェックリスト (貼り付け用)
```
[ ] 変更ソース保存
[ ] npm run build 完了 (新ハッシュ確認)
[ ] dist/client-entry.js 変更差分あり
[ ] version / BUILD_ID 更新 (必要時)
[ ] commit & push 済
[ ] GROWI で Hard Reload 実施
[ ] Console: BUILD_ID 確認
[ ] Network: 新ハッシュ asset 取得確認
```

### 11.6 時短: ワンアクション build + commit + push
毎回手順を忘れる/漏れる事故防止用に統合スクリプトを追加。

利用コマンド (ルートで実行):
```
pnpm build:push "feat: 縦書き余白調整"
```
内部処理順:
1. `plugin-publish/` が存在すればそこを対象 (無ければ `plugin/`)
2. `client-entry.ts(x)` の `BUILD_ID` を `YYYYMMDDHH` 形式で更新 (存在時)
3. `npm run build` 実行 (対象パッケージ内)
4. `dist/`, エントリソース等を `git add`
5. コミットメッセージに `(BUILD_ID:xxxx base:gitsha)` 付与
6. `git push origin main`

コミット差分が無い場合は commit をスキップ。
失敗時終了コード:
- 1: エントリファイル未発見
- 2: push 失敗

注意: version の自動 bump は行わない (SemVer 管理は手動)。必要なら先に `package.json` を編集してから実行。


---
更新: 2025-09-01 初版 / 2025-09-03 擬似A4実験は不要と判断し削除 (Vivliostyle 本来のページネーション結果のみ使用)。
