(mirror note) このファイルは plugin-publish/AGENTS.md の開発用ミラーです。参照元を更新したらこちらも同期してください。

## 進行中/最近の知見差分（dev ミラー）

### 1. 白画面 / pages=0 対策
初期実装では iframe 内巨大インライン IIFE と viewerRaw 直接埋め込みが原因で about:srcdoc SyntaxError が sporadic に発生し viewer 初期化前に失敗 → `viewer.load` 未実行/空白。これを以下で解消:
- viewer コア JS を base64 → Blob script として注入
- 制御ロジック (メッセージ受信, progressive fallback, diag) も base64 Blob 分離 (control script)
- 診断ログ (#log) に render start / call viewer.load / viewer.load resolved / diag pages= を出力
- 1.5s 経過で pages=0 の場合 fallback HTML 復帰 (ユーザーは常に何か読める)

### 2. Progressive 表示
viewer ready 以前でも即座に Markdown→HTML 変換結果を fallbackHtml に表示し心理的待ち時間を低減。ready 後 fade out。

### 3. デフォルト @page 付与
ユーザー CSS 内に @page が無い場合 `@page { size: A4; margin: 20mm; } body{ font:12pt/1.5 serif; }` を先頭挿入し page layout 初期化不備回避。

### 4. Viewer ヘッダー衝突
Vivliostyle メニューバーが GROWI 上で本文に被るため `#vivliostyle-menu-bar{display:none}` を srcdoc に注入し viewport `top:0` を強制。今後オプション化可能。

### 5. 追加デバッグ導線
`__VIV_LAST_FULL_HTML__` (iframe.contentWindow) に直近送信 HTML を保持し DevTools から確認可能。

今後案:
- メニューバー復活トグル (設定)
- pages=0 継続時 viewer.document.body スナップショット抽出ボタン
- PDF 出力ボタン (CLI / viewer 経由) 試作

参照元 plugin-publish/AGENTS.md と統合する際は本節をマージしてください。
