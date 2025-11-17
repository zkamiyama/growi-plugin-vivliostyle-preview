// Minimal, clean TypeScript implementation for `vivliostylecss` preprocessing.
// Purpose: extract ```vivliostylecss``` code blocks and optionally resolve
// inheritance directives (e.g. #GROWI_INHERIT_FULL, #GROWI_INHERIT_:root)
// by replacing directive comments with parent CSS snippets.

import postcss, {
  type AtRule,
  type ChildNode,
  type Container,
  type Document as PostcssDocument,
  type Root,
  type Rule as PostcssRule,
} from 'postcss';
import { fetchPagePathById } from '../utils/growi';

const CODE_BLOCK_REGEX_SOURCE = '```\\s*vivliostylecss\\s*\\r?\\n([\\s\\S]*?)```';
const DIRECTIVE_PREFIX = '#GROWI_INHERIT_';
const DIRECTIVE_TOKENS = {
  FULL: '#GROWI_INHERIT_FULL',
  ':root': '#GROWI_INHERIT_:root',
  '@page': '#GROWI_INHERIT_@page',
  '@font-face': '#GROWI_INHERIT_@font-face',
} as const;
type DirectiveKey = keyof typeof DIRECTIVE_TOKENS;
const TOKEN_BY_VALUE = new Map<string, DirectiveKey>(
  Object.entries(DIRECTIVE_TOKENS).map(([key, value]) => [value, key as DirectiveKey]),
);
const DIRECTIVE_COMMENT_REGEX = /\/\*[\s\S]*?#GROWI_INHERIT_[^\s*/]+[\s\S]*?\*\/|\/\/[^\n]*#GROWI_INHERIT_[^\s*/]+[^\n]*/gi;
const DIRECTIVE_TOKEN_CAPTURE_REGEX = /#GROWI_INHERIT_[^\s*/]+/i;
const ROOT_SELECTOR_REGEX = /:root(?![-a-z0-9_])/i;

interface CodeBlockMatch { start: number; end: number; css: string }

export interface VivlioCssPreprocessOptions {
  parseVivlioUserCss?: boolean; // default true
  enableDirectives?: boolean; // default true
  currentPath?: string | null;
  basePath?: string;
  fetchMarkdown?: (path: string, ctx?: { basePath?: string }) => Promise<string | null>;
}

export interface VivlioCssPreprocessResult { 
  markdown: string; 
  userCss: string;
  rawUserCss: string;
  dependencies: string[]; // List of page paths that were accessed
}

type PreprocessInternals = {
  visited: Set<string>;
  cache: Map<string, VivlioCssPreprocessResult>;
  dependencies: Set<string>; // Track all accessed paths
};

type DirectiveOccurrence = {
  raw: string;
  start: number;
  end: number;
  token: string | null;
  key: DirectiveKey | null;
};

// Global session cache (persists across multiple preprocessVivlioCss calls)
const globalCache = new Map<string, VivlioCssPreprocessResult>();

/**
 * Clear the global CSS cache. Call this when you want to force re-fetch
 * of all parent page CSS (e.g., "Refresh Dependencies" button).
 */
export function clearVivlioCssCache(): void {
  globalCache.clear();
  if (typeof console !== 'undefined' && console.debug) {
    console.debug('[VivlioDBG][cache] Global cache cleared');
  }
}

async function defaultFetchMarkdown(_path: string): Promise<string | null> { return null; }

export async function preprocessVivlioCss(markdown: string, options: VivlioCssPreprocessOptions = {}): Promise<VivlioCssPreprocessResult> {
  const { parseVivlioUserCss = true } = options;
  if (!parseVivlioUserCss || typeof markdown !== 'string') {
    return { markdown: typeof markdown === 'string' ? markdown : '', userCss: '', rawUserCss: '', dependencies: [] };
  }

  const internals: PreprocessInternals = {
    visited: new Set<string>(),
    cache: globalCache, // Use global cache instead of local one
    dependencies: new Set<string>(),
  };

  const result = await preprocessVivlioCssInternal(markdown, options, internals);
  return {
    ...result,
    dependencies: Array.from(internals.dependencies),
  };
}

