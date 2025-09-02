## Architecture (現行実装概要)

本プラグインは GROWI の Markdown Preview 生成パイプラインにフックし、Preview 用に生成される React コンポーネントを高階コンポーネント (HOC) `withVivliostyleTabs` でラップしてタブ (Markdown / Vivliostyle) UI を追加します。Vivliostyle タブ選択時に iframe 内へページ組版結果を表示します。

### 主なポイント
1. エントリ: `client-entry.tsx` (単一) – activate 時に `growiFacade.markdownRenderer.optionsGenerators` の `customGenerateViewOptions` / `customGeneratePreviewOptions` を差し替え。
2. 差し替え後、元のオプション生成関数を呼び出し、その戻り値 `options.components` 内でプレビューと思しきキー (名称に 'preview' を含む or 'div') を HOC でラップ。
3. HOC 内で既存 Markdown Preview と Vivliostyle iframe をタブ切替できる UI を提供。
4. Vivliostyle 変換: (将来) Markdown から抽出した HTML + fenced code block (vivlio-css / vivliostyle 等エイリアス) の CSS を iframe ドキュメントへ適用 (現状は土台実装にフォーカス)。
5. `pluginActivators[package.json.name] = { activate, deactivate }` を登録し GROWI 本体がロード後に実行可能。

### activate / deactivate ガード
`window.__VIVLIO_ACTIVE__` フラグで二重初期化を防止し、元の関数参照を `window.__VIVLIO_ORIGINALS__` に保存。`deactivate` で復元します。

### ビルド & 配信
Vite ライブラリモード (format: iife) で単一 `dist/growi-plugin-vivliostyle-preview-dev.js` を生成し、`package.json` の `main` として指し示します。React は外部依存による未ロード問題を避けるためバンドルへ同梱しています (external 指定を除去)。

### なぜ React 同梱に切り替えたか
GROWI 側が script プラグインに対して React のグローバル (`window.React`) を常に保証するとは限らず、外部化すると初期ロード失敗 (ReferenceError) が発生し得るため。まずは同梱して配信検証を安定化します。

### 将来的な最適化
ホストが React を提供することが明確になれば external に戻しバンドルサイズ削減が可能。`peerDependencies` 宣言 + ランタイム検査で対応予定。

### 既存ドキュメントとの差異
初期案 (非 React / DOM 直接操作) は廃止。現行は Preview コンポーネント差し替え型であり、旧 `src/entry.ts` / `viewerHost.ts` 等は存在しません。このファイルは現行構成を反映するよう更新されています。

### TODO (近接タスク)
- Vivliostyle iframe 実装 (HTML/CSS 生成 + viewer 初期化) 移植
- fenced code block 抽出ロジックのユーティリティ化
- PostMessage プロトコル定義 & 型付け
- 単体テスト (optionsGenerators 差し替えと復元の検証)
- README: インストール / GROWI への配置手順 (main フィールド追加に基づく)

### トラブルシュート (配信されない / 読み込まれない)
| 症状 | 想定原因 | 対処 |
|------|----------|------|
| バンドル未ロード | `package.json` に `main` が無い / dist 名不一致 | `main` 追加済み (本更新)・再 publish / 再インストール |
| ReferenceError: React | external 化によるホスト未提供 | React 同梱 (external 除去) |
| activate ログが出ない | script 自体未実行 | Network タブで JS 取得確認 / ファイル名と main 整合性確認 |
| 二重 wrap | 二重 activate | フラグ `__VIVLIO_ACTIVE__` 導入済み |
| 解除後も hook 継続 | deactivate 未復元 | `__VIVLIO_ORIGINALS__` から再設定 |

### ログプレフィックス
`[VIVLIO_DEV]` で統一し検索容易に。

---
このアーキテクチャは初期段階であり、Vivliostyle 部分は段階的に統合予定です。
```
