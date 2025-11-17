# Attachment Resolution in Vivliostyle Config

## 概要

Vivliostyle config内で `[[attachment/ID]]` 形式のGROWI添付ファイルリンクを使用すると、自動的に実際のファイル名に解決され、ZIPアーカイブに含まれます。

## 対応するAPI

GROWI APIの以下のエンドポイントを使用して、attachment IDからファイル情報を取得します：

```
GET /_api/v3/attachment/:id
```

### レスポンス形式

```json
{
  "attachment": {
    "_id": "5e0734e072560e001761fa67",
    "originalName": "Snipaste_2025-09-06_02-26-21.jpg",
    "fileName": "601b7c59d43a042c0117e08dd37aad0aimage.txt",
    "fileFormat": "image/jpeg",
    "fileSize": 3494332,
    "filePathProxied": "/attachment/5e0734e072560e001761fa67",
    "downloadPathProxied": "/download/5e0734e072560e001761fa67"
  }
}
```

## 使用例

### Config内でのattachment指定

```javascript
module.exports = {
  size: 'A5',
  title: '本のタイトル',
  author: '著者名',
  
  entry: [
    '[[詩集/詩A]]',  // 通常のページリンク
    '[[詩集/詩B]]',
  ],
  
  // カバー画像をattachmentで指定
  cover: '[[attachment/68ed00c86ff7c9b2833fd474]]',
  
  copyAsset: {
    fileExtensions: ['html', 'css', 'png', 'jpg', 'jpeg', 'svg']
  },
};
```

### 処理フロー

1. **抽出**: Config内の全ての `[[attachment/ID]]` を検出
   - **重要**: `extractGrowiLinksFromConfig()` は `[[attachment/...]]` を**除外**してページリンクのみを抽出
   - `extractAttachmentIdsFromConfig()` がattachment専用で処理
2. **解決**: GROWI API経由で各attachment IDの実際のファイル名を取得
3. **取得**: `/attachment/:id` からファイルデータをfetch
4. **置換**: Config内の `[[attachment/ID]]` を実際のファイル名に置換
5. **ZIP化**: 画像ファイルをZIPアーカイブに追加

### 変換結果

元のconfig:
```javascript
cover: '[[attachment/68ed00c86ff7c9b2833fd474]]'
```

ZIPに含まれるconfig:
```javascript
cover: 'Snipaste_2025-09-06_02-26-21.jpg'
```

ZIPの内容:
```
vivliostyle.config.js
Snipaste_2025-09-06_02-26-21.jpg  <- 追加される
詩集_詩A.html
詩集_詩B.html
assets/...
metadata.json
```

## 実装詳細

### 新規追加関数

#### `extractGrowiLinksFromConfig(configValue: unknown): string[]`

Config内の全ての `[[...]]` 記法から**ページリンクのみ**を抽出します。

- **重要**: `[[attachment/...]]` は**除外**（画像ファイルなのでHTMLに変換しない）
- ネストしたオブジェクトや配列にも対応
- Attachment専用の処理は `extractAttachmentIdsFromConfig()` で行う

```typescript
// 正しい動作
const config = {
  entry: ['[[詩集/詩A]]', '[[詩集/詩B]]'],
  cover: '[[attachment/cover123]]',
};

extractGrowiLinksFromConfig(config);
// => ['詩集/詩A', '詩集/詩B']  ← attachmentは含まれない

extractAttachmentIdsFromConfig(config);
// => ['cover123']  ← attachmentのみ
```

#### `extractAttachmentIdsFromConfig(configValue: unknown): string[]`

Config内の全ての `[[attachment/ID]]` 記法からattachment IDを抽出します。

- ネストしたオブジェクトや配列にも対応
- 大文字小文字を区別しない (case-insensitive)

#### `fetchAttachmentMetadata(attachmentId, origin, apiToken?): Promise<{originalName, fileName} | null>`

GROWI APIからattachmentのメタデータを取得します。

- API token (オプション) でBearerトークン認証をサポート
- `originalName`: ユーザーがアップロードした元のファイル名
- `fileName`: GROWI内部での管理ファイル名

#### `replaceAttachmentLinksInConfig(configValue, attachmentMap): unknown`

Config内の全ての `[[attachment/ID]]` を実際のファイル名に置換します。

- 再帰的にネストしたオブジェクト・配列を処理
- `attachmentMap`: ID → filename のマッピング

### 統合ポイント

#### `configEntryProcessor.ts`

`processConfigWithGrowiLinks()` 関数内で：

1. ページリンク `[[...]]` の解決と並行して処理
2. Attachment IDを抽出
3. 各IDのメタデータとデータをfetch
4. Config内の `[[attachment/...]]` を置換
5. `buildZipWithPages()` でattachment画像をZIPに追加

#### `growi.ts`

`GrowiContext` インターフェースに `apiToken?: string | null` を追加：

```typescript
export interface GrowiContext {
  pagePath: string | null;
  basePath: string;
  origin: string;
  pageId: string | null;
  pageTitle: string | null;
  apiToken?: string | null;  // 追加
}
```

## よくある問題と解決策

### ❌ 問題: `cover` が `.html` に変換されてしまう

**症状**:
```javascript
// 元のconfig
cover: '[[attachment/68ed00c86ff7c9b2833fd474]]'

// CLIに渡される (誤)
cover: 'Book01_attachment_68ed00c86ff7c9b2833fd474.html'
```

**原因**: `extractGrowiLinksFromConfig()` が `[[attachment/...]]` もページリンクとして抽出していた

**解決**: v1.0.1以降では `extractGrowiLinksFromConfig()` 内で `attachment/` で始まるリンクを自動的に除外

```typescript
if (match[1].startsWith('attachment/')) {
  console.debug('[VivlioDBG][extractGrowiLinks] Skipping attachment link:', { path, link: match[1] });
  continue;
}
```

### ✅ 正しい動作 (v1.0.1以降)

```javascript
// 元のconfig
cover: '[[attachment/68ed00c86ff7c9b2833fd474]]'

// CLIに渡される (正)
cover: 'Snipaste_2025-09-06_02-26-21.jpg'
```

ZIPの内容:
```
vivliostyle.config.js
Snipaste_2025-09-06_02-26-21.jpg  <- 画像ファイル
詩集_詩A.html
詩集_詩B.html
```

## エラーハンドリング

- **API呼び出し失敗**: 404やネットワークエラーの場合は `null` を返却し、元の `[[attachment/ID]]` をそのまま維持
- **ファイルデータ取得失敗**: コンソール警告を出力し、ZIPへの追加をスキップ
- **置換失敗**: 解決できなかったattachmentは元の記法のまま残る

## テスト

`test/vfm/attachment-resolution.spec.ts` で以下のケースをカバー：

- ID抽出 (文字列、配列、ネストしたオブジェクト)
- メタデータ取得 (成功、404、ネットワークエラー)
- Config内での置換 (単一、複数、ネスト)
- API token認証

## 将来の拡張

- [ ] バッチ取得API (`POST /_api/v3/attachments/batch`) の実装
- [ ] キャッシュ機構 (同じattachmentを複数回fetchしない)
- [ ] プログレス通知 (大量のattachment処理時)
- [ ] attachment種類の検証 (画像のみ、PDFのみ、など)

## 参考

- [GROWI APIドキュメント](https://github.com/weseek/growi)
- [DeepWiki検索結果](https://deepwiki.com/search/growi-apiattachmentattachment_60cb0010-8cef-45a3-9290-c9b9efa4f5c4)