async function preprocessVivlioCssInternal(markdown: string, options: VivlioCssPreprocessOptions, internals: PreprocessInternals): Promise<VivlioCssPreprocessResult> {
  const { parseVivlioUserCss = true } = options;
  if (!parseVivlioUserCss || typeof markdown !== 'string') {
    return { markdown: typeof markdown === 'string' ? markdown : '', userCss: '', rawUserCss: '', dependencies: [] };
  }

  const enableDirectives = options.enableDirectives !== false;
  const currentPath = normalizePath(options.currentPath, options.basePath);
  if (currentPath) internals.visited.add(currentPath);

  const blocks = extractVivlioCodeBlocks(markdown);
  if (blocks.length === 0) {
    return { markdown, userCss: '', rawUserCss: '', dependencies: [] };
  }

  const cleanedParts: string[] = [];
  const cssParts: string[] = [];
  const rawCssParts: string[] = [];
  let cursor = 0;

  for (const block of blocks) {
    cleanedParts.push(markdown.slice(cursor, block.start));
    cursor = block.end;

    const originalCss = block.css || '';
    if (!originalCss.trim()) continue;

    // collect raw (pre-directive) CSS
    rawCssParts.push(originalCss.trim());

    let css = originalCss;
    if (enableDirectives && css.includes(DIRECTIVE_PREFIX)) {
      css = await resolveDirectiveForCss(css, options, internals, currentPath);
    }

    const trimmed = css.trim();
    if (trimmed) cssParts.push(trimmed);
  }

  cleanedParts.push(markdown.slice(cursor));
  return { markdown: cleanedParts.join(''), userCss: cssParts.join('\n'), rawUserCss: rawCssParts.join('\n'), dependencies: [] };
}

function extractVivlioCodeBlocks(markdown: string): CodeBlockMatch[] {
  const matches: CodeBlockMatch[] = [];
  if (typeof markdown !== 'string' || markdown.length === 0) return matches;
  const regex = new RegExp(CODE_BLOCK_REGEX_SOURCE, 'gmi');
  let m: RegExpExecArray | null;
  while ((m = regex.exec(markdown)) !== null) {
    const fullStart = m.index;
    const fullEnd = regex.lastIndex;
    const css = m[1] ?? '';
    matches.push({ start: fullStart, end: fullEnd, css });
    if (regex.lastIndex === m.index) regex.lastIndex++;
  }
  return matches;
}

function normalizePath(path?: string | null, basePath?: string): string | null {
  if (typeof path !== 'string') return null;
  let value = path.trim();
  if (!value) return null;

  const hashIndex = value.indexOf('#');
  if (hashIndex >= 0) value = value.slice(0, hashIndex);
  const queryIndex = value.indexOf('?');
  if (queryIndex >= 0) value = value.slice(0, queryIndex);

  value = value.replace(/\\/g, '/');

  if (basePath) {
    let base = basePath.trim();
    if (base) {
      const baseHash = base.indexOf('#');
      if (baseHash >= 0) base = base.slice(0, baseHash);
      const baseQuery = base.indexOf('?');
      if (baseQuery >= 0) base = base.slice(0, baseQuery);
      if (!base.startsWith('/')) base = `/${base}`;
      if (base.length > 1) base = base.replace(/\/+$/g, '');
      if (base && base !== '/' && value.startsWith(base)) {
        value = value.slice(base.length) || '/';
      }
    }
  }

  if (!value.startsWith('/')) value = `/${value}`;
  value = value.replace(/\/+/g, '/');
  if (value.length > 1) value = value.replace(/\/+$/g, '');
  return value || '/';
}

function computeParentPath(path: string | null): string | null {
  if (!path || path === '/') return null;
  
  // Check if path looks like a page ID (24-character hex string)
  const cleaned = path.startsWith('/') ? path.slice(1) : path;
  const withoutEdit = cleaned.replace(/\/edit$/, '');
  if (/^[0-9a-f]{24}$/i.test(withoutEdit)) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[VivlioDBG][parent] Cannot compute parent path for page ID:', path, '- please use page path URL instead');
    }
    return null;
  }
  
  const parts = path.split('/').filter(Boolean);
  if (parts.length <= 1) return '/';
  return `/${parts.slice(0, -1).join('/')}`;
}

