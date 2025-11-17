export interface GrowiContext {
  pagePath: string | null;
  basePath: string;
  origin: string;
  pageId: string | null;
  pageTitle: string | null;
  /** GROWI API token for authenticated requests (optional) */
  apiToken?: string | null;
}

const PAGE_PATH_CANDIDATES: string[][] = [
  ['APP_CONTAINER', 'props', 'crowi', 'context', 'page', 'path'],
  ['APP_CONTAINER', 'props', 'crowi', 'context', 'path'],
  ['APP_CONTAINER', 'props', 'crowi', 'context', 'currentPage', 'path'],
  ['APP_CONTAINER', 'props', 'data', 'page', 'path'],
  ['APP_CONTAINER', 'props', 'data', 'pagePath'],
  ['APP_CONTAINER', 'state', 'crowi', 'context', 'page', 'path'],
  ['appContainer', 'props', 'crowi', 'context', 'page', 'path'],
  ['appContainer', 'props', 'crowi', 'context', 'path'],
  ['appContainer', 'props', 'crowi', 'context', 'currentPage', 'path'],
  ['appContainer', 'state', 'crowi', 'context', 'page', 'path'],
  ['crowi', 'context', 'page', 'path'],
  ['crowi', 'context', 'path'],
  ['growi', 'context', 'page', 'path'],
  ['growi', 'context', 'currentPagePath'],
];

const PAGE_ID_CANDIDATES: string[][] = [
  ['APP_CONTAINER', 'props', 'crowi', 'context', 'page', '_id'],
  ['APP_CONTAINER', 'props', 'crowi', 'context', 'page', 'id'],
  ['APP_CONTAINER', 'props', 'crowi', 'context', 'currentPage', '_id'],
  ['APP_CONTAINER', 'props', 'crowi', 'context', 'currentPage', 'id'],
  ['APP_CONTAINER', 'props', 'data', 'page', '_id'],
  ['APP_CONTAINER', 'props', 'data', 'page', 'id'],
  ['APP_CONTAINER', 'state', 'crowi', 'context', 'page', '_id'],
  ['APP_CONTAINER', 'state', 'crowi', 'context', 'page', 'id'],
  ['appContainer', 'props', 'crowi', 'context', 'page', '_id'],
  ['appContainer', 'props', 'crowi', 'context', 'page', 'id'],
  ['appContainer', 'props', 'crowi', 'context', 'currentPage', '_id'],
  ['appContainer', 'props', 'crowi', 'context', 'currentPage', 'id'],
  ['appContainer', 'state', 'crowi', 'context', 'page', '_id'],
  ['appContainer', 'state', 'crowi', 'context', 'page', 'id'],
  ['crowi', 'context', 'page', '_id'],
  ['crowi', 'context', 'page', 'id'],
  ['crowi', 'context', 'currentPage', '_id'],
  ['crowi', 'context', 'currentPage', 'id'],
  ['growi', 'context', 'page', '_id'],
  ['growi', 'context', 'page', 'id'],
  ['growi', 'context', 'currentPage', '_id'],
  ['growi', 'context', 'currentPage', 'id'],
];

const BASE_PATH_CANDIDATES: string[][] = [
  ['APP_CONTAINER', 'props', 'crowi', 'context', 'basePath'],
  ['appContainer', 'props', 'crowi', 'context', 'basePath'],
  ['crowi', 'context', 'basePath'],
  ['growi', 'context', 'basePath'],
];

const PAGE_TITLE_CANDIDATES: string[][] = [
  ['APP_CONTAINER', 'props', 'crowi', 'context', 'page', 'title'],
  ['APP_CONTAINER', 'props', 'crowi', 'context', 'currentPage', 'title'],
  ['APP_CONTAINER', 'props', 'data', 'page', 'title'],
  ['appContainer', 'props', 'crowi', 'context', 'page', 'title'],
  ['appContainer', 'props', 'crowi', 'context', 'currentPage', 'title'],
  ['appContainer', 'props', 'data', 'page', 'title'],
  ['crowi', 'context', 'page', 'title'],
  ['growi', 'context', 'page', 'title'],
];

const META_PAGE_SELECTORS = [
  'meta[name="growi:page-path"]',
  'meta[name="growi:pagePath"]',
  'meta[name="growi:current-path"]',
  'meta[name="growi:currentPagePath"]',
];

const META_PAGE_ID_SELECTORS = [
  'meta[name="growi:page-id"]',
  'meta[name="growi:pageId"]',
  'meta[name="growi:page_id"]',
];

