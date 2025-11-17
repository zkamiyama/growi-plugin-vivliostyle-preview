# `#GROWI_INHERIT_FULL` ディレクティブ仕様

## 概要

`#GROWI_INHERIT_FULL` は、`vivliostylecss` コードブロック内で使用できるプリプロセスディレクティブです。このディレクティブを使用すると、親ページの `vivliostylecss` コードブロックを自動的に継承できます。

## 使用方法

### 基本的な使い方

子ページのマークダウンで、以下のように記述します:

```markdown
# 子ページのタイトル

本文...

\`\`\`vivliostylecss
/* #GROWI_INHERIT_FULL */

/* 子ページ独自のスタイル */
@page {
  margin: 30mm;
}
\`\`\`
```

### 処理フロー

1. **ディレクティブ検出**: `#GROWI_INHERIT_FULL` を含むコメントを検出
2. **親ページ取得**: GROWI REST API (`/_api/v3/page` または `/_api/pages.get`) で親ページのマークダウンを取得
3. **CSS抽出**: 親ページのマークダウンから `vivliostylecss` コードブロックを抽出
4. **再帰処理**: 親ページにもディレクティブがある場合、さらに親をたどる
5. **CSS置換**: ディレクティブコメントを親のCSSで置換

## 対応ディレクティブ形式

以下の2つのコメント形式に対応しています:

### ブロックコメント
```css
/* #GROWI_INHERIT_FULL */
/* 親のスタイルを継承 #GROWI_INHERIT_FULL */
```

### 行コメント
```css
// #GROWI_INHERIT_FULL
// 親のスタイルを継承 #GROWI_INHERIT_FULL
```

## 実装例

### 親ページ (`/styles/base`)

```markdown
# ベーススタイル

\`\`\`vivliostylecss
@page {
  size: A4;
  margin: 20mm;
}

body {
  font-family: 'Noto Sans JP', sans-serif;
  line-height: 1.8;
}

h1 {
  color: #333;
  border-bottom: 2px solid #ddd;
}
\`\`\`
```

### 子ページ (`/styles/base/report`)

```markdown
# レポートスタイル

\`\`\`vivliostylecss
/* #GROWI_INHERIT_FULL */

/* レポート固有のスタイル */
@page {
  margin: 30mm; /* 親の margin を上書き */
}

h2 {
  color: #0066cc;
}
\`\`\`
```

### 処理結果

子ページで実際に適用されるCSS:

```css
@page {
  size: A4;
  margin: 20mm;
}

body {
  font-family: 'Noto Sans JP', sans-serif;
  line-height: 1.8;
}

h1 {
  color: #333;
  border-bottom: 2px solid #ddd;
}

/* レポート固有のスタイル */
@page {
  margin: 30mm; /* 親の margin を上書き */
}

h2 {
  color: #0066cc;
}
```

## 技術仕様

### パス解決アルゴリズム

1. **正規化**: ページパスから hash (`#`) と query (`?`) を除去
2. **basePath 処理**: GROWI の basePath を考慮
3. **親パス計算**: 最後の `/` より前の部分を親パスとする
   - `/a/b/c` → 親: `/a/b`
   - `/a/b` → 親: `/a`
   - `/a` → 親: `/` (ルート)
   - `/` → 親なし

### 安全機構

#### 循環参照防止
- `visited: Set<string>` で訪問済みパスを記録
- 同じパスを再度処理しようとした場合、空文字列を返す

#### キャッシュ
- `cache: Map<string, VivlioCssPreprocessResult>` でfetch結果をキャッシュ
- 同じ親ページへの重複アクセスを防止

#### エラーハンドリング
- API呼び出し失敗 → 空文字列を返す (エラーを伝播させない)
- 親ページが存在しない → 空文字列を返す
- ネットワークエラー → catch して null 処理

### デバッグログ

以下のデバッグログがブラウザコンソールに出力されます (開発時):

```
[VivlioDBG][growi] Detected context: { pagePath: '/a/b/c', basePath: '', origin: '...' }
[VivlioDBG][directive] Resolving #GROWI_INHERIT_FULL at path: /a/b/c
[VivlioDBG][parent] Loading parent: /a/b for: /a/b/c
[VivlioDBG][api] Fetching markdown for path: /a/b
[VivlioDBG][api] V3 API success: /a/b (1234 chars)
[VivlioDBG][parent] Fetched parent markdown: 1234 chars
[VivlioDBG][parent] Processed parent CSS: 567 chars
[VivlioDBG][directive] Parent CSS length: 567 chars
```

## API仕様

### GROWI REST API

#### V3 API (推奨)
```
GET /_api/v3/page?path={pagePath}&format=raw
```

レスポンス例:
```json
{
  "data": {
    "page": {
      "revision": {
        "body": "# Page content\n..."
      }
    }
  }
}
```

#### V1 API (フォールバック)
```
GET /_api/pages.get?path={pagePath}&format=raw
```

レスポンス例:
```json
{
  "page": {
    "revision": {
      "body": "# Page content\n..."
    }
  }
}
```

### 認証
- `credentials: 'same-origin'` で同一オリジンのCookie/セッションを使用
- CORS制約により、同じGROWIインスタンス内でのみ動作

## 制限事項

### 現在の実装
- **親ページのみ**: 子ページや兄弟ページは参照できない (循環参照リスク回避のため)
- **同一オリジン**: 別ドメインのGROWIページは参照不可 (CORS制約)
- **単一ディレクティブ**: 1つのコードブロック内に複数のディレクティブを記述可能だが、すべて同じ親CSSで置換される

### 将来の拡張可能性
- `#GROWI_INHERIT_PATH /specific/path`: 特定のパスを指定
- `#GROWI_INHERIT_PARTIAL section-name`: 親CSSの一部のみ継承
- `#GROWI_INHERIT_SIBLINGS`: 兄弟ページの統合

## トラブルシューティング

### ディレクティブが動作しない

1. **ブラウザコンソール確認**: デバッグログで問題箇所を特定
2. **APIエンドポイント確認**: GROWI APIが有効か確認
3. **パス確認**: 親ページが実際に存在するか確認
4. **認証確認**: ページアクセス権限があるか確認

### 期待したCSSが適用されない

1. **Hard Reload**: ブラウザキャッシュをクリア (Ctrl+Shift+R)
2. **BUILD_ID 確認**: コンソールで新しいビルドがロードされているか確認
3. **コメント形式確認**: `/* #GROWI_INHERIT_FULL */` の形式が正しいか確認

### パフォーマンス問題

- **キャッシュ利用**: 2回目以降のビルドはキャッシュされたAPIレスポンスを使用
- **深い階層**: 階層が深い場合、複数のAPI呼び出しが発生 (各階層は1回のみ)

## 関連ファイル

- `src/vfm/vivlioCssPreprocessor.ts`: ディレクティブ処理のコア実装
- `src/utils/growi.ts`: GROWI コンテキスト検出とAPI呼び出し
- `src/vfm/buildVfmHtml.ts`: VFM変換パイプライン統合
- `src/ui/hooks/useVivlioBuild.ts`: React hookでの利用

## 参考資料

- [GROWI REST API ドキュメント](https://docs.growi.org/api/)
- [Vivliostyle CSS仕様](https://vivliostyle.github.io/vivliostyle.js/docs/)
