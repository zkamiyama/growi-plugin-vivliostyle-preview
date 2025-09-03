# Vivliostyle Preview Plugin Architecture

## 概要

このプラグインは、GROWIのMarkdownエディタ画面にVivliostyleによるリアルタイムプレビュー機能を追加します。主な目的は、標準のMarkdownプレビューとVivliostyleプレビューをボタン一つでシームレスに切り替えることです。

## 基本方針

- **React中心の単一状態管理**: 状態（プレビューの開閉状態など）は全てReactの`AppContext`で一元管理します。DOMを直接操作するレガシーなコードは、Reactコンポーネントをマウントする起点としてのみ利用し、状態管理には関与させません。
- **疎結合なコンポーネント**: 各コンポーネント (`PreviewShell`, `VivliostyleFrame`など) は`useAppContext`フックを通じて状態とアクションを取得し、独立して動作できるようにします。
- **DOM操作の最小化**: `client-entry.tsx`の役割は、ReactアプリケーションのコンテナをDOMに挿入し、Reactのレンダリングを開始することに限定します。ボタンの挿入やイベント処理は、可能な限りReactの世界で行います。

---

## 実装アプローチ：コンテナ置換方式

現在の実装は、GROWIの標準プレビューコンテナ(`.page-editor-preview-container`)の**中身**を、Vivliostyleプレビュー用のコンテナ(`vivlio-preview-container`)と動的に入れ替える「コンテナ置換方式」を採用しています。これにより、レイアウトの崩れを防ぎ、安定した切り替えを実現します。

### Step 1: `client-entry.tsx` - Reactコンポーネントのマウント

`client-entry.tsx`の役割は、Reactアプリケーションをマウントする起点となるコンテナ要素を準備することに限定されます。

- **修正対象**: `client-entry.tsx`
- **作業内容**:
  1. GROWIのプレビュー領域がDOMに描画されるのを待ちます (`.page-editor-preview-container`)。
  2. プレビュー領域の**内部**に、Vivliostyleプレビューのためのホスト要素 (`<div id="vivlio-preview-container">`) を追加します。この時点では、ホスト要素は `display: none` で非表示になっています。
  3. `createRoot`を使い、このホスト要素にReactアプリケーション (`AppProvider`, `PreviewShell`, `ExternalToggle`) をマウントします。

```tsx:client-entry.tsx (現在の実装)
function mount() {
  const previewContainer = document.querySelector('.page-editor-preview-container');
  if (!previewContainer) {
    setTimeout(mount, 200); // リトライ
    return;
  }

  let host = document.getElementById(CONTAINER_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = CONTAINER_ID;
    host.style.display = 'none'; // 初期状態では非表示
    previewContainer.appendChild(host);
  }
  
  const root = createRoot(host);
  root.render(
    <React.StrictMode>
      <AppProvider>
        <PreviewShell />
        <ExternalToggle />
      </AppProvider>
    </React.StrictMode>
  );
}
```

### Step 2: `ExternalToggle.tsx` - 切り替えボタンの挿入

`ExternalToggle`コンポーネントは、GROWIのUIに自然に溶け込む形で切り替えボタンを配置します。

- **修正対象**: `src/ui/ExternalToggle.tsx`
- **作業内容**:
  1. `useEffect`フックと`MutationObserver`を使い、GROWIの編集ボタンが表示されるのを監視します。
  2. ボタンが見つかったら、その隣にReactの`createPortal`を使い、トグルボタンをレンダリングします。
  3. ボタンの`onClick`イベントでは、`useAppContext`から取得した`toggle`関数を呼び出し、プレビューの表示状態を切り替えます。

```tsx:src/ui/ExternalToggle.tsx (現在の実装)
// ...
export const ExternalToggle: React.FC = () => {
  const { toggle } = useAppContext();
  const [portalContainer, setPortalContainer] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    // ... MutationObserverでアンカー要素を探すロジック ...
  }, []);

  if (!portalContainer) return null;

  return createPortal(
    <button className="btn btn-outline-secondary btn-sm ml-2" type="button" onClick={toggle}>
      Vivliostyle
    </button>,
    portalContainer
  );
};
```

### Step 3: `PreviewShell.tsx` - プレビューの表示切り替え

`PreviewShell`は、プレビューの表示/非表示のロジックを担う中心的なコンポーネントです。

