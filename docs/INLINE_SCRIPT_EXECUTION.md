# インラインスクリプト実行機構

## 概要

ReactベースのVivliostyleビューワーでは、HTMLをBlob URLまたはdata URLに変換してVivliostyle Viewer APIに渡すため、`<script>`タグが自動実行されない問題がありました。Vivliostyle CLIでは通常のHTML読み込みなので動作しますが、Plugin環境では特別な対処が必要です。

## 問題の背景

### Vivliostyle CLIの動作
- HTMLファイルを直接読み込み
- `<script>`タグがブラウザによって自動実行される
- DOM操作が正常に動作

### Reactプラグインの問題
- `@vivliostyle/react`は`about:srcdoc`を使用してHTMLを注入
- iframe内でHTMLが読み込まれるが、**親ウィンドウと同一オリジン**
- HTMLに含まれる`<script>`タグが**親ウィンドウで実行される**危険性
- 結果：GROWIのUI全体が壊れる

## 解決策の設計

### アーキテクチャ

```
Markdown
  ↓
buildVfmPayload/Async
  ↓
├─ payload.html (スクリプト付き) ──→ CLI/PDF用
└─ payload.htmlForIframe (スクリプト削除済み) ──→ プラグインプレビュー用
  ↓
payload.inlineScripts[] (抽出されたスクリプトコード)
  ↓
VivlioViewerFrame.tsx (Renderer完了後)
  ↓
iframe内DOMに<script>タグを手動挿入
```

### 実装の流れ

#### 1. スクリプト抽出と分離 (`buildVfmHtml.ts`)

```typescript
// スクリプト抽出
export function extractInlineScripts(html: string): string[] {
  const scriptRegex = /<script\s+type="module"[^>]*>([\s\S]*?)<\/script>/gi;
  const scripts: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(html)) !== null) {
    const code = match[1]?.trim();
    if (code) scripts.push(code);
  }
  return scripts;
}

// スクリプト削除
export function removeInlineScripts(html: string): string {
  const scriptRegex = /<script\s+type="module"[^>]*>[\s\S]*?<\/script>/gi;
  return html.replace(scriptRegex, '');
}

// payload生成
export async function buildVfmPayloadAsync(...) {
  // ... HTML生成
  const withScript = inlineScript ? injectInlineScript(withCss, inlineScript) : withCss;
  
  // スクリプトを抽出
  const inlineScripts = extractInlineScripts(withScript);
  
  // 2つのバージョンを生成
  const htmlForIframe = removeInlineScripts(withScript);
  
  return {
    html: withScript,           // CLI/PDF用: スクリプト付き
    htmlForIframe,              // プラグイン用: スクリプト削除済み
    inlineScripts,              // 抽出されたコード配列
    // ...
  };
}
```

#### 2. iframe内での手動実行 (`useRendererLoadWithScripts.ts`)

```typescript
// Renderer完了後にスクリプトを注入
export function useRendererLoadWithScripts(...) {
  return useCallback((state) => {
    onRendererLoad(state);

    const scripts = payload?.inlineScripts;
    if (!scripts?.length) return;

    const shellIframe = iframeRef.current;
    const iframeDocument = shellIframe?.contentDocument || shellIframe?.contentWindow?.document;
    if (!iframeDocument) return;

    scripts.forEach((scriptCode, idx) => {
      const validation = validateInlineScript(scriptCode);
      if (!validation.allowed) {
        console.warn('[VivlioSecurity] Blocked inline script', { index: idx, reason: validation.reason });
        return;
      }

      const scriptElement = iframeDocument.createElement('script');
      scriptElement.type = 'module';
      scriptElement.textContent = scriptCode;
      (iframeDocument.body || iframeDocument.documentElement).appendChild(scriptElement);

      console.debug('[VivlioDBG] Script injected into iframe', {
        index: idx,
        total: scripts.length,
        iframeTitle: iframeDocument.title,
      });
    });
  }, [payload?.inlineScripts, iframeRef]);
}
```

#### 3. ビューワーへのHTML供給 (`useVivlioBuild.ts`)

