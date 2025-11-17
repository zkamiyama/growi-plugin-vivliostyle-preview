// Accept common variants used in markdown fences such as:
// ```vivliostyleconfig
// ```vivliostyle-config
// ```vivliostyleconfig.js
// ```vivliostyleconfig.json
// ```vivliostyleconfig.javascript
// ```vivliostyle-config.js
// ```vivliostyleconfigjs
// The pattern is case-insensitive when used with the `i` flag.
const CONFIG_BLOCK_REGEX =
  /(^|\r?\n)[ \t]*```[ \t]*vivliostyle(?:-?config)(?:\.?js|\.?json|\.?javascript)?[^\S\r\n]*\r?\n([\s\S]*?)(?:\r?\n)?[ \t]*```/gmi;

// NOTE: TOC-VivliostyleCSS feature removed. Previously we detected
// ```toc-vivliostylecss``` blocks and passed them to the backend as
// cliOptions.css. That functionality is no longer required and related
// helpers were removed.

/**
 * Matches GROWI internal link notation: [[ページ名]] or [[/絶対パス]]
 * Examples: [[詩集/詩A]], [[/技術/TypeScript]]
 */
const GROWI_LINK_PATTERN = '\\[\\[([^\\]]*)\\]\\]';
const GROWI_LINK_DETECT_REGEX = new RegExp(GROWI_LINK_PATTERN);

function createGrowiLinkRegex(): RegExp {
  return new RegExp(GROWI_LINK_PATTERN, 'g');
}

export type VivlioConfigSource = 'embedded' | 'generated';

export interface VivlioConfigExtractionResult {
  markdown: string;
  rawConfig: string | null;
}

export type VivlioConfigFormat = 'json' | 'js' | 'unknown';

export interface VivlioConfigInfo {
  source: VivlioConfigSource;
  raw: string;
  parsed: unknown | null;
  parseError: string | null;
  format: VivlioConfigFormat;
}

export interface ResolvedEntry {
  /** Original entry value (may contain [[...]] notation) */
  original: string;
  /** Resolved GROWI page path (absolute) */
  growiPath: string;
  /** Local file path in ZIP (e.g., 'pages/詩集_詩A.html') */
  localPath: string;
  /** Fetched Markdown content */
  markdown: string | null;
  /** HTML content (if conversion succeeded) */
  html: string | null;
  /** Any error that occurred during fetch/conversion */
  error: string | null;
}

const DEFAULT_CONFIG_OBJECT = {
  entry: ['doc.html'],
};

export const DEFAULT_CONFIG_STRING = JSON.stringify(DEFAULT_CONFIG_OBJECT, null, 2);

/**
 * Removes ```vivliostyleconfig``` code blocks from markdown and returns the first block's content.
 */
export function extractVivlioConfig(markdown: string): VivlioConfigExtractionResult {
  if (typeof markdown !== 'string' || markdown.length === 0) {
    return { markdown: typeof markdown === 'string' ? markdown : '', rawConfig: null };
  }

  let rawConfig: string | null = null;
  const cleaned = markdown.replace(
    CONFIG_BLOCK_REGEX,
    (_match: string, leading: string | undefined, code: string) => {
      if (rawConfig == null && typeof code === 'string') {
        const trimmed = code.trim();
        if (trimmed) rawConfig = trimmed;
      }
      return leading ?? '';
    },
  );

  return { markdown: cleaned, rawConfig };
}

/**
 * Extracts TOC-VivliostyleCSS code block content from markdown.
 * Returns the first TOC-VivliostyleCSS block found, or null if none exists.
 */
// extractTocCss removed

/**
 * Removes all ```toc-vivliostylecss``` code blocks from the given markdown.
 * Returns the cleaned markdown. Preserves the leading newline if present.
 */
// removeTocCssBlocks removed

/**
 * Normalises a config snippet (embedded or generated) into a consistent structure.
 */