const META_PAGE_TITLE_SELECTORS = [
  'meta[name="growi:page-title"]',
  'meta[name="growi:pageTitle"]',
  'meta[property="og:title"]',
  'meta[name="og:title"]',
];

const PAGE_ID_DATA_SELECTORS = [
  '[data-page-id]',
  '[data-pageId]',
  '[data-page_id]',
];

const PAGE_ID_DATA_KEYS = ['pageId', 'pageid', 'page_id'];

const PAGE_TITLE_DATA_SELECTORS = [
  '[data-page-title]',
  '[data-pageTitle]',
  '[data-page_title]',
];

const PAGE_TITLE_DATA_KEYS = ['pageTitle', 'pagetitle', 'page_title'];

const META_BASE_SELECTORS = [
  'meta[name="growi:base-path"]',
  'meta[name="growi:basePath"]',
];

const INPUT_PAGE_SELECTORS = [
  'input[name="pagePath"]',
  'input[name="path"]',
  '[data-page-path]',
  '[data-path]',
  'input#pagePath',
  'input#path'
];

export async function detectGrowiContext(): Promise<GrowiContext | null> {
  const basePath = normalizeBasePath(
    readFromCandidate(BASE_PATH_CANDIDATES) ??
    readMeta(META_BASE_SELECTORS) ??
    document.body?.dataset?.basePath ??
    document.body?.dataset?.growiBasePath ??
    ''
  );

  const bodyDataset = document.body?.dataset ?? {};

  const pageIdCandidate =
    readFromCandidate(PAGE_ID_CANDIDATES) ??
    readMeta(META_PAGE_ID_SELECTORS) ??
    bodyDataset.pageId ??
    bodyDataset.growiPageId ??
    readDataAttribute(PAGE_ID_DATA_SELECTORS, PAGE_ID_DATA_KEYS);

  const pageTitleCandidate =
    readFromCandidate(PAGE_TITLE_CANDIDATES) ??
    readMeta(META_PAGE_TITLE_SELECTORS) ??
    bodyDataset.pageTitle ??
    bodyDataset.growiPageTitle ??
    readDataAttribute(PAGE_TITLE_DATA_SELECTORS, PAGE_TITLE_DATA_KEYS) ??
    (typeof document !== 'undefined' ? document.title : null);

  // Try multiple sources in priority order
  let pageCandidate = readFromCandidate(PAGE_PATH_CANDIDATES)
    ?? readMeta(META_PAGE_SELECTORS)
    ?? readInputValue(INPUT_PAGE_SELECTORS);
  
  // If we got a valid path, use it
  if (pageCandidate && typeof pageCandidate === 'string' && pageCandidate.startsWith('/') && !isPageId(pageCandidate)) {
    // Valid page path found
  } else {
    // Fall back to location detection
    pageCandidate = detectFromLocation(basePath);
  }

  const pagePath = normalizePagePath(pageCandidate, basePath);
  let pageId: string | null = typeof pageIdCandidate === 'string' && pageIdCandidate
    ? sanitizePageId(pageIdCandidate)
    : null;
  if (!pageId && pagePath && isPageId(pagePath)) {
    pageId = sanitizePageId(pagePath);
  }
  const pageTitle = typeof pageTitleCandidate === 'string' && pageTitleCandidate.trim()
    ? pageTitleCandidate.trim()
    : null;

  if (typeof console !== 'undefined' && console.debug) {
    console.debug('[VivlioDBG][growi] Initial pagePath before ID check:', pagePath, 'isPageId:', pagePath ? isPageId(pagePath) : false);
  }

  const context = {
    pagePath,
    basePath,
    origin: window.location.origin,
    pageId,
    pageTitle,
    apiToken: null, // Will be populated later if needed
  };

  if (typeof console !== 'undefined' && console.debug) {
    console.debug('[VivlioDBG][growi] Detected context (before ID resolution):', context);
  }

  // Check if pagePath is a page ID and try to resolve to path
  if (pagePath && isPageId(pagePath)) {
    if (typeof console !== 'undefined' && console.info) {
      console.info('[VivlioDBG][context] Detected page ID, attempting to resolve to path:', pagePath);
    }
    try {
      const normalizedId = sanitizePageId(pagePath);
      if (normalizedId) {
        const resolvedPath = await fetchPagePathById(context.origin, context.basePath, normalizedId);
        if (resolvedPath) {
          context.pagePath = resolvedPath;
          context.pageId = normalizedId;
          if (typeof console !== 'undefined' && console.info) {
            console.info('[VivlioDBG][context] Successfully resolved page ID to path:', resolvedPath);
          }
        } else if (typeof console !== 'undefined' && console.warn) {
          console.warn('[VivlioDBG][context] Could not resolve page ID to path:', pagePath, '- parent CSS inheritance will not work');
        }
      }
    } catch (error) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[VivlioDBG][context] Error resolving page ID:', error);
      }
    }
  }

  return context;
}