```typescript
const applyPayload = (next: VivlioPayload) => {
  // プラグインプレビュー用にhtmlForIframe（スクリプト削除済み）を優先使用
  const htmlForViewer = next.htmlForIframe || next.html;
  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(htmlForViewer)}`;
  setSourceUrl(dataUrl);
};
```

## 用途別HTML使い分け

| 用途 | 使用HTML | スクリプト | 実行タイミング |
|------|----------|------------|----------------|
| **Vivliostyleプレビュー** | `htmlForIframe` | 削除済み | Renderer完了後に手動注入 |
| **Raw HTMLデバッグ** | `html` | 含む | ブラウザ自動実行 |
| **CLI出力** | `html` | 含む | ブラウザ自動実行 |
| **PDF生成** | `html` | 含む | CLI互換 |

## about:srcdoc の制約と限界

### 同一オリジン問題

`@vivliostyle/react`は`about:srcdoc`を使用するため、iframe内スクリプトは**親ウィンドウと同一オリジン扱い**になります。

**影響**:
- `console.log()` は親コンソールに出力される
- `self.parent` で親ウィンドウにアクセス可能
- CSPやSandbox属性が無効
- 完全な分離は**原理的に不可能**

**対策**:
- スクリプトはiframeドキュメントに直接 `type="module"` として挿入し、自然にiframe側の`document`/`window`を参照する。
- 挿入直前に `INLINE_SCRIPT_GUARD` で危険なAPI呼び出しを検査し、怪しいコードはブロックする。
- ユーザースクリプトは「iframe内DOMのみ操作する」前提。

### 将来の改善案

完全な分離を実現するには：
1. `@vivliostyle/react`をForkして`data:` URLまたは`blob:` URL（異なるオリジン）を使用
2. ユーザースクリプトを「安全なサブセット」に制限するサンドボックス機構を追加

### 最低限のセキュリティガード（2025-11-18追加）

- プラグインでJavaScriptを有効化した場合でも、以下の危険なAPI呼び出しを検知すると警告を出して実行をスキップします。
  - `parent.document` や `window.parent.document`
  - `parent.location` / `parent.history` / `top.location` など、親・最上位ウィンドウのナビゲーション操作
  - `parent.postMessage(...)` / `top.postMessage(...)`
  - `document.cookie` へのアクセス
  - `localStorage` / `sessionStorage`
- 目的: 組版向けのDOM操作は許容しつつ、親ウィンドウ操作やネットワーク送信といった典型的なXSSベクトルを即座に遮断する。
- ブロックされた場合はブラウザコンソールに `[VivlioSecurity] Blocked inline script` が表示されるので、必要であれば安全な別実装へ書き換えてください。

## ユーザースクリプトの書き方ガイド

### CLIとプラグイン両対応のスクリプト

```html
<script type="module">
  // デバッグログ（推奨）
  console.log('[UserScript] START', {
    'document.title': document.title,
    'isInIframe': window !== window.parent,
    'bodyChildren': document.body?.children.length,
  });
  
  // DOM操作
  const walker = document.createTreeWalker(
    document.body,  // rootを明示的に指定
    NodeFilter.SHOW_TEXT
  );
  
  let node;
  while (node = walker.nextNode()) {
    // テキスト処理
    if (/^(太郎|次郎)/.test(node.textContent?.trim() || '')) {
      // 親要素を操作
      const parent = node.parentElement;
      if (parent?.tagName === 'P') {
        parent.style.fontWeight = 'bold';
      }
    }
  }
  
  // スタイル注入
  const style = document.createElement('style');
  style.textContent = `
    /* カスタムスタイル */
  `;
  document.head.appendChild(style);
  
  console.log('[UserScript] COMPLETE');