export function resolveVivlioConfig(rawConfig: string | null): VivlioConfigInfo {
  if (rawConfig && rawConfig.trim()) {
    const trimmed = rawConfig.trim();
    const errors: string[] = [];
    let parsed: unknown;
    let ok = false;
    let format: VivlioConfigFormat = 'unknown';

    try {
      parsed = JSON.parse(trimmed);
      ok = true;
      format = 'json';
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }

    if (!ok) {
      const jsResult = tryParseVivlioConfigJs(trimmed);
      if (jsResult.ok) {
        parsed = jsResult.value;
        ok = true;
        format = 'js';
      } else if (jsResult.error) {
        errors.push(jsResult.error);
      }
    }

    if (ok) {
      return {
        source: 'embedded',
        raw: trimmed,
        parsed,
        parseError: null,
        format,
      };
    }

    return {
      source: 'embedded',
      raw: trimmed,
      parsed: null,
      parseError: errors.join(' | ') || 'Failed to parse vivliostyle config block',
      format,
    };
  }

  // Fallback: auto-generate minimal config pointing to doc.html
  return {
    source: 'generated',
    raw: DEFAULT_CONFIG_STRING,
    parsed: DEFAULT_CONFIG_OBJECT,
    parseError: null,
    format: 'json',
  };
}

type JsParseResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