function sanitizePageId(candidate: string): string | null {
  if (typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  if (!trimmed) return null;
  const withoutLeading = trimmed.replace(/^\//, '');
  const cleaned = withoutLeading.replace(/\/edit$/, '');
  return cleaned || null;
}

// Export helper function for manual testing in browser console
if (typeof window !== 'undefined') {
  (window as any).__vivlio_test_page_id_api = async (pageId: string) => {
    console.log('%c[Vivlio API Test] Testing page ID resolution...', 'color: blue; font-weight: bold');
    console.log('Page ID:', pageId);
    
    const origin = window.location.origin;
    const basePath = '';
    
    const urlV3 = buildApiUrl(origin, basePath, '/_api/v3/page', { pageId });
    console.log('Testing V3 URL:', urlV3);
    
    try {
      const res = await fetch(urlV3, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      console.log('V3 Response:', res.status, res.statusText);
      if (res.ok) {
        const data = await res.json();
        console.log('V3 Data:', data);
        console.log('V3 Path found:', data?.data?.page?.path || 'NOT FOUND');
      }
    } catch (e) {
      console.error('V3 Error:', e);
    }
    
    const urlV1 = buildApiUrl(origin, basePath, '/_api/pages.get', { page_id: pageId });
    console.log('Testing V1 URL:', urlV1);
    
    try {
      const res = await fetch(urlV1, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      console.log('V1 Response:', res.status, res.statusText);
      if (res.ok) {
        const data = await res.json();
        console.log('V1 Data:', data);
        console.log('V1 Path found:', data?.page?.path || data?.path || 'NOT FOUND');
      }
    } catch (e) {
      console.error('V1 Error:', e);
    }
    
    console.log('%c[Vivlio API Test] Test complete', 'color: blue; font-weight: bold');
  };
  console.debug('[VivlioDBG] Test helper registered: __vivlio_test_page_id_api("your-page-id")');
}

// Check if a string looks like a page ID (24-character hex string)
function isPageId(str: string): boolean {
  if (!str) return false;
  // Remove leading slash
  const cleaned = str.startsWith('/') ? str.slice(1) : str;
  // Remove /edit suffix if present
  const withoutEdit = cleaned.replace(/\/edit$/, '');
  // MongoDB ObjectId is 24 hex characters
  return /^[0-9a-f]{24}$/i.test(withoutEdit);
}

export function createGrowiMarkdownFetcher(context: GrowiContext) {
  const cache = new Map<string, Promise<string | null>>();
  return async (path: string, ctx?: { basePath?: string }) => {
    const effectiveBase = normalizeBasePath(ctx?.basePath ?? context.basePath);
    const normalized = normalizePagePath(path, effectiveBase);
    if (!normalized) return null;
    if (cache.has(normalized)) return cache.get(normalized)!;
    const task = fetchMarkdownFromApi(context.origin, effectiveBase, normalized).catch(() => null);
    cache.set(normalized, task);
    return task;
  };
}

export interface GrowiPageInfo {
  pageId: string | null;
  pagePath: string | null;
  title: string | null;
  revisionId: string | null;
}

export async function fetchGrowiPageInfo(
  context: GrowiContext,
  options?: { signal?: AbortSignal }
): Promise<GrowiPageInfo | null> {
  const path = context.pagePath;
  if (!path) return null;

  const headers: Record<string, string> = { Accept: 'application/json' };
  const requestInit: RequestInit = {
    credentials: 'same-origin',
    headers,
    signal: options?.signal,
  };

  const tryExtract = (data: any): GrowiPageInfo | null => {
    if (!data) return null;
    const page = data?.data?.page ?? data?.page ?? null;
    if (!page) return null;
    const revision =
      page.revision ??
      data?.data?.revision ??
      data?.revision ??
      null;
    const id = typeof page._id === 'string'
      ? page._id
      : (typeof page.id === 'string' ? page.id : null);
    const title = typeof page.title === 'string' ? page.title : null;
    const resolvedPath = typeof page.path === 'string' ? page.path : context.pagePath;
    const revisionId = typeof revision?._id === 'string'
      ? revision._id
      : (typeof revision?.id === 'string' ? revision.id : null);
    return {
      pageId: id ?? null,
      pagePath: resolvedPath ?? null,
      title: title ?? null,
      revisionId: revisionId ?? null,
    };
  };

  const urls = [
    buildApiUrl(context.origin, context.basePath, '/_api/v3/page', { path, format: 'raw' }),
    buildApiUrl(context.origin, context.basePath, '/_api/pages.get', { path, format: 'raw' }),
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, requestInit);
      if (!res.ok) continue;
      const json = await res.json();
      const info = tryExtract(json);
      if (info) return info;
    } catch (error) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[VivlioDBG][growi] fetchGrowiPageInfo error', { url, error });
      }
    }
  }
  return null;
}

