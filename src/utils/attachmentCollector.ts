import type { GrowiContext } from './growi';

const CSS_URL_REGEX = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
const DEFAULT_ASSET_DIR = 'assets';

type UsageKind =
  | 'img'
  | 'img-srcset'
  | 'source'
  | 'script'
  | 'style-link'
  | 'style-inline'
  | 'style-tag'
  | 'video'
  | 'audio'
  | 'track'
  | 'iframe'
  | 'object'
  | 'embed'
  | 'svg'
  | 'unknown';

interface AttachmentCandidate {
  key: string;
  url: URL;
  usages: Set<UsageKind>;
  localPath?: string;
  data?: Uint8Array;
  fileName?: string;
  contentType?: string | null;
  size?: number;
}

interface AttrReference {
  element: Element;
  attr: string;
  key: string;
}

interface SrcsetEntry {
  key: string;
  descriptor: string;
  originalUrl: string;
}

interface SrcsetReference {
  element: Element;
  entries: SrcsetEntry[];
}

interface CssReference {
  type: 'styleAttr' | 'styleTag';
  element: Element;
  originalText: string;
}

export interface AttachmentAsset {
  originalUrl: string;
  localPath: string;
  fileName: string;
  size: number;
  contentType: string | null;
  usage: UsageKind[];
  data: Uint8Array;
}

export interface CollectAttachmentsResult {
  html: string;
  assets: AttachmentAsset[];
}

export interface CollectAttachmentsOptions {
  assetDir?: string;
}