- **修正対象**: `src/ui/PreviewShell.tsx`
- **作業内容**:
  1. `useAppContext`から現在の表示状態`isOpen`を取得します。
  2. `isOpen`が`false`の場合、コンポーネントは`null`を返し、何もレンダリングしません。
  3. `isOpen`が`true`の場合、`VivliostyleFrame`コンポーネントをレンダリングします。
  4. `useEffect`フックを使い、`isOpen`の状態に応じて、**GROWIの標準プレビュー本体 (`.page-editor-preview-body`)** と **Vivliostyleプレビューコンテナ (`#vivlio-preview-container`)** の`display`スタイルを切り替えます。

```tsx:src/ui/PreviewShell.tsx (現在の実装)
const PreviewShell: React.FC = () => {
  const { isOpen, markdown, updateViewer } = useAppContext();

  React.useEffect(() => {
    const vivlioHost = document.getElementById('vivlio-preview-container');
    const originalPreviewBody = document.querySelector('.page-editor-preview-body') as HTMLElement | null;

    if (!vivlioHost || !originalPreviewBody) return;

    if (isOpen) {
      originalPreviewBody.style.display = 'none';
      vivlioHost.style.display = 'flex';
    } else {
      originalPreviewBody.style.display = 'block';
      vivlioHost.style.display = 'none';
    }

    return () => { // クリーンアップ
      originalPreviewBody.style.display = 'block';
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="vivlio-preview is-open">
      <VivliostyleFrame markdown={markdown} onUpdate={updateViewer} />
    </div>
  );
};
```

このアーキテクチャにより、Reactの状態(`isOpen`)が唯一の真実となり、DOMの表示状態は常にその状態に追従します。これにより、堅牢で予測可能なプレビュー切り替え機能が実現されています。

```


---

## 追加計画: 固定バージョンCDN Viewer + VFM パイプライン (+ `vivliocss` ユーザーCSS)

### 目的
1. Vivliostyle Viewer を **CDN から取得しつつ再現性と安全性を確保** する。
2. GROWI の Markdown を **VFM (@vivliostyle/vfm)** で解釈し、Vivliostyle 適合 HTML を生成。
3. デフォルトは **A5 サイズ** の最小 CSS。Markdown 内の ```vivliocss コードブロックをユーザーCSSとして後段に追加し上書き。
4. Viewer 読み込み失敗時は簡易エラーメッセージ表示（フェールファスト）。
5. 起動時に使用 Viewer バージョンを console に明示し Issue 再現性を確保。

### CDN 利用方針
- `latest` 禁止。固定バージョン (例: `2.34.1`) を URL に埋め込む。
- `<script>` / `<link>` へ **SRI (integrity + crossorigin="anonymous")** を付与。
- ロード失敗 (`onerror`) で iframe 内に簡単なエラーパネルを描画。
- 成功時: `console.info('[Vivliostyle] Viewer v2.34.1 loaded (CDN fixed)');` を出力。

#### SRI 取得例 (開発環境)
```
# 1. tarball 展開 or node_modules から対象ファイル取得
# 2. 例: viewer.js に対して
openssl dgst -sha384 -binary viewer.js | openssl base64 -A | sed 's/^/sha384-/'
```
得られた文字列を `<script>` / `<link>` の `integrity` にセット。

### VFM 変換パイプライン
入力: GROWI Markdown (拡張含む)

```
Raw Markdown
  └─(1) 前処理: GROWI 拡張 → VFM 互換 (例: 独自 admonition, ページブレークマーカー)
  └─(2) vivliocss 抽出: ```vivliocss ...``` を全収集 & 削除
  └─(3) VFM.render() → HTML(本文) + メタ
  └─(4) ラップ: DOCTYPE + <html> + <head> (基本 A5 CSS) + body(inner)
  └─(5) ユーザーCSS 挿入: 抽出 vivliocss を <style id="user-vivliocss"> として基本CSSの後に追加
  └─(6) postMessage { type:'update', html }
  └─(7) iframe (viewer host) が受信し DOM 差し替え → viewer レイアウト再計算
```