</script>
```

### ベストプラクティス

#### ✅ 推奨
- `document.body` を明示的にrootとして使用
- `document.querySelector()`, `document.querySelectorAll()` で要素取得
- `console.log()` でデバッグログを出力（親コンソールに表示される）
- CLIでの動作確認を先に行う

#### ❌ 非推奨
- `document.documentElement` や `document.all` の全体走査
- グローバル変数の過度な使用
- `window.location` や `window.history` の操作
- 外部ライブラリのCDN読み込み（CORS制約あり）

## デバッグ方法

### 1. スクリプトが抽出されているか確認

```javascript
// ブラウザコンソールで確認
console.log('[VivlioDBG] Executing N inline scripts from payload');
console.log('[VivlioDBG] Script 1: tempVar=..., iframe.title=...');
```

### 2. 親での実行を検出

```javascript
// ユーザースクリプト内で確認
console.log('[UserScript] START', {
  'isInIframe': window !== window.parent,  // falseなら親で実行されている（問題）
  'document.title': document.title,
});
```

正常な場合：
- プラグイン: `isInIframe: true`, `document.title: 'Vivlio Preview'`
- CLI: `isInIframe: false`, `document.title: <ページタイトル>`

### 3. TreeWalkerの走査範囲を確認

```javascript
let totalTextNodes = 0;
const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
while (walker.nextNode()) totalTextNodes++;

console.log('[UserScript] TreeWalker complete', { totalTextNodes });
```

期待値：
- プラグイン（iframe内）: 10-50程度
- 親で誤実行: 500以上（GROWIのUI全体を走査）

### 4. Raw HTMLモードで確認

プレビュー画面の「HTML」ボタンをクリックすると、`<script>`タグ付きのHTMLソースが表示されます。CLI出力との整合性確認に使用できます。

## トラブルシューティング

### スクリプトが実行されない

**症状**: プラグインプレビューで何も起きない

**確認**:
1. `[VivlioDBG] Executing inline script` ログが出ているか
2. `[VivlioDBG] Script injected into iframe` ログが出ているか
3. `[UserScript] START` ログが出ているか

**対処**:
- ログがない → スクリプトが抽出されていない（`<script type="module">`を確認）
- Vivlioログまでは出る → ユーザースクリプト内のエラー（try-catchで捕捉）

### 親ウィンドウのUIが壊れる

**症状**: GROWIのボタンやメニューが消える、レイアウト崩れ

**確認**:
```javascript
console.log('[UserScript] START', {
  'isInIframe': window !== window.parent,
  'totalTextNodes': ...,
});
```

**原因**:
- `isInIframe: false` → 親で実行されている
- `totalTextNodes` が500以上 → 親DOMを走査している

**対処**:
1. ブラウザのHard Reload（Ctrl+Shift+R）
2. `htmlForIframe` が正しく使われているか確認
3. `removeInlineScripts()` が呼ばれているか確認

### CLIで動作するがプラグインで動作しない

**症状**: `vivliostyle build`では成功、プラグインプレビューでエラー

**確認**:
- `about:srcdoc`の制約（同一オリジン）
- `document`/`window`が正しくiframe内を指しているか

**対処**:
- デバッグログで`document.title`を確認
- `'Vivlio Preview'`ならiframe内、`'<ページ名> - GROWI'`なら親

## 関連ファイル

### コアファイル
- `src/vfm/buildVfmHtml.ts`: スクリプト抽出・削除、payload生成
- `src/ui/components/VivlioViewerFrame.tsx`: iframe内スクリプト実行
- `src/ui/hooks/useVivlioBuild.ts`: payload管理、HTML供給

### 型定義
- `src/ui/hooks/useVivlioBuild.ts`: `VivlioPayload` interface

### ドキュメント
- `docs/INLINE_SCRIPT_EXECUTION.md`: 本ドキュメント
- `AGENTS.md`: 開発ポリシーと参照情報

## 変更履歴

### 2025-01-13: 初期実装
- `type="module"` 追加でES Modules対応
- payload.inlineScripts方式を導入
- IIFE wrapper + 一時グローバル変数でiframe context渡し
- html/htmlForIframe分離でCLI/PDF互換性維持

### 2025-01-30: ネイティブESM注入
- iframeに直接 `type="module"` を挿入し、ラッパーを撤廃
- `INLINE_SCRIPT_GUARD` を強化し、危険API利用時は即ブロック
- Vivlioログを整理してトラブルシューティングを簡素化

### 制約の記録
- `about:srcdoc`使用により完全分離は不可能
- `console.log`は親コンソールに出力される
- ユーザースクリプト側で「iframe内DOM限定」を意識する必要あり