function findDirectiveOccurrences(css: string): DirectiveOccurrence[] {
  const occurrences: DirectiveOccurrence[] = [];
  if (typeof css !== 'string') return occurrences;

  const regex = new RegExp(DIRECTIVE_COMMENT_REGEX);
  let match: RegExpExecArray | null;
  while ((match = regex.exec(css)) !== null) {
    const raw = match[0];
    const tokenMatch = raw.match(DIRECTIVE_TOKEN_CAPTURE_REGEX);
    const token = tokenMatch ? tokenMatch[0] : null;
    const key = token ? TOKEN_BY_VALUE.get(token) ?? null : null;
    occurrences.push({
      raw,
      start: match.index,
      end: regex.lastIndex,
      token,
      key,
    });
    if (regex.lastIndex === match.index) regex.lastIndex++;
  }

  return occurrences;
}

function applyDirectiveReplacements(
  css: string,
  occurrences: DirectiveOccurrence[],
  replacer: (occurrence: DirectiveOccurrence) => string,
): string {
  if (!occurrences.length) return css;

  let result = '';
  let cursor = 0;
  for (const occurrence of occurrences) {
    result += css.slice(cursor, occurrence.start);
    result += replacer(occurrence);
    cursor = occurrence.end;
  }
  result += css.slice(cursor);
  return result;
}

function directivePageIdNote(token: string | null): string {
  const label = token ?? '#GROWI_INHERIT_FULL';
  return `/* Note: ${label} requires page path URL, not page ID */`;
}

async function resolveDirectiveForCss(
  css: string,
  options: VivlioCssPreprocessOptions,
  internals: PreprocessInternals,
  currentPath: string | null,
): Promise<string> {
  const occurrences = findDirectiveOccurrences(css);
  const hasKnownDirective = occurrences.some((occurrence) => Boolean(occurrence.key));
  if (!hasKnownDirective) {
    return css;
  }

  if (typeof console !== 'undefined' && console.debug) {
    const tokens = occurrences
      .filter((occurrence) => occurrence.key)
      .map((occurrence) => occurrence.token)
      .filter((token): token is string => Boolean(token));
    console.debug('[VivlioDBG][directive] Resolving directives:', tokens.join(', ') || '(none)', 'at path:', currentPath);
  }

  let effectivePath = currentPath;

  if (effectivePath) {
    const cleaned = effectivePath.startsWith('/') ? effectivePath.slice(1) : effectivePath;
    const withoutEdit = cleaned.replace(/\/edit$/, '');
    if (/^[0-9a-f]{24}$/i.test(withoutEdit)) {
      if (typeof console !== 'undefined' && console.info) {
        console.info('[VivlioDBG][directive] Detected page ID in preprocessor, attempting API resolve:', effectivePath);
      }
      if (typeof window !== 'undefined' && window.location) {
        try {
          const resolved = await fetchPagePathById(window.location.origin, options.basePath ?? '', withoutEdit);
          if (resolved) {
            effectivePath = resolved;
            if (typeof console !== 'undefined' && console.info) {
              console.info('[VivlioDBG][directive] Resolved page ID to path in preprocessor:', resolved);
            }
          } else {
            if (typeof console !== 'undefined' && console.warn) {
              console.warn('[VivlioDBG][directive] Could not resolve page ID in preprocessor:', effectivePath);
            }
            return applyDirectiveReplacements(css, occurrences, (occurrence) =>
              occurrence.key ? directivePageIdNote(occurrence.token) : occurrence.raw,
            );
          }
        } catch (error) {
          if (typeof console !== 'undefined' && console.warn) {
            console.warn('[VivlioDBG][directive] Error resolving page ID in preprocessor:', error);
          }
          return applyDirectiveReplacements(css, occurrences, (occurrence) =>
            occurrence.key ? directivePageIdNote(occurrence.token) : occurrence.raw,
          );
        }
      } else {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[VivlioDBG][directive] Cannot resolve page ID outside browser environment');
        }
        return applyDirectiveReplacements(css, occurrences, (occurrence) =>
          occurrence.key ? directivePageIdNote(occurrence.token) : occurrence.raw,
        );
      }
    }
  }

  const parentCss = await loadParentCss(options, internals, effectivePath);
  const parentCssText = typeof parentCss === 'string' ? parentCss : '';
  const trimmedParentCss = parentCssText.trim();
  if (typeof console !== 'undefined' && console.debug) {
    console.debug('[VivlioDBG][directive] Parent CSS length:', trimmedParentCss.length, 'chars');
  }

  const resolveContent = createDirectiveContentResolver(parentCssText);

  return applyDirectiveReplacements(css, occurrences, (occurrence) => {
    if (!occurrence.key) return occurrence.raw;
    const content = resolveContent(occurrence.key);
    if (!content || !content.trim()) {
      if (typeof console !== 'undefined' && console.debug) {
        console.debug('[VivlioDBG][directive] No content resolved for', occurrence.token ?? occurrence.key, '- keeping directive comment');
      }
      return occurrence.raw;
    }
    return `\n${content}\n`;
  });
}

