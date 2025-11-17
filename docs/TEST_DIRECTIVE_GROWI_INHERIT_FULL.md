# `#GROWI_INHERIT_FULL` 検証テストケース

## テストシナリオ

### 1. 基本的な継承 (親→子)

#### 親ページ: `/test/vivlio-directive/base`

```markdown
# ベーススタイル

\`\`\`vivliostylecss
@page {
  size: A4;
  margin: 20mm;
}

body {
  font-family: 'Noto Sans JP', sans-serif;
  color: #333;
}
\`\`\`
```

#### 子ページ: `/test/vivlio-directive/base/child`

```markdown
# 子ページ

\`\`\`vivliostylecss
/* #GROWI_INHERIT_FULL */

h1 {
  color: red;
}
\`\`\`
```

**期待結果**: 子ページに親のCSSが適用され、さらにh1が赤色になる

---

### 2. 多階層継承 (祖父→父→子)

#### 祖父: `/test/vivlio-directive/multi`

```markdown
\`\`\`vivliostylecss
body {
  font-size: 12pt;
}
\`\`\`
```

#### 父: `/test/vivlio-directive/multi/parent`

```markdown
\`\`\`vivliostylecss
/* #GROWI_INHERIT_FULL */

h1 {
  font-size: 24pt;
}
\`\`\`
```

#### 子: `/test/vivlio-directive/multi/parent/child`

```markdown
\`\`\`vivliostylecss
/* #GROWI_INHERIT_FULL */

h2 {
  font-size: 18pt;
}
\`\`\`
```

**期待結果**: 子ページに祖父と父のCSSが適用される

---

### 3. プロパティ上書き

#### 親: `/test/vivlio-directive/override`

```markdown
\`\`\`vivliostylecss
@page {
  margin: 20mm;
}

body {
  color: blue;
}
\`\`\`
```

#### 子: `/test/vivlio-directive/override/child`

```markdown
\`\`\`vivliostylecss
/* #GROWI_INHERIT_FULL */

body {
  color: red; /* 親の blue を上書き */
}
\`\`\`
```

**期待結果**: 子ページで color が red になる (CSS cascade)

---

### 4. 親ページが存在しない

#### 子: `/test/vivlio-directive/noparent`

```markdown
\`\`\`vivliostylecss
/* #GROWI_INHERIT_FULL */

body {
  color: green;
}
\`\`\`
```

**期待結果**: エラーなく、子のCSSのみ適用される (ディレクティブは空文字で置換)

---

### 5. 親にvivliostylecssブロックがない

#### 親: `/test/vivlio-directive/nocss`

```markdown
# 親ページ (CSSなし)

通常のマークダウン
```

#### 子: `/test/vivlio-directive/nocss/child`

```markdown
\`\`\`vivliostylecss
/* #GROWI_INHERIT_FULL */

body {
  color: purple;
}
\`\`\`
```

**期待結果**: エラーなく、子のCSSのみ適用される

---

### 6. ルートページでの使用

#### ルート: `/`

```markdown
\`\`\`vivliostylecss
/* #GROWI_INHERIT_FULL */

body {
  color: orange;
}
\`\`\`
```

**期待結果**: 親がないため、ディレクティブは空文字で置換され、子のCSSのみ適用

---

### 7. 複数のvivliostylecssブロック

#### 親: `/test/vivlio-directive/multi-blocks`

```markdown
\`\`\`vivliostylecss
body {
  margin: 0;
}
\`\`\`

通常のテキスト

\`\`\`vivliostylecss
h1 {
  color: blue;
}
\`\`\`
```

#### 子: `/test/vivlio-directive/multi-blocks/child`

```markdown
\`\`\`vivliostylecss
/* #GROWI_INHERIT_FULL */

h2 {
  color: green;
}
\`\`\`
```

**期待結果**: 親の両方のCSSブロックが統合されて継承される

---

### 8. ディレクティブと通常のコメント混在

#### 親: `/test/vivlio-directive/comments`

```markdown
\`\`\`vivliostylecss
/* 通常のコメント */
body {
  padding: 0;
}
\`\`\`
```

#### 子: `/test/vivlio-directive/comments/child`

