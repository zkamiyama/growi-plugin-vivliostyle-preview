import { stringify } from '@vivliostyle/vfm';
import baseCss from './styles.css?raw';

/**
 * VFM で Markdown → 完全HTML へ変換し、必要ならインラインCSSを <head> に注入。
 * 返すのは「完全HTML文字列」（<!doctype html> を含む）。
 *
 * @param markdown 変換元のMarkdown
 * @param options  title / language / styleUrls / inlineCss を指定
 */
export function buildVfmHtml(markdown: string, options?: {
  title?: string;
  language?: string;
  /** <link rel="stylesheet"> で追加するURL群（CORSに注意） */
  styleUrls?: string[];
  /** <style> として挿入するCSS（CORS回避のため推奨） */
  inlineCss?: string;
  /** MathJaxを有効にするか（VFMはデフォルト有効。falseで無効化） */
  enableMath?: boolean;
}): string {
  const {
    title = 'Preview',
    language = 'ja',
    styleUrls,
    inlineCss = baseCss,
    enableMath = true,
  } = options || {};

  // 1) VFM → 完全HTML
  // stringify の主なオプション（style/title/language/partial）は npm のドキュメントを参照。
  // https://www.npmjs.com/package/@vivliostyle/vfm (code タブ例)
  const html = stringify(markdown, {
    title,
    language,
    style: styleUrls,
    // 数式制御：外部方針に合わせる（有効/無効）
    math: enableMath,
    // 完全HTMLを出す（partial: false）
  });

  // 2) インラインCSSを <head> に足す（CORSを避けるための推奨策）
  const withCss = inlineCss ? injectInlineStyle(html, inlineCss) : html;

  // 3) ブラウザ挿入前にサニタイズを推奨（HTML Sanitizer API）
  // ただし、ここでは文字列として Blob にするため、後段で DOM に挿入する際に sanitize する。
  return withCss;
}

/** </head> の直前に <style> を挿入する */
function injectInlineStyle(html: string, css: string): string {
  const tag = `<style>${css}</style>`;
  const idx = html.indexOf('</head>');
  if (idx === -1) {
    // head がない異常系：先頭に style を刺す
    return tag + html;
    }
  return html.slice(0, idx) + tag + html.slice(idx);
}

/**
 * 生成した完全HTMLを「安全に」Documentに反映したい場合のヘルパ（任意）。
 * HTML Sanitizer API を使う。ブラウザ対応は MDN を参照。
 * https://developer.mozilla.org/en-US/docs/Web/API/HTML_Sanitizer_API/Using_the_HTML_Sanitizer_API
 */
export function sanitizeIntoDocument(doc: Document, html: string): void {
  // デフォルトポリシーで安全な要素のみ残す
  // サニタイズは Blob->Renderer の経路では直接使わないが、将来の直挿入に備えて残す。
  // @ts-ignore: Sanitizer は型が未整備な場合あり
  const sanitizer = (window as any).Sanitizer ? new (window as any).Sanitizer() : null;
  if (!sanitizer) return;

  // 例：新規 Document に安全に挿入したい場合
  // doc.body.setHTML(html, { sanitizer }); // 互換の setHTML があればこちら
}