function createDirectiveContentResolver(parentCss: string): (key: DirectiveKey) => string {
  const sourceCss = typeof parentCss === 'string' ? parentCss : '';
  const trimmedSource = sourceCss.trim();
  if (!trimmedSource) {
    return () => '';
  }

  const cache = new Map<DirectiveKey, string>();
  let parsedRoot: Root | null | undefined;

  const ensureRoot = (): Root | null => {
    if (parsedRoot !== undefined) return parsedRoot;
    try {
      parsedRoot = postcss.parse(sourceCss);
    } catch (error) {
      parsedRoot = null;
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[VivlioDBG][directive] Failed to parse parent CSS for directive extraction:', error);
      }
    }
    return parsedRoot;
  };

  return (key: DirectiveKey): string => {
    if (cache.has(key)) return cache.get(key)!;

    let value = '';
    switch (key) {
      case 'FULL':
        value = trimmedSource;
        break;
      case ':root': {
        const root = ensureRoot();
        value = collectRootRules(root);
        break;
      }
      case '@page': {
        const root = ensureRoot();
        value = collectAtRulesByName(root, 'page');
        break;
      }
      case '@font-face': {
        const root = ensureRoot();
        value = collectAtRulesByName(root, 'font-face');
        break;
      }
      default:
        value = '';
    }

    const trimmedValue = value.trim();
    cache.set(key, trimmedValue);
    return trimmedValue;
  };
}

function collectRootRules(root: Root | null): string {
  if (!root) return '';
  const fragments: string[] = [];
  root.walkRules((rule: PostcssRule) => {
    if (typeof rule.selector !== 'string') return;
    if (!selectorContainsRoot(rule.selector)) return;
    const fragment = cloneNodeWithAncestors(rule).toString().trim();
    if (fragment) fragments.push(fragment);
  });
  return fragments.join('\n\n');
}

function collectAtRulesByName(root: Root | null, name: string): string {
  if (!root) return '';
  const target = name.toLowerCase();
  const fragments: string[] = [];
  root.walkAtRules((atrule: AtRule) => {
    if (atrule.name.toLowerCase() !== target) return;
    const fragment = cloneNodeWithAncestors(atrule).toString().trim();
    if (fragment) fragments.push(fragment);
  });
  return fragments.join('\n\n');
}

function cloneNodeWithAncestors(node: PostcssRule | AtRule): ChildNode {
  let current: ChildNode = node.clone();
  let parent = node.parent as Container<ChildNode> | PostcssDocument | undefined;

  while (parent) {
    if (parent.type === 'root') break;

    if (parent.type === 'document') {
      parent = parent.parent as Container<ChildNode> | PostcssDocument | undefined;
      continue;
    }

    if (parent.type === 'atrule') {
      const atruleParent = parent as AtRule;
      if (typeof atruleParent.name === 'string' && atruleParent.name.toLowerCase() === 'layer') {
        parent = parent.parent as Container<ChildNode> | PostcssDocument | undefined;
        continue;
      }
    }

    const containerParent = parent as Container<ChildNode>;
    const parentClone = containerParent.clone() as Container<ChildNode>;
    parentClone.removeAll();
    parentClone.append(current);
    current = parentClone as unknown as ChildNode;
    parent = containerParent.parent as Container<ChildNode> | PostcssDocument | undefined;
  }

  return current;
}

