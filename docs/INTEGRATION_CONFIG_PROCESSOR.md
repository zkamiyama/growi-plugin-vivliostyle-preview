# Config Entry Processor 統合ガイド

## BuildPdfDialog への統合

`BuildPdfDialog.tsx` で GROWI リンク `[[...]]` を含む config を自動処理する方法。

### 統合ポイント

`createSourceArchive()` を呼ぶ **前** に config を検査・処理します:

```typescript
// BuildPdfDialog.tsx の該当箇所 (line 314 付近)

const payload = await buildVfmPayloadAsync(
  sourceMarkdown,
  {
    vivlioCssOptions: {
      currentPath: effectiveContext.pagePath ?? null,
      basePath: effectiveContext.basePath,
      fetchMarkdown,
    },
  },
  client as any,
) as VivlioPayload;
setConfigPreview(payload.config);

// ===== ここに挿入 =====
// GROWI リンクを含む config を処理
const archive = await createArchiveWithConfigProcessing(
  payload,
  effectiveContext,
  pageInfoRef.current,
  attachmentFileName,
  downloadFileName,
  fetchMarkdown,
);
// ===== 挿入終わり =====

// 元の createSourceArchive() は条件分岐で使い分け
```

### 新しいヘルパー関数

`BuildPdfDialog.tsx` に追加する関数:

```typescript
import { 
  extractGrowiLinksFromConfig, 
  processConfigWithGrowiLinks 
} from '../../vfm/configEntryProcessor';

/**
 * Config 内に [[...]] リンクがあれば処理、なければ通常の ZIP 生成。
 */
async function createArchiveWithConfigProcessing(
  payload: VivlioPayload,
  context: GrowiContext,
  pageInfo: GrowiPageInfo | null,
  cacheFileName: string,
  downloadFileName: string,
  fetchMarkdown: (path: string) => Promise<string | null>,
): Promise<{ blob: Blob; configInfo: VivlioConfigInfo }> {
  const configInfo = payload.config;
  
  // Config が存在し、パース成功している場合のみ処理
  if (!configInfo || !configInfo.parsed || configInfo.parseError) {
    console.info('[VivlioDBG][BuildPdf] No valid config, using standard archive');
    return createSourceArchive(payload, context, pageInfo, cacheFileName, downloadFileName);
  }

  // GROWI リンクを検出
  const growiLinks = extractGrowiLinksFromConfig(configInfo.parsed);
  
  if (growiLinks.length === 0) {
    console.info('[VivlioDBG][BuildPdf] No GROWI links in config, using standard archive');
    return createSourceArchive(payload, context, pageInfo, cacheFileName, downloadFileName);
  }

  // GROWI リンクを処理
  console.info('[VivlioDBG][BuildPdf] Processing config with GROWI links:', growiLinks);
  
  try {
    const result = await processConfigWithGrowiLinks(
      configInfo,
      context,
      {
        fetchMarkdown,
        title: context.pageTitle ?? pageInfo?.title ?? undefined,
        language: 'ja',
        enableMath: true,
        vivlioCssOptions: {
          currentPath: context.pagePath ?? null,
          basePath: context.basePath,
          fetchMarkdown,
        },
      }
    );

    console.info('[VivlioDBG][BuildPdf] Config processing complete:', {
      entries: result.resolvedEntries.length,
      assets: result.totalAssets,
      assetBytes: result.totalAssetBytes,
      zipSize: result.zipBlob.size,
    });

    // 処理済み config と ZIP を返す
    return {
      blob: result.zipBlob,
      configInfo: result.processedConfig,
    };

  } catch (error) {
    console.error('[VivlioDBG][BuildPdf] Config processing failed, falling back to standard archive', error);
    // エラー時は通常の ZIP 生成にフォールバック
    return createSourceArchive(payload, context, pageInfo, cacheFileName, downloadFileName);
  }
}
```

### 完全な統合コード