export async function collectAttachmentsForHtml(
  html: string,
  context: GrowiContext,
  options?: CollectAttachmentsOptions,
): Promise<CollectAttachmentsResult> {
  if (typeof DOMParser === 'undefined') {
    return { html, assets: [] };
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(html, 'text/html');

  const attachments = new Map<string, AttachmentCandidate>();
  const attrReferences: AttrReference[] = [];
  const srcsetReferences: SrcsetReference[] = [];
  const cssReferences: CssReference[] = [];

  const normalizedBasePath = normalizeBasePath(context.basePath);
  const assetDir = normalizeAssetDir(options?.assetDir ?? DEFAULT_ASSET_DIR);

  collectAttributeReferences(document, context, normalizedBasePath, attachments, attrReferences);
  collectSrcsetReferences(document, context, normalizedBasePath, attachments, srcsetReferences);
  collectSvgReferences(document, context, normalizedBasePath, attachments, attrReferences);
  collectCssReferences(document, context, normalizedBasePath, attachments, cssReferences);

  if (attachments.size === 0) {
    const serialized = rebuildHtml(html, document);
    return { html: serialized, assets: [] };
  }

  const usedNames = new Set<string>();
  const resultAssets: AttachmentAsset[] = [];

  let index = 0;
  for (const candidate of attachments.values()) {
    index += 1;
    const fetched = await fetchAttachment(candidate.url);
    const suggestedName = selectFilename(fetched, candidate.url, index);
    const fileName = ensureUniqueFileName(suggestedName, usedNames, candidate.key);
    const localPath = `${assetDir}/${fileName}`;

    candidate.localPath = localPath;
    candidate.data = fetched.data;
    candidate.size = fetched.data.byteLength;
    candidate.fileName = fileName;
    candidate.contentType = fetched.contentType;

    const usageList = Array.from(candidate.usages);
    const normalizedUsage: UsageKind[] = usageList.length > 0 ? usageList : (['unknown'] as UsageKind[]);

    resultAssets.push({
      originalUrl: candidate.url.href,
      localPath,
      fileName,
      size: fetched.data.byteLength,
      contentType: fetched.contentType,
      usage: normalizedUsage,
      data: fetched.data,
    });
  }

  rewriteAttributeReferences(attrReferences, attachments);
  rewriteSrcsetReferences(srcsetReferences, attachments);
  rewriteCssReferences(cssReferences, context, normalizedBasePath, attachments);

  const serializedHtml = rebuildHtml(html, document);
  return { html: serializedHtml, assets: resultAssets };
}

function collectAttributeReferences(
  document: Document,
  context: GrowiContext,
  normalizedBasePath: string,
  attachments: Map<string, AttachmentCandidate>,
  attrReferences: AttrReference[],
) {
  const attrSelectors: Array<{ selector: string; attr: string; usage: UsageKind; filter?: (element: Element) => boolean }> = [
    { selector: 'img[src]', attr: 'src', usage: 'img' },
    { selector: 'video[src]', attr: 'src', usage: 'video' },
    { selector: 'audio[src]', attr: 'src', usage: 'audio' },
    { selector: 'track[src]', attr: 'src', usage: 'track' },
    { selector: 'source[src]', attr: 'src', usage: 'source' },
    { selector: 'iframe[src]', attr: 'src', usage: 'iframe' },
    { selector: 'object[data]', attr: 'data', usage: 'object' },
    { selector: 'embed[src]', attr: 'src', usage: 'embed' },
    {
      selector: 'link[href]',
      attr: 'href',
      usage: 'style-link',
      filter: (element) => {
        const rel = (element.getAttribute('rel') || '').toLowerCase();
        if (!rel) return false;
        const relTokens = rel.split(/\s+/).filter(Boolean);
        return relTokens.includes('stylesheet') || relTokens.includes('preload') || relTokens.includes('prefetch');
      },
    },
    { selector: 'script[src]', attr: 'src', usage: 'script' },
  ];

  for (const entry of attrSelectors) {
    const elements = Array.from(document.querySelectorAll(entry.selector));
    for (const element of elements) {
      if (entry.filter && !entry.filter(element)) continue;
      const rawValue = element.getAttribute(entry.attr);
      const resolved = resolveAttachmentUrl(rawValue, context, normalizedBasePath);
      if (!resolved) continue;

      const candidate = ensureCandidate(attachments, resolved);
      candidate.usages.add(entry.usage);
      attrReferences.push({ element, attr: entry.attr, key: candidate.key });
    }
  }
}

function collectSrcsetReferences(
  document: Document,
  context: GrowiContext,
  normalizedBasePath: string,
  attachments: Map<string, AttachmentCandidate>,
  srcsetReferences: SrcsetReference[],
) {
  const elements = Array.from(document.querySelectorAll('img[srcset], source[srcset]'));
  for (const element of elements) {
    const rawValue = element.getAttribute('srcset');
    if (!rawValue) continue;
    const entries = parseSrcset(rawValue)
      .map((entry) => {
        const resolved = resolveAttachmentUrl(entry.url, context, normalizedBasePath);
        if (!resolved) return null;
        const candidate = ensureCandidate(attachments, resolved);
        candidate.usages.add('img-srcset');
        return {
          key: candidate.key,
          descriptor: entry.descriptor,
          originalUrl: entry.url,
        } as SrcsetEntry;
      })
      .filter((entry): entry is SrcsetEntry => Boolean(entry));

    if (entries.length > 0) {
      srcsetReferences.push({ element, entries });
    }
  }
}

function collectSvgReferences(
  document: Document,
  context: GrowiContext,
  normalizedBasePath: string,
  attachments: Map<string, AttachmentCandidate>,
  attrReferences: AttrReference[],
) {
  const elements = Array.from(document.querySelectorAll('image, use'));
  for (const element of elements) {
    const value = element.getAttribute('href') ?? element.getAttribute('xlink:href');
    if (!value) continue;
    const resolved = resolveAttachmentUrl(value, context, normalizedBasePath);
    if (!resolved) continue;
    const candidate = ensureCandidate(attachments, resolved);
    candidate.usages.add('svg');
    const attr = element.hasAttribute('href') ? 'href' : 'xlink:href';
    attrReferences.push({ element, attr, key: candidate.key });
  }
}

function collectCssReferences(
  document: Document,
  context: GrowiContext,
  normalizedBasePath: string,
  attachments: Map<string, AttachmentCandidate>,
  cssReferences: CssReference[],
) {
  const inlineElements = Array.from(document.querySelectorAll<HTMLElement>('[style]'));
  for (const element of inlineElements) {
    const value = element.getAttribute('style');
    if (!value) continue;
    const hasAttachment = registerCssUrls(value, context, normalizedBasePath, attachments, 'style-inline');
    if (hasAttachment) {
      cssReferences.push({ type: 'styleAttr', element, originalText: value });
    }
  }

  const styleElements = Array.from(document.querySelectorAll<HTMLStyleElement>('style'));
  for (const element of styleElements) {
    const value = element.textContent;
    if (!value) continue;
    const hasAttachment = registerCssUrls(value, context, normalizedBasePath, attachments, 'style-tag');
    if (hasAttachment) {
      cssReferences.push({ type: 'styleTag', element, originalText: value });
    }
  }
}

function registerCssUrls(
  cssText: string,
  context: GrowiContext,
  normalizedBasePath: string,
  attachments: Map<string, AttachmentCandidate>,
  usage: UsageKind,
): boolean {
  let matched = false;
  cssText.replace(CSS_URL_REGEX, (_, __, urlValue: string) => {
    const resolved = resolveAttachmentUrl(urlValue, context, normalizedBasePath);
    if (resolved) {
      const candidate = ensureCandidate(attachments, resolved);
      candidate.usages.add(usage);
      matched = true;
    }
    return '';
  });
  return matched;
}

function rewriteAttributeReferences(references: AttrReference[], attachments: Map<string, AttachmentCandidate>) {
  for (const ref of references) {
    const candidate = attachments.get(ref.key);
    if (!candidate || !candidate.localPath) continue;
    ref.element.setAttribute(ref.attr, candidate.localPath);
  }
}

function rewriteSrcsetReferences(references: SrcsetReference[], attachments: Map<string, AttachmentCandidate>) {
  for (const ref of references) {
    const parts = ref.entries.map((entry) => {
      const candidate = attachments.get(entry.key);
      const target = candidate?.localPath ?? entry.originalUrl;
      return entry.descriptor ? `${target} ${entry.descriptor}` : target;
    });
    ref.element.setAttribute('srcset', parts.join(', '));
  }
}

function rewriteCssReferences(
  references: CssReference[],
  context: GrowiContext,
  normalizedBasePath: string,
  attachments: Map<string, AttachmentCandidate>,
) {
  for (const ref of references) {
    const replaced = ref.originalText.replace(CSS_URL_REGEX, (match, quote: string, urlValue: string) => {
      const resolved = resolveAttachmentUrl(urlValue, context, normalizedBasePath);
      if (!resolved) return match;
      const candidate = attachments.get(resolved.href);
      if (!candidate || !candidate.localPath) return match;
      const q = quote || '';
      return `url(${q}${candidate.localPath}${q})`;
    });
    if (ref.type === 'styleAttr') {
      ref.element.setAttribute('style', replaced);
    } else if (ref.type === 'styleTag') {
      ref.element.textContent = replaced;
    }
  }
}

function ensureCandidate(map: Map<string, AttachmentCandidate>, url: URL): AttachmentCandidate {
  const key = url.href;
  const existing = map.get(key);
  if (existing) return existing;
  const candidate: AttachmentCandidate = {
    key,
    url,
    usages: new Set<UsageKind>(),
  };
  map.set(key, candidate);
  return candidate;
}

function resolveAttachmentUrl(
  value: string | null | undefined,
  context: GrowiContext,
  normalizedBasePath: string,
): URL | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (lower.startsWith('data:') || lower.startsWith('javascript:') || lower.startsWith('mailto:')) {
    return null;
  }

  const base = buildBaseUrl(context.origin, normalizedBasePath);
  let url: URL;
  try {
    url = new URL(trimmed, base);
  } catch (error) {
    return null;
  }

  if (url.origin !== context.origin) return null;

  const pathWithoutBase = stripBasePath(url.pathname, normalizedBasePath);
  if (!pathWithoutBase.startsWith('/attachment')) return null;

  return url;
}

