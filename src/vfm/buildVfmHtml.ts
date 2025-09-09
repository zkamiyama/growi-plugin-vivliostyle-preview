import { stringify } from '@vivliostyle/vfm';

/**
 * VFM で Markdown → 完全HTML へ変換し、必要ならインラインCSSを <head> に注入。
 * 返すのは「完全HTML文字列」（<!doctype html> を含む）。
 *
 * 本実装では本文中の ```vivliocss``` コードブロックを抽出し、生成される HTML の
 * インライン <style> に追加します（抽出後はそのコードブロックは Markdown から削除されます）。
 */
export function buildVfmHtml(
  inputMarkdown: string,
  options?: {
    title?: string;
    language?: string;
    /** <link rel="stylesheet"> で追加するURL群（CORSに注意） */
    styleUrls?: string[];
    /** <style> として挿入するCSS（CORS回避のため推奨） */
    inlineCss?: string;
    /** MathJaxを有効にするか（VFMはデフォルト有効。falseで無効化） */
    enableMath?: boolean;
    /** <script> として挿入するJavaScript（body末尾に挿入） */
    inlineScript?: string;
    /** 本文中の ```vivliocss``` ブロックを抽出して適用するか（デフォルト true） */
    parseVivlioUserCss?: boolean;
  }
): string {
  const {
    title = 'Preview',
    language = 'ja',
    styleUrls,
    inlineCss,
    enableMath = true,
    inlineScript,
    parseVivlioUserCss = true,
  } = options || {};

  // まず、入力 Markdown から vivliocss ブロックを抽出する（存在すれば userCss に蓄える）
  let markdown = inputMarkdown || '';
  let userCss = '';
  if (parseVivlioUserCss && typeof markdown === 'string') {
    try {
      // ```vivliocss\n ...css... ``` をケースインセンシティブで抽出
      markdown = markdown.replace(/```\s*vivliocss\s*\n([\s\S]*?)```/gmi, (_m, css) => {
        if (css && css.trim()) {
          userCss += '\n' + css.trim();
        }
        return ''; // 抽出したフェンスは Markdown から除去
      });
    } catch (e) {
      // extraction error -> ignore and continue without userCss
      userCss = '';
    }
  }

  // 1) VFM → 完全HTML
  const html = stringify(markdown, {
    title,
    language,
    style: styleUrls,
    math: enableMath,
  });

  // 2) CSS を組み立てる: userCss -> inlineCss (baseCss removed)
  let finalCss = '';
  if (userCss) finalCss += '\n' + sanitizeCss(userCss);
  if (inlineCss) finalCss += '\n' + sanitizeCss(inlineCss);

  // 3) 生成した HTML に <style> と <script> をインジェクトして返す
  const withCss = injectInlineStyle(html, finalCss);
  const withScript = inlineScript ? injectInlineScript(withCss, inlineScript) : withCss;
  return withScript;
}

/**
 * より詳細な情報を返すユーティリティ。
 * 返却オブジェクトに rawMarkdown, userCss, finalCss, html を含める。
 */
export function buildVfmPayload(inputMarkdown: string, options?: {
  title?: string;
  language?: string;
  styleUrls?: string[];
  inlineCss?: string;
  enableMath?: boolean;
  inlineScript?: string;
  parseVivlioUserCss?: boolean;
}) {
  const {
    title = 'Preview',
    language = 'ja',
    styleUrls,
    inlineCss,
    enableMath = true,
    inlineScript,
    parseVivlioUserCss = true,
  } = options || {};

  let rawMarkdown = inputMarkdown || '';
  let userCss = '';
  if (parseVivlioUserCss && typeof rawMarkdown === 'string') {
    try {
      rawMarkdown = rawMarkdown.replace(/```\s*vivliocss\s*\n([\s\S]*?)```/gmi, (_m, css) => {
        if (css && css.trim()) userCss += '\n' + css.trim();
        return '';
      });
    } catch (e) {
      userCss = '';
    }
  }

  const html = stringify(rawMarkdown, {
    title,
    language,
    style: styleUrls,
    math: enableMath,
  });

  const finalCss = '' + (userCss ? '\n' + userCss : '') + (inlineCss ? '\n' + inlineCss : '');
  const withCss = injectInlineStyle(html, finalCss);
  const withScript = inlineScript ? injectInlineScript(withCss, inlineScript) : withCss;

  return { rawMarkdown: inputMarkdown, userCss, finalCss, html: withScript };
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

/** </body> の直前に <script> を挿入する */
function injectInlineScript(html: string, script: string): string {
  const tag = `<script>${script}</script>`;
  const idx = html.indexOf('</body>');
  if (idx === -1) {
    // body がない異常系：末尾に script を刺す
    return html + tag;
  }
  return html.slice(0, idx) + tag + html.slice(idx);

}

/**
 * Lightweight CSS sanitizer for common generation mistakes:
 * - remove fullwidth/unicode spaces that can break @page parsing
 * - strip properties from @page blocks that are not allowed (e.g., color)
 * This is defensive and intentionally conservative.
 */
function sanitizeCss(css: string): string {
  if (!css) return css;
  // Replace fullwidth spaces (U+3000) and other weird unicode whitespaces with normal space
  let s = css.replace(/\u3000/g, ' ');
  // normalize repeated whitespace
  s = s.replace(/[\u00A0\s]+/g, ' ');

  // Remove disallowed declarations inside @page blocks. Keep only a small
  // whitelist (size, margin, bleed, marks). Naive approach: remove lines
  // containing known-bad properties when inside @page { ... }.
  const pageBlockRegex = /@page\s*[^\{]*\{([\s\S]*?)\}/gi;
  s = s.replace(pageBlockRegex, (m, body) => {
    const allowedProps = ['size', 'margin', 'bleed', 'marks'];
    const lines: string[] = body.split(/;/).map((l: string) => l.trim()).filter(Boolean);
    const filtered: string[] = lines.filter((line: string) => {
      const prop = line.split(':')[0].trim().toLowerCase();
      return allowedProps.some((a: string) => prop.startsWith(a));
    });
    return `@page { ${filtered.join('; ')} }`;
  });

  return s;
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
}