```markdown
\`\`\`vivliostylecss
/* これは通常のコメント */
/* #GROWI_INHERIT_FULL */
/* さらにコメント */

h1 {
  margin: 0;
}
\`\`\`
```

**期待結果**: ディレクティブのみが置換され、他のコメントは保持される

---

## 検証手順

### 1. ページ作成
上記のテストケースに従ってGROWIページを作成する

### 2. プラグイン有効化
GROWIでVivliostyle Previewプラグインを有効化する

### 3. 動作確認
各子ページで以下を確認:
1. プレビュー表示が正常に動作するか
2. ブラウザコンソールでデバッグログを確認
3. DevToolsで適用されたCSSを確認
4. 期待通りのスタイルが適用されているか

### 4. デバッグログ確認

期待されるログパターン:

```
[VivlioDBG][growi] Detected context: { pagePath: '/test/vivlio-directive/base/child', ... }
[VivlioDBG][directive] Resolving #GROWI_INHERIT_FULL at path: /test/vivlio-directive/base/child
[VivlioDBG][parent] Loading parent: /test/vivlio-directive/base for: /test/vivlio-directive/base/child
[VivlioDBG][api] Fetching markdown for path: /test/vivlio-directive/base
[VivlioDBG][api] V3 API success: /test/vivlio-directive/base (123 chars)
[VivlioDBG][parent] Fetched parent markdown: 123 chars
[VivlioDBG][parent] Processed parent CSS: 45 chars
[VivlioDBG][directive] Parent CSS length: 45 chars
```

### 5. エラーケース確認

以下のエラーケースも確認:
- 親ページへのアクセス権限がない場合
- APIエンドポイントが無効な場合
- ネットワークエラーが発生した場合

---

## 期待される挙動まとめ

| シナリオ | ディレクティブ動作 | エラー発生 | 備考 |
|---------|-------------------|-----------|------|
| 通常の継承 | ✅ 親CSS挿入 | ❌ なし | 正常系 |
| 多階層 | ✅ 再帰的に継承 | ❌ なし | キャッシュ利用 |
| 親なし | ✅ 空文字で置換 | ❌ なし | エラーログあり |
| 親にCSSなし | ✅ 空文字で置換 | ❌ なし | 正常動作 |
| ルート | ✅ 空文字で置換 | ❌ なし | 親計算で終了 |
| API失敗 | ✅ 空文字で置換 | ❌ なし | Warnログあり |
| 循環参照 | ✅ visited で防止 | ❌ なし | Warnログあり |

---

## 自動テスト (将来実装)

### ユニットテスト

```typescript
describe('preprocessVivlioCss with #GROWI_INHERIT_FULL', () => {
  it('should replace directive with parent CSS', async () => {
    const markdown = '```vivliostylecss\n/* #GROWI_INHERIT_FULL */\nh1{color:red}\n```';
    const fetchMarkdown = jest.fn().mockResolvedValue('```vivliostylecss\nbody{margin:0}\n```');
    
    const result = await preprocessVivlioCss(markdown, {
      currentPath: '/child',
      fetchMarkdown,
    });
    
    expect(result.userCss).toContain('body{margin:0}');
    expect(result.userCss).toContain('h1{color:red}');
    expect(fetchMarkdown).toHaveBeenCalledWith('/', expect.anything());
  });

  it('should handle missing parent gracefully', async () => {
    const markdown = '```vivliostylecss\n/* #GROWI_INHERIT_FULL */\nh1{color:red}\n```';
    const fetchMarkdown = jest.fn().mockResolvedValue(null);
    
    const result = await preprocessVivlioCss(markdown, {
      currentPath: '/child',
      fetchMarkdown,
    });
    
    expect(result.userCss).toBe('h1{color:red}');
    expect(result.userCss).not.toContain('#GROWI_INHERIT_FULL');
  });

  it('should prevent circular references', async () => {
    // 実装済みの visited Set で防止されることを確認
  });
});
```

---

## チェックリスト

- [ ] テストページを作成
- [ ] 各シナリオで動作確認
- [ ] デバッグログを確認
- [ ] CSS適用を DevTools で確認
- [ ] エラーケースを確認
- [ ] パフォーマンスを確認 (複数回アクセス時のキャッシュ)
- [ ] ドキュメントを更新
- [ ] 既存機能への影響がないことを確認