### `vivliocss` 抽出仕様
- フェンス: <code>```vivliocss</code> (lang=vivliocss)。info 文字列に他語が入る場合は最初のトークン一致で許可。
- 複数存在 → 結合（順序保持）。
- セキュリティ: 現状信頼前提。将来オプションで `allowUserCSS=false` を実装可能。

### 生成 HTML (骨子)
```
<!DOCTYPE html>
<html>
 <head>
  <meta charset="utf-8" />
  <title>Vivliostyle Preview</title>
  <style id="base-vivlio">
    @page { size: A5; margin: 12mm; }
    body { font-family: system-ui, sans-serif; line-height: 1.5; }
    h1 { page-break-before: always; }
    pre, code { font-family: ui-monospace, monospace; }
  </style>
  <style id="user-vivliocss"></style>
 </head>
 <body> ...VFM出力... </body>
</html>
```
`user-vivliocss` はレンダリング時に差し替え（空なら空のまま）。

### 主要追加/変更ファイル計画
| ファイル | 目的 | 変更内容 |
|----------|------|----------|
| `package.json` | 依存追加 | `@vivliostyle/vfm` を追加 |
| `src/conversion/vfmRenderer.ts` | VFM ラッパ | 前処理 + vivliocss 抽出 + HTML 包装関数 |
| `src/conversion/extractVivlioCss.ts` | 補助 | vivliocss フェンス検出 / 除去 |
| `src/ui/PreviewShell.tsx` | 変換切替 | markdown-it 呼出を vfmRenderer に差し替え (debounce)|
| `public/vivlio-host.html` | CDN 固定 | 固定バージョン script/link + SRI + ロード失敗処理 |
| `test/vfmRenderer.spec.ts` | 単体テスト | vivliocss 抽出 / A5 CSS 挿入 / 基本 heading 変換 |
| `ARCHITECTURE.md` | 文書 | (この節) |

### postMessage プロトコル拡張
```
Parent → Iframe: { type:'update', html:string, meta?: { cssUserBytes:number, hash:string } }
Iframe → Parent: { type:'ready' } / { type:'error', message }
```
`hash` は (オプション) HTML 本文 SHA-256（差分検出/冪等処理用）。初期段階は未使用でも可。

### エラーハンドリング方針
| レイヤ | 失敗例 | 対応 |
|--------|--------|------|
| VFM 解析 | Syntax 拡張不一致 | 前処理後に例外 catch → 旧 HTML 維持 + コンソール warn |
| Viewer CDN | ネットワーク/403 | iframe 内に簡易 `<div class="vivlio-error">` を挿入 |
| postMessage | サイズ過大 | 将来分割検討。現状は 2-3MB 以内想定で許容 |

### テストマトリクス (抜粋)
| ケース | 入力 | 期待 |
|--------|------|------|
| 基本変換 | `# Title` | `<h1>` 出力と A5 CSS 存在 |
| vivliocss 1件 | ```vivliocss body{color:red}``` | user-vivliocss に反映 / 本文にブロック残らない |
| vivliocss 複数 | 2個結合 | 順序保持で結合 |
| 非対応フェンス | ```mermaid ...``` | そのままコードブロックとして残る |
| 大きめ文書 | >200KB | エラー無 / 時間内 (パフォ計測) |
| CDN 失敗 | 強制 404 モック | エラーパネル表示 & console.error |

### 実装ステップ (順序)
1. 依存追加: `@vivliostyle/vfm`
2. `extractVivlioCss.ts` 実装
3. `vfmRenderer.ts` 実装 (前処理→抽出→VFM→包装)
4. `PreviewShell.tsx` のレンダリング経路差し替え (debounce 300ms)
5. `public/vivlio-host.html` を固定バージョン + SRI + onerror へ書換
6. console version log 追加
7. テスト追加 & 通過
8. 動作手動確認（短文 / 長文 / vivliocss 上書き）
9. ドキュメント更新 (完了済み)

### リスク & 緩和
| リスク | 緩和 |
|--------|------|
| VFM と GROWI 拡張差分 | 前処理レイヤを抽象化し追加マッピング容易化 |
| vivliocss に危険 CSS | 将来設定で allowlist / `@import` 禁止フィルタ |
| CDN バージョン更新忘れ | Renovate/Dependabot 監視 or 半期点検記述 |
| サイズ/パフォーマンス | 大文書で計測し必要なら Worker オフロード |

### 将来拡張フック
- オプション: ページサイズ (A4/A5/B5) 選択 UI → base CSS 再生成
- 目次自動生成: 見出し走査し `<nav role="doc-toc">` を prepend
- 差分更新: DOM 差し替えではなく部分更新 (後続最適化)

---

本計画に基づき、次コミットでコード差分を段階的に適用予定。