function buildBaseUrl(origin: string, normalizedBasePath: string): string {
  const basePath = normalizedBasePath || '';
  const suffix = basePath.endsWith('/') ? '' : '/';
  return `${origin}${basePath}${suffix}`;
}

function stripBasePath(pathname: string, normalizedBasePath: string): string {
  if (!normalizedBasePath) return pathname;
  if (pathname === normalizedBasePath) return '/';
  if (pathname.startsWith(`${normalizedBasePath}/`)) {
    return pathname.slice(normalizedBasePath.length);
  }
  return pathname;
}

function normalizeBasePath(value: string | null | undefined): string {
  if (typeof value !== 'string') return '';
  let trimmed = value.trim();
  if (!trimmed) return '';
  const hashIndex = trimmed.indexOf('#');
  if (hashIndex >= 0) trimmed = trimmed.slice(0, hashIndex);
  const queryIndex = trimmed.indexOf('?');
  if (queryIndex >= 0) trimmed = trimmed.slice(0, queryIndex);
  if (!trimmed.startsWith('/')) trimmed = `/${trimmed}`;
  trimmed = trimmed.replace(/\/+$/g, '');
  if (trimmed === '/') return '';
  return trimmed;
}

function normalizeAssetDir(value: string): string {
  if (!value) return DEFAULT_ASSET_DIR;
  let normalized = value.replace(/\\/g, '/');
  normalized = normalized.replace(/^\.?\//, '');
  normalized = normalized.replace(/\/+$/g, '');
  return normalized || DEFAULT_ASSET_DIR;
}

function parseSrcset(value: string): Array<{ url: string; descriptor: string }> {
  const entries: Array<{ url: string; descriptor: string }> = [];
  const parts = value.split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const segments = trimmed.split(/\s+/);
    const url = segments.shift();
    if (!url) continue;
    entries.push({ url, descriptor: segments.join(' ') });
  }
  return entries;
}