```typescript
// ===== Import 追加 =====
import { 
  extractGrowiLinksFromConfig, 
  processConfigWithGrowiLinks 
} from '../../vfm/configEntryProcessor';

// ===== BuildPdfDialog コンポーネント内 (handleSubmit) =====

const payload = await buildVfmPayloadAsync(
  sourceMarkdown,
  {
    vivlioCssOptions: {
      currentPath: effectiveContext.pagePath ?? null,
      basePath: effectiveContext.basePath,
      fetchMarkdown,
    },
  },
  client as any,
) as VivlioPayload;
setConfigPreview(payload.config);

// Config に GROWI リンクがあれば自動処理
const archive = await createArchiveWithConfigProcessing(
  payload,
  effectiveContext,
  pageInfoRef.current,
  attachmentFileName,
  downloadFileName,
  fetchMarkdown,
);

setJobState((prev) => ({
  ...prev,
  stage: 'uploading',
  archiveSize: archive.blob.size,
}));

// 以降は変更なし
const submission = await submitArchive(
  archive.blob,
  effectiveContext,
  pageInfoRef.current,
  archive.configInfo,
  attachmentFileName,
);
```

## 動作フロー

### Case 1: GROWI リンクなし

```
Markdown → VFM → HTML → collectAttachments → ZIP
                                            ↓
                                    createSourceArchive()
```

### Case 2: GROWI リンクあり

```
Markdown → VFM → HTML
            ↓
       Config 解析
            ↓
    [[詩集/詩A]] 検出
            ↓
   /現在パス/詩集/詩A 解決
            ↓
    GROWI API で取得
            ↓
    VFM で HTML 化
            ↓
  collectAttachments (各ページ)
            ↓
    すべてを ZIP に同梱
            ↓
  processConfigWithGrowiLinks()
```

## ユーザー体験

### Before (従来)

```markdown
```vivliostyleconfigjs
module.exports = {
  entry: ['[[詩集/詩A]]'],
}
```

→ PDF 生成失敗: `doc.html` に `[[詩集/詩A]]` が残る
```

### After (新機能)

```markdown
```vivliostyleconfigjs
module.exports = {
  entry: ['[[詩集/詩A]]'],
}
```

→ 自動処理:
  1. `/現在パス/詩集/詩A` を取得
  2. HTML 化
  3. `pages/詩集_詩A.html` として ZIP に追加
  4. config を `entry: ['pages/詩集_詩A.html']` に書き換え
  5. Vivliostyle CLI で正常にビルド
```

## エラーハンドリング

### ページ取得失敗

```typescript
// resolvedEntries に記録
{
  original: '詩集/詩A',
  growiPath: '/技術/詩集/詩A',
  localPath: 'pages/詩集_詩A.html',
  markdown: null,
  html: null,
  error: 'Page not found: /技術/詩集/詩A'
}

// ZIP にはエラーページを含める
// metadata.json にも記録
```

### プロセス全体の失敗

```typescript
try {
  const result = await processConfigWithGrowiLinks(...);
} catch (error) {
  console.error('Config processing failed, falling back', error);
  // 通常の createSourceArchive() にフォールバック
  return createSourceArchive(payload, context, pageInfo, ...);
}
```

## テストケース

### Test 1: 相対パス解決

```javascript
// 現在ページ: /技術/日記
module.exports = {
  entry: ['[[詩集/詩A]]'],
}
// → /技術/詩集/詩A
```

### Test 2: 絶対パス

```javascript
module.exports = {
  entry: ['[[/詩集/詩A]]'],
}
// → /詩集/詩A
```

### Test 3: 複数エントリ

```javascript
module.exports = {
  entry: [
    '[[詩集/詩A]]',
    '[[詩集/詩B]]',
    '[[/技術/CSS]]',
  ],
}
// → 3ページすべて処理
```

### Test 4: ネストされたリンク

```javascript
module.exports = {
  entry: [
    { rel: 'contents', theme: '[[テーマ/詩]]' },
  ],
}
// → theme 内のリンクも処理
```

### Test 5: JSON config

```json
{
  "entry": ["[[詩集/詩A]]"],
  "toc": true
}
```

## パフォーマンス考慮

- **並列取得**: 複数ページは `Promise.all()` で並列処理可能 (今後の最適化)
- **キャッシュ**: `createGrowiMarkdownFetcher()` が自動キャッシュ
- **ZIP 圧縮**: DEFLATE level 6 (速度とサイズのバランス)

## 今後の拡張

- [ ] 循環参照の検出と警告
- [ ] プログレス通知 (ページ N/M 処理中)
- [ ] 並列フェッチの最適化
- [ ] カスタムファイル名パターン
- [ ] 相対パス解決の詳細制御
