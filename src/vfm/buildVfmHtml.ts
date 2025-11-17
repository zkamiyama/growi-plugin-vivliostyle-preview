import { stringify, readMetadata } from '@vivliostyle/vfm';
import { preprocessVivlioCss, preprocessVivlioCssSync, VivlioCssPreprocessOptions } from './vivlioCssPreprocessor';
import { extractVivlioConfig, resolveVivlioConfig, VivlioConfigInfo } from './vivlioConfigPreprocessor';

type VfmMetadata = ReturnType<typeof readMetadata>;

type PreparedMarkdown = {
  markdown: string;
  config: VivlioConfigInfo;
  metadata: VfmMetadata | null;
  derivedTitle: string | null;
};

const FRONTMATTER_REGEX = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)(?:\r?\n|$)/;

const TITLE_BLOCK_REGEX = /<header\b[^>]*class=(?:"|')[^"']*\btitle-block\b[^"']*(?:"|')[^>]*>([\s\S]*?)<\/header>/i;
const TITLE_BLOCK_TITLE_REGEX = /<h1\b[^>]*class=(?:"|')[^"']*\btitle\b[^"']*(?:"|')[^>]*>([\s\S]*?)<\/h1>/i;
const TITLE_BLOCK_AUTHOR_REGEX = /<p\b[^>]*class=(?:"|')[^"']*\bauthor\b[^"']*(?:"|')[^>]*>([\s\S]*?)<\/p>/i;

function stripHtmlTags(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function deriveTitleFromTitleBlock(markdown: string): string | null {
  if (!markdown) return null;
  const blockMatch = TITLE_BLOCK_REGEX.exec(markdown);
  if (!blockMatch) return null;
  const block = blockMatch[1] ?? '';
  const titleMatch = TITLE_BLOCK_TITLE_REGEX.exec(block);
  const rawTitle = titleMatch ? stripHtmlTags(titleMatch[1] ?? '') : '';
  if (!rawTitle) return null;
  const authorMatch = TITLE_BLOCK_AUTHOR_REGEX.exec(block);
  const rawAuthor = authorMatch ? stripHtmlTags(authorMatch[1] ?? '') : '';
  if (rawAuthor) return `${rawTitle}\u3000${rawAuthor}`;
  return rawTitle;
}

function getMetadataTitle(metadata: VfmMetadata | null): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const maybeTitle = (metadata as any).title;
  if (typeof maybeTitle !== 'string') return null;
  const trimmed = maybeTitle.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractFrontmatterMetadata(markdown: string): { markdown: string; metadata: VfmMetadata | null } {
  if (typeof markdown !== 'string') {
    return { markdown: '', metadata: null };
  }

  const match = FRONTMATTER_REGEX.exec(markdown);
  if (!match) return { markdown, metadata: null };

  let metadata: VfmMetadata | null = null;
  try {
    metadata = readMetadata(markdown);
  } catch (error) {
    return { markdown, metadata: null };
  }

  const body = markdown.slice(match[0].length);
  return { markdown: body, metadata };
}

function prepareMarkdownWithConfig(inputMarkdown: string): PreparedMarkdown {
  const source = inputMarkdown || '';
  const frontmatter = extractFrontmatterMetadata(source);
  const extraction = extractVivlioConfig(frontmatter.markdown || '');
  const config = resolveVivlioConfig(extraction.rawConfig);
  // Remove TOC-VivliostyleCSS blocks early so they never reach the HTML pipeline
  const cleanedMarkdown = extraction.markdown || '';
  const derivedTitle = deriveTitleFromTitleBlock(cleanedMarkdown);
  
  // Debug logging
  if (typeof console !== 'undefined' && console.debug) {
    console.debug('[VivlioDBG][prepareMarkdown] rawConfig extracted:', extraction.rawConfig ? 'YES' : 'NO');
    console.debug('[VivlioDBG][prepareMarkdown] config.source:', config.source);
  }
  
  return {
    markdown: cleanedMarkdown,
    config,
    metadata: frontmatter.metadata,
    derivedTitle,
  };
}

/**
 * VFM で Markdown → 完全HTML へ変換し、必要ならインラインCSSを <head> に注入。
 * 返すのは「完全HTML文字列」（<!doctype html> を含む）。
 *
 * 本実装では本文中の ```vivliostylecss``` コードブロックを抽出し、生成される HTML の
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
  /** 本文中の ```vivliostylecss``` ブロックを抽出して適用するか（デフォルト true） */
  parseVivlioUserCss?: boolean;
  vivlioCssOptions?: VivlioCssPreprocessOptions;
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

  // まず、入力 Markdown から vivliostylecss ブロックを抽出する（存在すれば userCss に蓄える）
  const prepared = prepareMarkdownWithConfig(inputMarkdown || '');
  let markdown = prepared.markdown || '';
  const metadata = prepared.metadata ?? undefined;
  const metadataTitle = getMetadataTitle(prepared.metadata);
  const effectiveTitle = metadataTitle || prepared.derivedTitle || title;
  let userCss = '';
  let resolvedCss_sync = '';
  if (parseVivlioUserCss && typeof markdown === 'string') {
    try {
      const vivlioOptions: VivlioCssPreprocessOptions = { parseVivlioUserCss, ...(options?.vivlioCssOptions ?? {}) };
      const result = preprocessVivlioCssSync(markdown, vivlioOptions);
      markdown = result.markdown;
      // userCss shown to the user should be the raw (pre-directive) CSS
      userCss = result.rawUserCss ?? result.userCss;
      // resolved CSS (post-directive expansion) that will be injected into HTML
      resolvedCss_sync = result.userCss || '';
    } catch (e) {
      userCss = '';
    }
  }

  // 1) VFM → 完全HTML
  // For the synchronous path we avoid importing plugins (keeps API stable).
  // The async/worker path will perform remark-breaks if requested via flag.
  const metadataForStringify: any = metadata ? { ...metadata } : {};
  if (effectiveTitle && !metadataForStringify.title) metadataForStringify.title = effectiveTitle;
  const html = stringify(
    markdown,
    { title: effectiveTitle, language, style: styleUrls, math: enableMath } as any,
    metadataForStringify,
  );

  // 2) CSS を組み立てる: userCss -> inlineCss (baseCss removed)
  let finalCss = '';
  // finalCss should use resolved (post-directive) CSS if available
  if (resolvedCss_sync) {
    finalCss += '\n' + sanitizeCss(resolvedCss_sync);
  } else if (userCss) {
    finalCss += '\n' + sanitizeCss(userCss);
  }
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
  vivlioCssOptions?: VivlioCssPreprocessOptions;
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

  const prepared = prepareMarkdownWithConfig(inputMarkdown || '');
  let rawMarkdown = prepared.markdown || '';
  const metadata = prepared.metadata ?? undefined;
  const metadataTitle = getMetadataTitle(prepared.metadata);
  const effectiveTitle = metadataTitle || prepared.derivedTitle || title;
  let userCss = '';
  if (parseVivlioUserCss && typeof rawMarkdown === 'string') {
    try {
      const vivlioOptions: VivlioCssPreprocessOptions = { parseVivlioUserCss, ...(options?.vivlioCssOptions ?? {}) };
      const result = preprocessVivlioCssSync(rawMarkdown, vivlioOptions);
      rawMarkdown = result.markdown;
      // keep raw user CSS for payload display
      userCss = result.rawUserCss ?? result.userCss;
    } catch (e) {
      userCss = '';
    }
  }

  // synchronous payload path: do not apply remark-breaks here (use async path)
  const metadataForStringify_sync: any = metadata ? { ...metadata } : {};
  if (effectiveTitle && !metadataForStringify_sync.title) metadataForStringify_sync.title = effectiveTitle;
  const html = stringify(
    rawMarkdown,
    { title: effectiveTitle, language, style: styleUrls, math: enableMath } as any,
    metadataForStringify_sync,
  );

  // finalCss must be the resolved CSS; if we stored raw in userCss, recompute resolved
  let resolvedCss = '';
  if (parseVivlioUserCss && typeof rawMarkdown === 'string') {
    try {
      const r = preprocessVivlioCssSync(prepared.markdown || '', { parseVivlioUserCss, ...(options?.vivlioCssOptions ?? {}) });
      resolvedCss = r.userCss;
    } catch (e) {
      resolvedCss = '';
    }
  }
  const finalCss = '' + (resolvedCss ? '\n' + resolvedCss : '') + (inlineCss ? '\n' + inlineCss : '');
  const withCss = injectInlineStyle(html, finalCss);
  const withScript = inlineScript ? injectInlineScript(withCss, inlineScript) : withCss;

  // スクリプトをpayloadに抽出（iframe構造に依存しない実行方式用）
  const inlineScripts = extractInlineScripts(withScript);
  
  // HTMLから<script>タグを削除したバージョンも生成（about:srcdocでの自動実行を防ぐ）
  const htmlForIframe = removeInlineScripts(withScript);

  return {
    rawMarkdown,
    userCss,
    finalCss,
    html: withScript,           // CLI/PDF用: スクリプト付き
    htmlForIframe,              // プラグインプレビュー用: スクリプト削除済み
    inlineScripts,
    config: prepared.config,
  };
}

// Async variants that run stringify in a worker thread using the vfm worker client.
// Note: `createVfmClient` is dynamically imported inside the async function to avoid
// evaluating `import.meta` at module-load time which breaks Jest environment transforms.

export async function buildVfmPayloadAsync(inputMarkdown: string, options?: {
  title?: string;
  language?: string;
  styleUrls?: string[];
  inlineCss?: string;
  enableMath?: boolean;
  inlineScript?: string;
  parseVivlioUserCss?: boolean;
  vivlioCssOptions?: VivlioCssPreprocessOptions;
}, client?: { stringify?: (md: string, opts?: any, metadata?: VfmMetadata | undefined) => Promise<string>; stringifyLatest?: (md: string, opts?: any, metadata?: VfmMetadata | undefined) => Promise<string> }) {
  const {
    title = 'Preview',
    language = 'ja',
    styleUrls,
    inlineCss,
    enableMath = true,
    inlineScript,
    parseVivlioUserCss = true,
  } = options || {};

  const prepared = prepareMarkdownWithConfig(inputMarkdown || '');
  let rawMarkdown = prepared.markdown || '';
  const metadata = prepared.metadata ?? undefined;
  const metadataTitle = getMetadataTitle(prepared.metadata);
  const effectiveTitle = metadataTitle || prepared.derivedTitle || title;
  let userCss = '';
  let dependencies: string[] = [];
  let resolvedCss_async = '';
  if (parseVivlioUserCss && typeof rawMarkdown === 'string') {
    try {
      const vivlioOptions: VivlioCssPreprocessOptions = { parseVivlioUserCss, ...(options?.vivlioCssOptions ?? {}) };
      const result = await preprocessVivlioCss(rawMarkdown, vivlioOptions);
      rawMarkdown = result.markdown;
      // expose raw (pre-directive) CSS in payload.userCss
      userCss = result.rawUserCss ?? result.userCss;
      // keep resolved CSS for injection
      resolvedCss_async = result.userCss || '';
      dependencies = result.dependencies;
    } catch (e) {
      userCss = '';
      dependencies = [];
      resolvedCss_async = '';
    }
  }
  // When calling the worker, we cannot serialize plugin functions. Use a
  // simple boolean flag `enableBreaks` which the worker recognizes and will
  // dynamically import `remark-breaks` before calling stringify.
  const optionsForStringify: any = { title, language, style: styleUrls, math: enableMath, enableBreaks: true };
  optionsForStringify.title = effectiveTitle;
  let html: string;
  if (client) {
    const metadataForStringify_async: any = metadata ? { ...metadata } : {};
    if (effectiveTitle && !metadataForStringify_async.title) metadataForStringify_async.title = effectiveTitle;
    if (typeof client.stringifyLatest === 'function') {
      html = await client.stringifyLatest(rawMarkdown + '', optionsForStringify, metadataForStringify_async);
    } else if (typeof client.stringify === 'function') {
      html = await client.stringify(rawMarkdown + '', optionsForStringify, metadataForStringify_async);
    } else {
      // fallback to local client (dynamically import to avoid import.meta at module load)
      const { createVfmClient } = await import('../vfmWorkerClient');
      const local = createVfmClient();
      html = await local.stringify(rawMarkdown + '', optionsForStringify, metadataForStringify_async);
      local.terminate();
    }
  } else {
    const { createVfmClient } = await import('../vfmWorkerClient');
    const metadataForStringify_async: any = metadata ? { ...metadata } : {};
    if (effectiveTitle && !metadataForStringify_async.title) metadataForStringify_async.title = effectiveTitle;
    const local = createVfmClient();
    html = await local.stringify(rawMarkdown + '', optionsForStringify, metadataForStringify_async);
    local.terminate();
  }

  // Inject resolved CSS (post-directive) into HTML for accurate preview
  const finalCss = '' + (resolvedCss_async ? '\n' + resolvedCss_async : (userCss ? '\n' + userCss : '')) + (inlineCss ? '\n' + inlineCss : '');
  const withCss = injectInlineStyle(html, finalCss);
  const withScript = inlineScript ? injectInlineScript(withCss, inlineScript) : withCss;

  // スクリプトをpayloadに抽出（iframe構造に依存しない実行方式用）
  const inlineScripts = extractInlineScripts(withScript);
  
  // HTMLから<script>タグを削除したバージョンも生成（about:srcdocでの自動実行を防ぐ）
  const htmlForIframe = removeInlineScripts(withScript);

  return {
    rawMarkdown,
    userCss,
    finalCss,
    html: withScript,           // CLI/PDF用: スクリプト付き
    htmlForIframe,              // プラグインプレビュー用: スクリプト削除済み
    inlineScripts,
    dependencies,
    config: prepared.config,
  };
}

export async function buildVfmHtmlAsync(inputMarkdown: string, options?: {
  title?: string;
  language?: string;
  styleUrls?: string[];
  inlineCss?: string;
  enableMath?: boolean;
  inlineScript?: string;
  parseVivlioUserCss?: boolean;
  vivlioCssOptions?: VivlioCssPreprocessOptions;
}) : Promise<string> {
  const payload = await buildVfmPayloadAsync(inputMarkdown, options);
  return payload.html;
}

/** </head> の直前に <style> を挿入する */
export function injectInlineStyle(html: string, css: string): string {
  const tag = `<style>${css}</style>`;
  const idx = html.indexOf('</head>');
  if (idx === -1) {
    // head がない異常系：先頭に style を刺す
    return tag + html;
  }
  return html.slice(0, idx) + tag + html.slice(idx);
}

/** </body> の直前に <script> を挿入する */
export function injectInlineScript(html: string, script: string): string {
  // Blob URL内でも実行されるようtype="module"を付与
  const tag = `<script type="module">${script}</script>`;
  const idx = html.indexOf('</body>');
  if (idx === -1) {
    // body がない異常系：末尾に script を刺す
    return html + tag;
  }
  return html.slice(0, idx) + tag + html.slice(idx);

}

/** HTMLから<script type="module">を抽出してコード配列を返す（タグは削除） */
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

/** HTMLから<script type="module">タグを削除する（抽出後に使用） */
export function removeInlineScripts(html: string): string {
  const scriptRegex = /<script\s+type="module"[^>]*>[\s\S]*?<\/script>/gi;
  return html.replace(scriptRegex, '');
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

