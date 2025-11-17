/**
 * Vivliostyle config entry processor: resolves GROWI internal links [[...]] 
 * and creates a complete ZIP archive with all referenced pages.
 */

import JSZip from 'jszip';
import type { GrowiContext } from '../utils/growi';
import { buildVfmPayloadAsync } from './buildVfmHtml';
import { collectAttachmentsForHtml } from '../utils/attachmentCollector';
import { getSharedVfmClient } from '../vfmWorkerClient';
import type { VivlioCssPreprocessOptions } from './vivlioCssPreprocessor';
import {
  extractGrowiLinksFromConfig,
  resolveGrowiLinkPath,
  generateLocalPathFromGrowiPath,
  replaceGrowiLinksInConfig,
  replaceGrowiLinksInConfigSource,
  extractAttachmentIdsFromConfig,
  fetchAttachmentMetadata,
  replaceAttachmentLinksInConfig,
  type VivlioConfigInfo,
  type ResolvedEntry,
  collectEntryTemplateInfos,
  stripTemplateFieldFromEntries,
} from './vivlioConfigPreprocessor';

export interface ProcessedConfigResult {
  /** ZIP blob containing all pages and assets */
  zipBlob: Blob;
  /** Updated config with [[...]] replaced by local paths */
  processedConfig: VivlioConfigInfo;
  /** Details of all resolved entries */
  resolvedEntries: ResolvedEntry[];
  /** Total count of assets bundled */
  totalAssets: number;
  /** Total bytes of all assets */
  totalAssetBytes: number;
}

export interface ProcessConfigOptions {
  /** VFM/CSS preprocessing options */
  vivlioCssOptions?: VivlioCssPreprocessOptions;
  /** Title for generated HTML pages */
  title?: string;
  /** Language code for generated HTML pages */
  language?: string;
  /** Enable MathJax in generated HTML */
  enableMath?: boolean;
  /** Markdown fetcher function */
  fetchMarkdown: (path: string) => Promise<string | null>;
}

const ATTACHMENT_DIR = 'attachments';
const ASSET_NAMESPACE = 'assets';

function getConfigFileName(config: VivlioConfigInfo): string {
  return config.format === 'js' ? 'vivliostyle.config.js' : 'vivliostyle.config.json';
}

function ensureTrailingNewline(text: string): string {
  return text.endsWith('\n') ? text : `${text}\n`;
}

function serializeConfigRaw(
  original: VivlioConfigInfo,
  updatedParsed: unknown,
  linkMap: Map<string, string>,
): string {
  if (original.format === 'js' && typeof original.raw === 'string' && original.raw.length > 0) {
    return replaceGrowiLinksInConfigSource(original.raw, linkMap);
  }

  try {
    return JSON.stringify(updatedParsed, null, 2);
  } catch {
    return original.raw;
  }
}

function serializeConfigRawWithAttachments(
  original: VivlioConfigInfo,
  updatedParsed: unknown,
  linkMap: Map<string, string>,
  attachmentMap: Map<string, string>,
): string {
  if (original.format === 'js' && typeof original.raw === 'string' && original.raw.length > 0) {
    let result = replaceGrowiLinksInConfigSource(original.raw, linkMap);
    // Replace attachment links in source
    attachmentMap.forEach((filename, id) => {
      const pattern = `[[attachment/${id}]]`;
      result = result.replace(new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), filename);
    });
    return result;
  }

  try {
    return JSON.stringify(updatedParsed, null, 2);
  } catch {
    return original.raw;
  }
}

/**
 * Main entry point: processes a vivliostyle config, resolves all [[...]] notations,
 * fetches referenced pages, converts to HTML, and bundles everything into a ZIP.
 * 
 * @param configInfo - Parsed vivliostyle config
 * @param context - GROWI context (for relative path resolution)
 * @param options - Processing options
 * @returns ZIP blob and updated config
 */