function readFromCandidate(paths: string[][]): string | null {
  const globalAny = window as any;
  for (const path of paths) {
    const value = getNested(globalAny, path);
    if (typeof value === 'string' && value) return value;
  }
  return null;
}

function readMeta(selectors: string[]): string | null {
  for (const selector of selectors) {
    const elem = document.querySelector<HTMLMetaElement>(selector);
    const content = elem?.content;
    if (typeof content === 'string' && content) return content;
  }
  return null;
}

function readInputValue(selectors: string[]): string | null {
  for (const selector of selectors) {
    const elem = document.querySelector<HTMLInputElement | HTMLElement>(selector);
    if (!elem) continue;
    if ('value' in elem && typeof (elem as HTMLInputElement).value === 'string') {
      const val = (elem as HTMLInputElement).value;
      if (val) return val;
    }
    const datasetVal = (elem as HTMLElement).dataset?.pagePath;
    if (datasetVal) return datasetVal;
  }
  return null;
}

function readDataAttribute(selectors: string[], keys: string[]): string | null {
  for (const selector of selectors) {
    const elem = document.querySelector<HTMLElement>(selector);
    if (!elem) continue;

    const dataset = elem.dataset;
    if (dataset) {
      for (const [datasetKey, value] of Object.entries(dataset)) {
        if (!value) continue;
        const lowerKey = datasetKey.toLowerCase();
        if (keys.some((target) => target.toLowerCase() === lowerKey)) {
          return value;
        }
        // Account for "data-xxx" -> dataset.xxx style conversion
        if (keys.some((target) => convertDataAttrToDatasetKey(target).toLowerCase() === lowerKey)) {
          return value;
        }
      }
    }

    for (const key of keys) {
      const attrCandidates = candidateAttrNames(key);
      for (const attrName of attrCandidates) {
        const attrValue = elem.getAttribute(attrName);
        if (attrValue) return attrValue;
      }
    }
  }
  return null;
}

function convertDataAttrToDatasetKey(attribute: string): string {
  if (!attribute) return attribute;
  if (attribute.startsWith('data-')) attribute = attribute.slice(5);
  const parts = attribute.split(/[-_]/g).filter(Boolean);
  if (!parts.length) return attribute;
  return parts[0] + parts.slice(1).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}

function candidateAttrNames(key: string): string[] {
  if (!key) return [];
  const attrNames = new Set<string>();
  const base = key.replace(/^[\s:]*/g, '');
  const normalized = base.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
  const underscored = base.replace(/-/g, '_');
  const dashed = base.replace(/_/g, '-');
  const camelFromData = convertDataAttrToDatasetKey(base);

  [
    base,
    normalized,
    underscored,
    dashed,
    camelFromData,
    `data-${base}`,
    `data-${normalized}`,
    `data-${underscored}`,
    `data-${dashed}`,
  ].forEach((name) => {
    const trimmed = name.trim();
    if (trimmed) attrNames.add(trimmed);
  });
  return Array.from(attrNames);
}

function detectFromLocation(basePath: string): string | null {
  try {
    const url = new URL(window.location.href);
    const queryCandidates = ['path', 'pagePath', 'page_path'];
    for (const key of queryCandidates) {
      const value = url.searchParams.get(key);
      if (value) return value;
    }
    if (url.hash) {
      const hashMatch = url.hash.match(/path=([^&]+)/);
      if (hashMatch && hashMatch[1]) return decodeURIComponentSafe(hashMatch[1]);
    }
    let pathname = url.pathname;
    const normalizedBase = normalizeBasePath(basePath);
    if (normalizedBase && pathname.startsWith(normalizedBase)) {
      pathname = pathname.slice(normalizedBase.length) || '/';
    }
    if (pathname.startsWith('/_/')) {
      return queryCandidates.map((key) => url.searchParams.get(key)).find((value) => value) ?? null;
    }
    return pathname;
  } catch (error) {
    return null;
  }
}