async function fetchAttachment(url: URL) {
  let response: Response;
  try {
    response = await fetch(url.toString(), { credentials: 'same-origin' });
  } catch (error) {
    throw new Error(`Failed to fetch attachment ${url.toString()}: ${String(error)}`);
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch attachment ${url.toString()}: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const data = new Uint8Array(arrayBuffer);
  const contentType = response.headers.get('Content-Type');
  const contentDisposition = response.headers.get('Content-Disposition');

  return {
    data,
    contentType,
    contentDisposition,
  };
}

function selectFilename(
  fetched: { contentDisposition: string | null; data: Uint8Array; contentType: string | null },
  url: URL,
  index: number,
): string {
  const extFromType = guessExtension(fetched.contentType);
  const extFromPath = extractExtensionFromPath(url.pathname);
  const extension = extFromType || extFromPath;
  const padded = String(index).padStart(3, '0');
  const base = `asset-${padded}`;
  return extension ? `${base}.${extension}` : base;
}

function ensureUniqueFileName(name: string, used: Set<string>, key: string): string {
  const sanitizedBase = sanitizeFileName(name);
  const base = sanitizedBase || `asset-${shortHash(key)}`;
  let candidate = base;
  let counter = 1;
  const extIndex = base.lastIndexOf('.');
  const stem = extIndex >= 0 ? base.slice(0, extIndex) : base;
  const ext = extIndex >= 0 ? base.slice(extIndex) : '';
  while (used.has(candidate.toLowerCase())) {
    counter += 1;
    candidate = `${stem}-${counter}${ext}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
}

function shortHash(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) + value.charCodeAt(i);
  }
  const hex = (hash >>> 0).toString(16);
  return hex.padStart(8, '0').slice(0, 8);
}

function extractExtensionFromPath(pathname: string): string | null {
  if (!pathname) return null;
  const lastSegment = pathname.split('/').filter(Boolean).pop();
  if (!lastSegment) return null;
  const dotIndex = lastSegment.lastIndexOf('.');
  if (dotIndex === -1 || dotIndex === lastSegment.length - 1) return null;
  const ext = lastSegment.slice(dotIndex + 1);
  const sanitized = ext.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toLowerCase();
  return sanitized || null;
}

function guessExtension(contentType: string | null): string | null {
  if (!contentType) return null;
  const lower = contentType.toLowerCase();
  if (lower.includes('png')) return 'png';
  if (lower.includes('jpeg')) return 'jpg';
  if (lower.includes('jpg')) return 'jpg';
  if (lower.includes('gif')) return 'gif';
  if (lower.includes('svg')) return 'svg';
  if (lower.includes('webp')) return 'webp';
  if (lower.includes('json')) return 'json';
  if (lower.includes('css')) return 'css';
  if (lower.includes('javascript')) return 'js';
  if (lower.includes('html')) return 'html';
  if (lower.includes('pdf')) return 'pdf';
  return null;
}

function rebuildHtml(originalHtml: string, document: Document): string {
  const hasDoctype = /^\s*<!doctype/i.test(originalHtml);
  let serialized = document.documentElement?.outerHTML || '';
  if (hasDoctype) {
    serialized = `<!DOCTYPE html>\n${serialized}`;
  }
  return serialized;
}