function selectorContainsRoot(selector: string): boolean {
  return selector
    .split(',')
    .some((part) => ROOT_SELECTOR_REGEX.test(part));
}

async function loadParentCss(
  options: VivlioCssPreprocessOptions,
  internals: PreprocessInternals,
  currentPath: string | null,
): Promise<string> {
  if (!currentPath) return '';
  const parentPath = computeParentPath(currentPath);
  if (!parentPath) {
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[VivlioDBG][parent] No parent for root path');
    }
    return '';
  }

  if (typeof console !== 'undefined' && console.debug) {
    console.debug('[VivlioDBG][parent] Loading parent:', parentPath, 'for:', currentPath);
  }

  const cached = internals.cache.get(parentPath);
  if (cached) {
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[VivlioDBG][parent] Cache hit for:', parentPath);
    }
    // Track this dependency
    internals.dependencies.add(parentPath);
    return cached.userCss;
  }

  if (internals.visited.has(parentPath)) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[VivlioDBG][parent] Circular reference detected at:', parentPath);
    }
    return '';
  }

  const fetchMarkdown = options.fetchMarkdown ?? defaultFetchMarkdown;
  let parentMarkdown: string | null;
  try {
    parentMarkdown = await fetchMarkdown(parentPath, { basePath: options.basePath });
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[VivlioDBG][parent] Fetched parent markdown:', parentMarkdown ? `${parentMarkdown.length} chars` : 'null');
    }
  } catch (error) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[VivlioDBG][parent] Fetch error for:', parentPath, error);
    }
    parentMarkdown = null;
  }

  if (typeof parentMarkdown !== 'string' || !parentMarkdown.trim()) {
    internals.cache.set(parentPath, { markdown: '', userCss: '', rawUserCss: '', dependencies: [] });
    return '';
  }

  // Track this dependency before processing
  internals.dependencies.add(parentPath);

  const nextOptions: VivlioCssPreprocessOptions = { ...options, currentPath: parentPath };
  const result = await preprocessVivlioCssInternal(parentMarkdown, nextOptions, internals);
  internals.cache.set(parentPath, result);
  if (typeof console !== 'undefined' && console.debug) {
    console.debug('[VivlioDBG][parent] Processed parent CSS:', result.userCss.length, 'chars');
  }
  return result.userCss;
}

// Synchronous variant: does not perform async fetches. For directive handling
// it strips directive comments rather than resolving them.
export function preprocessVivlioCssSync(markdown: string, options: VivlioCssPreprocessOptions = {}): VivlioCssPreprocessResult {
  const { parseVivlioUserCss = true } = options;
  if (!parseVivlioUserCss || typeof markdown !== 'string') return { markdown: typeof markdown === 'string' ? markdown : '', userCss: '', rawUserCss: '', dependencies: [] };

  const enableDirectives = options.enableDirectives !== false;
  const blocks = extractVivlioCodeBlocks(markdown);
  if (blocks.length === 0) return { markdown, userCss: '', rawUserCss: '', dependencies: [] };

  const cleanedParts: string[] = [];
  const cssParts: string[] = [];
  const rawCssParts: string[] = [];
  let cursor = 0;

  for (const block of blocks) {
    cleanedParts.push(markdown.slice(cursor, block.start));
    cursor = block.end;

    const originalCss = block.css || '';
    if (!originalCss.trim()) continue;
    rawCssParts.push(originalCss.trim());
    let css = originalCss;
    if (enableDirectives && css.includes(DIRECTIVE_PREFIX)) {
      // sync path cannot resolve directives, strip directive comments
      css = css.replace(DIRECTIVE_COMMENT_REGEX, '');
    }
    const trimmed = css.trim();
    if (trimmed) cssParts.push(trimmed);
  }

  cleanedParts.push(markdown.slice(cursor));
  return { markdown: cleanedParts.join(''), userCss: cssParts.join('\n'), rawUserCss: rawCssParts.join('\n'), dependencies: [] };
}