function getNested(target: any, path: string[]): any {
  let current = target;
  for (const key of path) {
    if (current == null) return undefined;
    try {
      current = current[key];
    } catch (error) {
      return undefined;
    }
  }
  return current;
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

function normalizePagePath(value: string | null | undefined, basePath: string): string | null {
  if (typeof value !== 'string') return null;
  let trimmed = value.trim();
  if (!trimmed) return null;
  const hashIndex = trimmed.indexOf('#');
  if (hashIndex >= 0) trimmed = trimmed.slice(0, hashIndex);
  const queryIndex = trimmed.indexOf('?');
  if (queryIndex >= 0) trimmed = trimmed.slice(0, queryIndex);
  trimmed = decodeURIComponentSafe(trimmed);
  const normalizedBase = normalizeBasePath(basePath);
  if (normalizedBase && trimmed.startsWith(normalizedBase)) {
    trimmed = trimmed.slice(normalizedBase.length) || '/';
  }
  if (!trimmed.startsWith('/')) trimmed = `/${trimmed}`;
  trimmed = trimmed.replace(/\/+/g, '/');
  if (trimmed.length > 1) trimmed = trimmed.replace(/\/+$/g, '');
  if (trimmed === '') return '/';
  return trimmed;
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return value;
  }
}

async function fetchMarkdownFromApi(origin: string, basePath: string, pagePath: string): Promise<string | null> {
  if (typeof console !== 'undefined' && console.info) {
    console.info('[VivlioDBG][api] Fetching markdown for path:', pagePath);
  }
  const urlV3 = buildApiUrl(origin, basePath, '/_api/v3/page', { path: pagePath, format: 'raw' });
  if (typeof console !== 'undefined' && console.info) {
    console.info('[VivlioDBG][api] V3 URL:', urlV3);
  }
  const fromV3 = await fetchBody(urlV3, extractBodyV3);
  if (typeof fromV3 === 'string') {
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[VivlioDBG][api] V3 API success:', pagePath, `(${fromV3.length} chars)`);
    }
    return fromV3;
  }
  const urlV1 = buildApiUrl(origin, basePath, '/_api/pages.get', { path: pagePath, format: 'raw' });
  if (typeof console !== 'undefined' && console.info) {
    console.info('[VivlioDBG][api] V1 URL:', urlV1);
  }
  const fromV1 = await fetchBody(urlV1, extractBodyV1);
  if (typeof fromV1 === 'string') {
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[VivlioDBG][api] V1 API success:', pagePath, `(${fromV1.length} chars)`);
    }
  } else {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[VivlioDBG][api] Both V3 and V1 failed for:', pagePath);
    }
  }
  return typeof fromV1 === 'string' ? fromV1 : null;
}

async function fetchBody(url: string, extractor: (data: any) => string | null): Promise<string | null> {
  try {
    const res = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[VivlioDBG][api] Response status:', res.status, res.statusText);
    }
    if (!res.ok) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[VivlioDBG][api] Response not OK:', res.status, 'for URL:', url);
      }
      return null;
    }
    const data = await res.json();
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[VivlioDBG][api] Response data structure:', Object.keys(data || {}));
    }
    const result = extractor(data);
    if (!result && typeof console !== 'undefined' && console.warn) {
      console.warn('[VivlioDBG][api] Extractor returned null. Data:', JSON.stringify(data, null, 2).slice(0, 500));
    }
    return result;
  } catch (error) {
    if (typeof console !== 'undefined' && console.error) {
      console.error('[VivlioDBG][api] fetchBody exception:', error, 'URL:', url);
    }
    return null;
  }
}

function extractBodyV3(data: any): string | null {
  // Try multiple patterns for V3 response
  const body = (
    data?.data?.page?.revision?.body ||
    data?.data?.revision?.body ||
    data?.page?.revision?.body ||
    data?.revision?.body ||
    null
  );
  if (typeof console !== 'undefined' && console.debug && !body) {
    console.debug('[VivlioDBG][api] extractBodyV3 tried all patterns, none found. Keys:', Object.keys(data || {}));
  }
  return typeof body === 'string' ? body : null;
}