function tryParseVivlioConfigJs(source: string): JsParseResult {
  if (!source) return { ok: false, error: 'Empty vivliostyle config block' };

  const normalized = normalizeVivlioConfigJsSource(source);
  const moduleRecord: { exports: unknown } = { exports: {} };
  const exportsRecord = moduleRecord.exports as Record<string, unknown>;
  const requireShim = (specifier?: unknown) => {
    const label = typeof specifier === 'string' ? ` "${specifier}"` : '';
    throw new Error(`require${label} is not supported in vivliostyleconfig code blocks`);
  };

  try {
    const executor = new Function(
      'module',
      'exports',
      'require',
      '"use strict";\n' + normalized + '\n'
    );
    executor(moduleRecord, exportsRecord, requireShim);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  const moduleResult = moduleRecord.exports;
  const exportsResult = exportsRecord;

  if (moduleResult !== exportsResult && typeof moduleResult !== 'undefined') {
    return { ok: true, value: moduleResult };
  }

  if (isRecord(exportsResult) && Object.prototype.hasOwnProperty.call(exportsResult, 'default')) {
    return { ok: true, value: (exportsResult as Record<string, unknown>).default };
  }

  if (isRecord(exportsResult) && Object.keys(exportsResult).length > 0) {
    return { ok: true, value: exportsResult };
  }

  return { ok: false, error: 'Vivlio config block evaluated but did not export a value' };
}

function normalizeVivlioConfigJsSource(source: string): string {
  if (!source) return source;
  return source.replace(/^\s*export\s+default\s+/gm, 'module.exports = ');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Detects if a string contains GROWI internal link notation [[...]].
 */
export function containsGrowiLink(value: string): boolean {
  if (typeof value !== 'string') return false;
  return GROWI_LINK_DETECT_REGEX.test(value);
}

/**
 * Resolves a GROWI link notation [[相対パス]] to an absolute page path.
 * If the link starts with '/', it's already absolute; otherwise, resolve relative to currentPagePath.
 * 
 * GROWI behavior: [[詩集/詩A]] from /A/Book1 resolves to /A/Book1/詩集/詩A (not /A/詩集/詩A)
 * 
 * @param linkNotation - The [[...]] notation (content inside brackets)
 * @param currentPagePath - Current page path (e.g., '/A/Book1')
 * @returns Absolute GROWI page path
 */
export function resolveGrowiLinkPath(linkNotation: string, currentPagePath: string | null): string {
  const trimmed = linkNotation.trim();
  
  // Already absolute
  if (trimmed.startsWith('/')) {
    return trimmed;
  }
  
  // Relative: resolve from current page path (not parent directory)
  if (!currentPagePath || currentPagePath === '/') {
    return '/' + trimmed;
  }
  
  // Remove trailing slash from current path
  const base = currentPagePath.replace(/\/$/, '');
  
  // Append relative path to current page path
  return base + '/' + trimmed;
}

/**
 * Extracts all GROWI link notations from a config value.
 * Handles strings, arrays, and nested objects.
 * 
 * **IMPORTANT**: Excludes [[attachment/...]] patterns - those are handled separately.
 * 
 * @param configValue - Parsed config object or value
 * @returns Array of detected [[...]] notations (content only, no brackets, excluding attachments)
 */
export function extractGrowiLinksFromConfig(configValue: unknown): string[] {
  const links: string[] = [];
  
  const visit = (value: unknown, path = '') => {
    if (typeof value === 'string') {
      const regex = createGrowiLinkRegex();
      const matches = value.matchAll(regex);
      for (const match of matches) {
        if (typeof match[1] === 'string' && match[1].length > 0) {
          // Skip attachment links - they are handled by extractAttachmentIdsFromConfig
          if (match[1].startsWith('attachment/')) {
            console.debug('[VivlioDBG][extractGrowiLinks] Skipping attachment link:', { path, link: match[1] });
            continue;
          }
          console.debug('[VivlioDBG][extractGrowiLinks] Found link in field:', { path, link: match[1], fullValue: value });
          links.push(match[1]);
        }
      }
    } else if (Array.isArray(value)) {
      value.forEach((item, idx) => visit(item, `${path}[${idx}]`));
    } else if (isRecord(value)) {
      Object.entries(value).forEach(([key, val]) => visit(val, path ? `${path}.${key}` : key));
    }
  };
  
  visit(configValue);
  console.debug('[VivlioDBG][extractGrowiLinks] Total links extracted:', links);
  return links;
}

/**
 * Generates a safe local filename from a GROWI page path.
 * Uses flat hierarchy (no subdirectories) so images can be referenced with relative paths.
 * 
 * Note: We do NOT URL-encode filenames here. Vivliostyle CLI's internal HTTP server
 * handles encoding automatically when resolving paths from vivliostyle.config.(json|js).
 * Pre-encoding would cause double-encoding (%E8 → %25E8).
 * 
 * Examples:
 * - '/詩集/詩A' -> '詩集_詩A.html' (Vivliostyle will access as %E8%A9%A9...)
 * - '/Book01/01_表紙' -> 'Book01_01_表紙.html' (Vivliostyle will access as ...%E8%A1%A8...)
 * 
 * @param growiPath - Absolute GROWI page path
 * @returns Safe local path (flat, no subdirectories, UTF-8 characters preserved)
 */
export function generateLocalPathFromGrowiPath(growiPath: string): string {
  const normalized = growiPath.startsWith('/') ? growiPath.slice(1) : growiPath;
  const safeName = normalized
    .replace(/\//g, '_')
    .replace(/[<>:"|?*\\]/g, '-')
    .trim() || 'page';
  
  return `${safeName}.html`;
}

/**
 * Replaces all [[...]] notations in a config string/object with resolved local paths.
 * 
 * @param configValue - Original config value (string, array, or object)
 * @param linkMap - Map from original [[...]] notation to local path
 * @returns New config value with links replaced
 */
export function replaceGrowiLinksInConfig(
  configValue: unknown,
  linkMap: Map<string, string>
): unknown {
  if (typeof configValue === 'string') {
    let result = configValue;
    linkMap.forEach((localPath, original) => {
      const pattern = `[[${original}]]`;
      result = result.replace(new RegExp(escapeRegExp(pattern), 'g'), localPath);
    });
    return result;
  }
  
  if (Array.isArray(configValue)) {
    return configValue.map(item => replaceGrowiLinksInConfig(item, linkMap));
  }
  
  if (isRecord(configValue)) {
    const result: Record<string, unknown> = {};
    Object.entries(configValue).forEach(([key, value]) => {
      result[key] = replaceGrowiLinksInConfig(value, linkMap);
    });
    return result;
  }

  return configValue;
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


/**
 * Matches GROWI attachment link notation: [[attachment/ID]]
 * ID can contain hex digits (case-insensitive) and alphanumeric characters
 */
const GROWI_ATTACHMENT_PATTERN = '\\[\\[attachment/([a-zA-Z0-9]+)\\]\\]';

function createGrowiAttachmentRegex(): RegExp {
  return new RegExp(GROWI_ATTACHMENT_PATTERN, 'gi');
}

/**
 * Extracts all [[attachment/ID]] notations from a config value.
 * 
 * @param configValue - Parsed config object or value
 * @returns Array of detected attachment IDs
 */
export function extractAttachmentIdsFromConfig(configValue: unknown): string[] {
  const ids: string[] = [];
  
  const visit = (value: unknown) => {
    if (typeof value === 'string') {
      const regex = createGrowiAttachmentRegex();
      const matches = value.matchAll(regex);
      for (const match of matches) {
        if (typeof match[1] === 'string' && match[1].length > 0) {
          ids.push(match[1]);
        }
      }
    } else if (Array.isArray(value)) {
      value.forEach(item => visit(item));
    } else if (isRecord(value)) {
      Object.values(value).forEach(val => visit(val));
    }
  };
  
  visit(configValue);
  return ids;
}

/**
 * Fetches attachment metadata from GROWI API.
 * 
 * @param attachmentId - Attachment ID
 * @param origin - GROWI origin URL
 * @param apiToken - Optional API token for authentication
 * @returns Attachment metadata including originalName
 */
export async function fetchAttachmentMetadata(
  attachmentId: string,
  origin: string,
  apiToken?: string | null,
): Promise<{ originalName: string; fileName: string } | null> {
  try {
    const url = `${origin}/_api/v3/attachment/${attachmentId}`;
    const headers: Record<string, string> = {};
    
    // Add authorization header if token is provided
    if (apiToken) {
      headers['Authorization'] = `Bearer ${apiToken}`;
    }
    
    const response = await fetch(url, { headers, credentials: 'same-origin' });
    
    if (!response.ok) {
      console.warn(`[VivlioDBG] Failed to fetch attachment metadata ${attachmentId}: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const attachment = data?.attachment;
    
    if (!attachment) {
      console.warn(`[VivlioDBG] Attachment ${attachmentId} has no data in response`);
      return null;
    }
    
    const originalName = attachment.originalName || attachment.fileName;
    const fileName = attachment.fileName;
    
    if (!originalName) {
      console.warn(`[VivlioDBG] Attachment ${attachmentId} has no filename`);
      return null;
    }
    
    return { originalName, fileName };
  } catch (error) {
    console.error(`[VivlioDBG] Error fetching attachment ${attachmentId}:`, error);
    return null;
  }
}

/**
 * Replaces all [[attachment/ID]] notations with their actual filenames.
 * 
 * @param configValue - Original config value
 * @param attachmentMap - Map from attachment ID to filename
 * @returns New config value with attachment links replaced
 */
export function replaceAttachmentLinksInConfig(
  configValue: unknown,
  attachmentMap: Map<string, string>,
): unknown {
  if (typeof configValue === 'string') {
    let result = configValue;
    attachmentMap.forEach((filename, id) => {
      const pattern = `[[attachment/${id}]]`;
      result = result.replace(new RegExp(escapeRegExp(pattern), 'gi'), filename);
    });
    return result;
  }
  
  if (Array.isArray(configValue)) {
    return configValue.map(item => replaceAttachmentLinksInConfig(item, attachmentMap));
  }
  
  if (isRecord(configValue)) {
    const result: Record<string, unknown> = {};
    Object.entries(configValue).forEach(([key, value]) => {
      result[key] = replaceAttachmentLinksInConfig(value, attachmentMap);
    });
    return result;
  }

  return configValue;
}

export function replaceGrowiLinksInConfigSource(
  source: string,
  linkMap: Map<string, string>,
): string {
  let result = source;
  linkMap.forEach((localPath, original) => {
    const pattern = `[[${original}]]`;
    result = result.replace(new RegExp(escapeRegExp(pattern), 'g'), localPath);
  });
  return result;
}

export interface EntryTemplateInfo {
  entryIndex: number;
  link: string;
  targetPath: string;
}

/**
 * Collects entry template informations from vivliostyle config.
 * Looks for entry[].template fields that reference a GROWI link like [[/path/to/template]]
 */
export function collectEntryTemplateInfos(configValue: unknown): EntryTemplateInfo[] {
  if (!isRecord(configValue)) return [];
  const entries = (configValue as any).entry;
  if (!Array.isArray(entries)) return [];
  const infos: EntryTemplateInfo[] = [];
  entries.forEach((entry: any, idx: number) => {
    if (!entry || typeof entry.template !== 'string') return;
    const tmpl = entry.template.trim();
    // If template contains GROWI link notation [[...]] extract inner
    // Attempt to extract GROWI link using non-global regex
    const detect = GROWI_LINK_DETECT_REGEX.exec(tmpl);
    let link: string | null = null;
    if (detect && typeof detect[1] === 'string') {
      link = detect[1];
    } else if (tmpl.startsWith('/')) {
      link = tmpl;
    }
    if (!link) return;
    const targetPath = typeof entry.path === 'string' && entry.path.trim() ? entry.path.trim() : (typeof entry.output === 'string' ? entry.output : `templates/template-${idx}.html`);
    infos.push({ entryIndex: idx, link, targetPath });
  });
  return infos;
}

/**
 * Removes the template field from entries referenced by infos.
 */
export function stripTemplateFieldFromEntries(parsedConfig: unknown, infos: EntryTemplateInfo[]): void {
  if (!isRecord(parsedConfig)) return;
  const entries = (parsedConfig as any).entry;
  if (!Array.isArray(entries)) return;
  for (const info of infos) {
    const e = entries[info.entryIndex];
    if (e && Object.prototype.hasOwnProperty.call(e, 'template')) {
      try { delete e.template; } catch { /* ignore */ }
    }
  }
}