export async function processConfigWithGrowiLinks(
  configInfo: VivlioConfigInfo,
  context: GrowiContext,
  options: ProcessConfigOptions,
): Promise<ProcessedConfigResult> {
  const { fetchMarkdown, vivlioCssOptions, title, language, enableMath } = options;

  // 1) Extract all [[...]] links from config
  const parsedConfig = configInfo.parsed;
  if (!parsedConfig || configInfo.parseError) {
    throw new Error(`Cannot process invalid config: ${configInfo.parseError || 'No parsed config'}`);
  }

  const growiLinks = extractGrowiLinksFromConfig(parsedConfig);
  const attachmentIds = extractAttachmentIdsFromConfig(parsedConfig);
  
  console.info('[VivlioDBG][ConfigProcessor] Extracted from config:', {
    growiLinks: growiLinks.length,
    attachmentIds: attachmentIds.length,
  });
  
  if (growiLinks.length === 0 && attachmentIds.length === 0) {
    // No links to process - return original config wrapped in minimal ZIP
    console.info('[VivlioDBG][ConfigProcessor] No GROWI links or attachments found in config');
    return createMinimalZipResult(configInfo);
  }

  console.info('[VivlioDBG][ConfigProcessor] Found GROWI links:', growiLinks);
  console.info('[VivlioDBG][ConfigProcessor] Found attachment IDs:', attachmentIds);
  console.info('[VivlioDBG][ConfigProcessor] Config fields:', Object.keys(parsedConfig));

  const templateInfos = collectEntryTemplateInfos(parsedConfig);
  const templateOverrideMap = new Map<string, string>();
  templateInfos.forEach(info => {
    templateOverrideMap.set(info.link, info.targetPath);
  });

  if (templateInfos.length > 0) {
    console.info('[VivlioDBG][ConfigProcessor] Template overrides detected:', templateInfos);
  }

  // Get shared VFM client for all conversions
  const client = await getSharedVfmClient();

  // 2) Resolve all links and fetch markdown
  const linkMap = new Map<string, string>(); // [[original]] -> local path
  const resolvedEntries: ResolvedEntry[] = [];

  // 2a) Resolve attachment IDs to filenames
  const attachmentMap = new Map<string, string>(); // attachment ID -> packaged path
  const attachmentAssets: Array<{ id: string; filename: string; data: Uint8Array }> = [];
  const usedAttachmentPaths = new Set<string>();
  
  for (const attachmentId of attachmentIds) {
    try {
      const metadata = await fetchAttachmentMetadata(attachmentId, context.origin, context.apiToken);
      
      if (!metadata) {
        console.warn('[VivlioDBG][ConfigProcessor] Failed to resolve attachment:', attachmentId);
        continue;
      }
      
      const filename = buildAttachmentRelativePath(attachmentId, metadata.originalName, metadata.fileName, usedAttachmentPaths);
      attachmentMap.set(attachmentId, filename);
      
      console.info('[VivlioDBG][ConfigProcessor] Resolved attachment:', {
        id: attachmentId,
        filename,
      });
      
      // Fetch attachment data for ZIP inclusion
      try {
        const attachmentUrl = `${context.origin}${context.basePath ? context.basePath : ''}/attachment/${attachmentId}`;
        const response = await fetch(attachmentUrl, { credentials: 'same-origin' });
        
        if (!response.ok) {
          console.warn('[VivlioDBG][ConfigProcessor] Failed to fetch attachment data:', attachmentId);
          continue;
        }
        
        const arrayBuffer = await response.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);
        
        attachmentAssets.push({ id: attachmentId, filename, data });
        
        console.info('[VivlioDBG][ConfigProcessor] Fetched attachment data:', {
          id: attachmentId,
          filename,
          size: data.length,
        });
      } catch (error) {
        console.error('[VivlioDBG][ConfigProcessor] Error fetching attachment data:', attachmentId, error);
      }
      
    } catch (error) {
      console.error('[VivlioDBG][ConfigProcessor] Error resolving attachment:', attachmentId, error);
    }
  }

  // 2b) Resolve GROWI page links
  for (const link of growiLinks) {
    const growiPath = resolveGrowiLinkPath(link, context.pagePath);
    const overridePath = templateOverrideMap.get(link);
    const localPath = overridePath || generateLocalPathFromGrowiPath(growiPath);
    
    linkMap.set(link, localPath);

    if (overridePath) {
      console.info('[VivlioDBG][ConfigProcessor] Using template override path:', {
        link,
        growiPath,
        overridePath,
      });
    }
    
    const entry: ResolvedEntry = {
      original: link,
      growiPath,
      localPath,
      markdown: null,
      html: null,
      error: null,
    };

    try {
      // Fetch markdown
      const markdown = await fetchMarkdown(growiPath);
      if (!markdown) {
        entry.error = `Page not found: ${growiPath}`;
        console.warn('[VivlioDBG][ConfigProcessor] Page not found:', growiPath);
        resolvedEntries.push(entry);
        continue;
      }
      
      entry.markdown = markdown;

      // Convert to HTML with page-specific CSS options
      // Each page needs its own currentPath for correct CSS directive resolution
      const pageSpecificCssOptions: VivlioCssPreprocessOptions = {
        ...vivlioCssOptions,
        currentPath: growiPath,  // Update currentPath for each page
        fetchMarkdown,
      };

      const payload = await buildVfmPayloadAsync(markdown, {
        title: title || growiPath,
        language: language || 'ja',
        enableMath: enableMath !== false,
        vivlioCssOptions: pageSpecificCssOptions,
      }, client as any);
      
      entry.html = payload.html;
      
      console.info('[VivlioDBG][ConfigProcessor] Converted to HTML:', {
        growiPath,
        htmlLength: payload.html.length,
        userCssLength: payload.userCss?.length ?? 0,
        dependencies: payload.dependencies?.length ?? 0,
      });
      
    } catch (error) {
      entry.error = error instanceof Error ? error.message : String(error);
      console.error('[VivlioDBG][ConfigProcessor] Error processing page:', growiPath, error);
    }

    resolvedEntries.push(entry);
  }

  // 3) Replace [[...]] and [[attachment/...]] in config with local paths
  let updatedParsed = replaceGrowiLinksInConfig(parsedConfig, linkMap);
  updatedParsed = replaceAttachmentLinksInConfig(updatedParsed, attachmentMap);
  stripTemplateFieldFromEntries(updatedParsed, templateInfos);
  
  console.info('[VivlioDBG][ConfigProcessor] Replaced links in config:', {
    originalEntry: (parsedConfig as any).entry,
    updatedEntry: (updatedParsed as any).entry,
    originalCover: (parsedConfig as any).cover,
    updatedCover: (updatedParsed as any).cover,
  });
  
  const updatedRaw = ensureTrailingNewline(serializeConfigRawWithAttachments(configInfo, updatedParsed, linkMap, attachmentMap));
  const updatedConfig: VivlioConfigInfo = {
    ...configInfo,
    parsed: updatedParsed,
    raw: updatedRaw,
  };

  // 4) Build ZIP with all pages and assets
  const { zipBlob, totalAssets, totalAssetBytes } = await buildZipWithPages(
    resolvedEntries,
    attachmentAssets,
    updatedConfig,
    context,
  );

  return {
    zipBlob,
    processedConfig: updatedConfig,
    resolvedEntries,
    totalAssets,
    totalAssetBytes,
  };
}

