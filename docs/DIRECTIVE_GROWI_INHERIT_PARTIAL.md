# `#GROWI_INHERIT_:root` / `#GROWI_INHERIT_@page` / `#GROWI_INHERIT_@font-face` ディレクティブ仕様

## 概要

`#GROWI_INHERIT_FULL` と同じく、`vivliostylecss` コードブロック内で使用できる継承ディレクティブです。  
新たに追加された 3 つのディレクティブは、親ページの Vivliostyle CSS から必要な部分だけを抜き出して展開できる **部分継承** に対応しています。

| ディレクティブ | 継承対象 | 主な用途 |
| --- | --- | --- |
| `#GROWI_INHERIT_:root` | 親CSS内の `:root` ルール。`@media` などに入れ子になっている場合もコンテナーごと抽出されます | CSSカスタムプロパティやテーマカラーの共有 |
| `#GROWI_INHERIT_@page` | 親CSS内の `@page` ルール | 印刷時のマージン・用紙サイズ設定を共有 |
| `#GROWI_INHERIT_@font-face` | 親CSS内の `@font-face` ルール | 共通フォント定義の共有 |

## 使い方

子ページの `vivliostylecss` コードブロックに、対象のディレクティブコメントを記述します。  
コメント形式は `#GROWI_INHERIT_FULL` と同様に `/* ... */` または `// ...` のどちらでも構いません。

```markdown
```vivliostylecss
/* #GROWI_INHERIT_:root */
/* #GROWI_INHERIT_@font-face */

body {
  font-family: 'Example', sans-serif;
}
```
```

上記の例では、親ページの `:root` と `@font-face` ルールだけが順番通りに差し込まれたうえで、その後に子ページ側の `body` 定義が続きます。

## 挙動のポイント

- `:root` ルールが `@media print { ... }` のようにネストされている場合でも、入れ子になったコンテナーごと展開します。
- 複数の部分継承ディレクティブを並べると、記述したコメントの順番で CSS に展開されます。
- `#GROWI_INHERIT_FULL` と組み合わせることも可能です。必要な部分だけを上書き・追加したい場合は、まず `FULL` で継承し、その後に部分継承ディレクティブを配置して上書きする構成が分かりやすくなります。
- 同一ページ内で部分継承ディレクティブを複数回使用した場合は、それぞれの位置で同じ内容が展開されます（キャッシュ済みの値を再利用するためパフォーマンスに影響はありません）。

## 既知の制限

- 親ページに `:root`／`@page`／`@font-face` が存在しない場合は空文字として展開され、コメントだけが除去されます。
- CSS 解析に PostCSS を使用しているため、極端に構文エラーの多い CSS からは意図した結果を得られない場合があります（その際はブラウザコンソールにワーニングが出力されます）。

## 関連ドキュメント

- [`#GROWI_INHERIT_FULL` ディレクティブ仕様](./DIRECTIVE_GROWI_INHERIT_FULL.md) – 全体継承する場合はこちらを参照
- [`TEST_DIRECTIVE_GROWI_INHERIT_FULL.md`](./TEST_DIRECTIVE_GROWI_INHERIT_FULL.md) – 既存ディレクティブのテストケース一覧