function extractBodyV1(data: any): string | null {
  // Try multiple patterns for V1 response
  const body = (
    data?.page?.revision?.body ||
    data?.revision?.body ||
    data?.data?.page?.revision?.body ||
    null
  );
  if (typeof console !== 'undefined' && console.debug && !body) {
    console.debug('[VivlioDBG][api] extractBodyV1 tried all patterns, none found. Keys:', Object.keys(data || {}));
  }
  return typeof body === 'string' ? body : null;
}

export function buildApiUrl(origin: string, basePath: string, endpoint: string, params: Record<string, string>): string {
  const base = normalizeBasePath(basePath);
  const prefix = base ? base : '';
  const suffix = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = new URL(`${prefix}${suffix}`, origin);
  Object.entries(params).forEach(([key, value]) => {
    if (typeof value === 'string') url.searchParams.set(key, value);
  });
  return url.toString();
}

export async function fetchPagePathById(origin: string, basePath: string, pageId: string): Promise<string | null> {
  if (typeof console !== 'undefined' && console.info) {
    console.info('[VivlioDBG][api] ===== Starting page ID resolution =====');
    console.info('[VivlioDBG][api] Page ID:', pageId);
    console.info('[VivlioDBG][api] Origin:', origin);
    console.info('[VivlioDBG][api] BasePath:', basePath);
  }
  
  const tryExtractPath = (data: any): string | null => {
    // Try several common shapes returned by various GROWI versions
    return (
      data?.data?.page?.path ||
      data?.page?.path ||
      data?.data?.path ||
      data?.path ||
      null
    );
  };

  // Try V3 API: /_api/v3/page?pageId={id}
  const urlV3 = buildApiUrl(origin, basePath, '/_api/v3/page', { pageId });
  if (typeof console !== 'undefined' && console.info) {
    console.info('[VivlioDBG][api] Trying V3 API:', urlV3);
  }
  try {
    const res = await fetch(urlV3, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[VivlioDBG][api] V3 response status:', res.status, res.statusText);
    }
    if (res.ok) {
      const data = await res.json();
      if (typeof console !== 'undefined' && console.debug) {
        console.debug('[VivlioDBG][api] V3 response data:', data);
      }
      const path = tryExtractPath(data);
      if (typeof path === 'string') {
        if (typeof console !== 'undefined' && console.info) {
          console.info('[VivlioDBG][api] ✅ V3 API SUCCESS! Resolved:', pageId, '->', path);
        }
        return path;
      } else {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[VivlioDBG][api] V3 API returned no path. Response structure:', JSON.stringify(data, null, 2));
        }
      }
    } else {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[VivlioDBG][api] V3 API failed with status:', res.status);
      }
    }
  } catch (error) {
    if (typeof console !== 'undefined' && console.error) {
      console.error('[VivlioDBG][api] V3 API exception:', error);
    }
  }
  
  // Try V1 API: /_api/pages.get?page_id={id}
  const urlV1 = buildApiUrl(origin, basePath, '/_api/pages.get', { page_id: pageId });
  if (typeof console !== 'undefined' && console.info) {
    console.info('[VivlioDBG][api] Trying V1 API:', urlV1);
  }
  try {
    const res = await fetch(urlV1, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[VivlioDBG][api] V1 response status:', res.status, res.statusText);
    }
    if (res.ok) {
      const data = await res.json();
      if (typeof console !== 'undefined' && console.debug) {
        console.debug('[VivlioDBG][api] V1 response data:', data);
      }
      const path = data?.page?.path ?? data?.path;
      if (typeof path === 'string') {
        if (typeof console !== 'undefined' && console.info) {
          console.info('[VivlioDBG][api] ✅ V1 API SUCCESS! Resolved:', pageId, '->', path);
        }
        return path;
      } else {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[VivlioDBG][api] V1 API returned no path. Response structure:', JSON.stringify(data, null, 2));
        }
      }
    } else {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[VivlioDBG][api] V1 API failed with status:', res.status);
      }
    }
  } catch (error) {
    if (typeof console !== 'undefined' && console.error) {
      console.error('[VivlioDBG][api] V1 API exception:', error);
    }
  }
  
  if (typeof console !== 'undefined' && console.error) {
    console.error('[VivlioDBG][api] ❌ FAILED to resolve page ID to path:', pageId);
    console.error('[VivlioDBG][api] Please test these URLs manually in DevTools:');
    console.error('[VivlioDBG][api]   V3:', urlV3);
    console.error('[VivlioDBG][api]   V1:', urlV1);
  }
  return null;
}