/**
 * Creates a ZIP archive containing all resolved pages and their assets.
 */
async function buildZipWithPages(
  entries: ResolvedEntry[],
  attachmentAssets: Array<{ id: string; filename: string; data: Uint8Array }>,
  config: VivlioConfigInfo,
  context: GrowiContext,
): Promise<{ zipBlob: Blob; totalAssets: number; totalAssetBytes: number }> {
  const zip = new JSZip();
  
  let totalAssets = 0;
  let totalAssetBytes = 0;

  // Add attachment assets from config (e.g., cover images)
  for (const attachment of attachmentAssets) {
    try {
      zip.file(attachment.filename, attachment.data, { binary: true });
      totalAssets++;
      totalAssetBytes += attachment.data.length;
      
      console.info('[VivlioDBG][ConfigProcessor] Added attachment to ZIP:', {
        id: attachment.id,
        filename: attachment.filename,
        size: attachment.data.length,
      });
    } catch (error) {
      console.error('[VivlioDBG][ConfigProcessor] Failed to add attachment:', attachment.id, error);
    }
  }

  // Add each page HTML and collect its assets
  for (const entry of entries) {
    if (!entry.html) {
      // Create error placeholder page
      const errorHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>Error</title>
</head>
<body>
  <h1>Page Not Found</h1>
  <p>Failed to load: ${entry.growiPath}</p>
  <p>Error: ${entry.error || 'Unknown error'}</p>
</body>
</html>`;
      zip.file(entry.localPath, errorHtml);
      continue;
    }

    try {
      // Collect attachments for this page
      const assetDir = buildAssetDirForEntry(entry.localPath);
      const bundle = await collectAttachmentsForHtml(entry.html, context, { assetDir });
      
      // Add HTML with rewritten asset URLs
      zip.file(entry.localPath, bundle.html);
      
      // Add all assets
      for (const asset of bundle.assets) {
        zip.file(asset.localPath, asset.data, { binary: true });
        totalAssets++;
        totalAssetBytes += asset.size;
      }

      console.info('[VivlioDBG][ConfigProcessor] Bundled page:', {
        path: entry.localPath,
        growiPath: entry.growiPath,
        assets: bundle.assets.length,
        assetDir,
      });

    } catch (error) {
      console.error('[VivlioDBG][ConfigProcessor] Failed to bundle page:', entry.localPath, error);
      // Add error page as fallback
      const errorHtml = `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><title>Error</title></head>
<body>
  <h1>Bundling Error</h1>
  <p>Failed to process: ${entry.growiPath}</p>
  <p>${error instanceof Error ? error.message : String(error)}</p>
</body>
</html>`;
      zip.file(entry.localPath, errorHtml);
    }
  }

  // Add config file
  if (config.raw) {
    const configFileName = getConfigFileName(config);
    const configText = ensureTrailingNewline(config.raw);
    console.info('[VivlioDBG][ConfigProcessor] Writing config to ZIP:', {
      fileName: configFileName,
      preview: configText.substring(0, 500),
      fullLength: configText.length,
    });
    zip.file(configFileName, configText);
  }

  // Add metadata
  const metadata = {
    generatedAt: new Date().toISOString(),
    source: 'growi-plugin-vivliostyle-preview',
    entries: entries.map(e => ({
      original: e.original,
      growiPath: e.growiPath,
      localPath: e.localPath,
      success: !!e.html,
      error: e.error,
    })),
    totalAssets,
    totalAssetBytes,
  };
  zip.file('metadata.json', JSON.stringify(metadata, null, 2));

  // Generate ZIP
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const zipFiles = Object.keys(zip.files);
  console.info('[VivlioDBG][ConfigProcessor] ZIP generated:', {
    pages: entries.length,
    totalAssets,
    totalAssetBytes,
    zipSize: blob.size,
    filesInZip: zipFiles,
  });

  return { zipBlob: blob, totalAssets, totalAssetBytes };
}

/**
 * Creates a minimal ZIP result for configs without GROWI links.
 */
async function createMinimalZipResult(configInfo: VivlioConfigInfo): Promise<ProcessedConfigResult> {
  const zip = new JSZip();
  
  if (configInfo.raw) {
    const configFileName = getConfigFileName(configInfo);
    const configText = ensureTrailingNewline(configInfo.raw);
    zip.file(configFileName, configText);
  }

  const metadata = {
    generatedAt: new Date().toISOString(),
    source: 'growi-plugin-vivliostyle-preview',
    entries: [],
    totalAssets: 0,
    totalAssetBytes: 0,
  };
  zip.file('metadata.json', JSON.stringify(metadata, null, 2));

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return {
    zipBlob: blob,
    processedConfig: configInfo,
    resolvedEntries: [],
    totalAssets: 0,
    totalAssetBytes: 0,
  };
}

function buildAttachmentRelativePath(
  attachmentId: string,
  originalName: string | null | undefined,
  fallbackFileName: string | null | undefined,
  usedPaths: Set<string>,
): string {
  const safeId = sanitizePathSegment((attachmentId || '').toLowerCase()) || shortHash(attachmentId);
  const extension =
    normalizeExtensionFromName(originalName) || normalizeExtensionFromName(fallbackFileName);
  const base = `${ATTACHMENT_DIR}/attachment-${safeId}`;
  let candidate = extension ? `${base}.${extension}` : base;
  let counter = 1;
  while (usedPaths.has(candidate)) {
    counter += 1;
    candidate = extension ? `${base}-${counter}.${extension}` : `${base}-${counter}`;
  }
  usedPaths.add(candidate);
  return candidate;
}

function normalizeExtensionFromName(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  const lastDot = trimmed.lastIndexOf('.');
  if (lastDot === -1 || lastDot === trimmed.length - 1) return null;
  const ext = trimmed.slice(lastDot + 1);
  const sanitized = ext.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toLowerCase();
  return sanitized || null;
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
}

function shortHash(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) + value.charCodeAt(i);
  }
  const hex = (hash >>> 0).toString(16);
  return hex.padStart(8, '0').slice(0, 8);
}

function buildAssetDirForEntry(localPath: string): string {
  const withoutExt = localPath.replace(/\.[^.]+$/, '');
  const flattened = withoutExt.replace(/[\\/]+/g, '_');
  const segment = sanitizePathSegment(flattened) || 'page';
  return `${ASSET_NAMESPACE}/${segment}`;
}
