import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import JSZip from 'jszip';
import { useAppContext } from '../../context/AppContext';
import { readEditorMarkdownSnapshot } from '../../utils/editor';
import {
  buildApiUrl,
  createGrowiMarkdownFetcher,
  detectGrowiContext,
  fetchGrowiPageInfo,
  GrowiContext,
  GrowiPageInfo,
} from '../../utils/growi';
import { collectAttachmentsForHtml } from '../../utils/attachmentCollector';
import { buildVfmPayloadAsync } from '../../vfm/buildVfmHtml';
import { getSharedVfmClient } from '../../vfmWorkerClient';
import type { VivlioPayload } from '../hooks/useVivlioBuild';
import { extractVivlioConfig, resolveVivlioConfig, containsGrowiLink } from '../../vfm/vivlioConfigPreprocessor';
import type { VivlioConfigInfo } from '../../vfm/vivlioConfigPreprocessor';
import { processConfigWithGrowiLinks } from '../../vfm/configEntryProcessor';
import './BuildPdfDialog.css';

type BuildStage =
  | 'idle'
  | 'preparing'
  | 'uploading'
  | 'queued'
  | 'running'
  | 'receiving'
  | 'attaching'
  | 'succeeded'
  | 'failed';

type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | null;

type AttachmentStatus = 'pending' | 'skipped' | 'success' | 'failed';

interface AttachmentState {
  status: AttachmentStatus;
  message: string | null;
}

interface RemoteLogEntry {
  timestamp?: string;
  level?: string;
  message?: string;
  details?: unknown;
  raw?: string;
}

interface BuildJobState {
  stage: BuildStage;
  jobId: string | null;
  jobStatus: JobStatus;
  logs: RemoteLogEntry[];
  error: string | null;
  archiveSize: number | null;
  submittedAt: number | null;
  completedAt: number | null;
  resultFileName: string | null;
  attachment: AttachmentState;
}

const MAX_LOG_ENTRIES = 500;
const PROCESSING_STAGES: BuildStage[] = [
  'preparing',
  'uploading',
  'queued',
  'running',
  'receiving',
  'attaching',
];

const CACHE_PREFIX = '__CACHE__';
const CONFIG_JSON_FILENAME = 'vivliostyle.config.json';
const CONFIG_JS_FILENAME = 'vivliostyle.config.js';

const getConfigFileNameForInfo = (info: VivlioConfigInfo | null | undefined): string =>
  info && info.format === 'js' ? CONFIG_JS_FILENAME : CONFIG_JSON_FILENAME;

const ensureTrailingNewline = (text: string): string =>
  text.endsWith('\n') ? text : `${text}\n`;

const createInitialJobState = (): BuildJobState => ({
  stage: 'idle',
  jobId: null,
  jobStatus: null,
  logs: [],
  error: null,
  archiveSize: null,
  submittedAt: null,
  completedAt: null,
  resultFileName: null,
  attachment: { status: 'pending', message: null },
});

const BuildPdfDialog: React.FC = () => {
  const { markdown, forceUpdateMarkdown } = useAppContext();
  const [isOpen, setIsOpen] = useState(false);
  const [jobState, setJobState] = useState<BuildJobState>(() => createInitialJobState());
  // Always-on auto-scroll for logs; remove GUI toggle per user request
  const [autoScroll] = useState(true);
  const [configCollapsed, setConfigCollapsed] = useState(true);
  const [configPreview, setConfigPreview] = useState<VivlioConfigInfo>(() => resolveVivlioConfig(null));
  const [configCopied, setConfigCopied] = useState(false);
  const [logsCopied, setLogsCopied] = useState(false);
  // TOC-VivliostyleCSS feature removed: preview/state for it eliminated
  const [dialogOpenedOnce, setDialogOpenedOnce] = useState(false);
  // TOC-VivliostyleCSS feature fully removed
  const pendingFileNamesRef = useRef<{ download: string; attachment: string } | null>(null);
  const contextRef = useRef<GrowiContext | null>(null);
  const pageInfoRef = useRef<GrowiPageInfo | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const activeFetchRef = useRef<AbortController | null>(null);
  const pdfBlobRef = useRef<Blob | null>(null);
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const configCopyTimerRef = useRef<number | null>(null);
  const logCopyTimerRef = useRef<number | null>(null);
  const portalRootRef = useRef<HTMLDivElement | null>(null);
  const updateConfigPreview = useCallback((text: string | null | undefined) => {
    const source = typeof text === 'string' ? text : '';
    const extraction = extractVivlioConfig(source);
    const info = resolveVivlioConfig(extraction.rawConfig);
    
    // Debug logging
    console.debug('[VivlioDBG][updateConfigPreview] input length:', source.length);
    console.debug('[VivlioDBG][updateConfigPreview] rawConfig extracted:', extraction.rawConfig ? 'YES' : 'NO');
    console.debug('[VivlioDBG][updateConfigPreview] config.source:', info.source);
    
    setConfigPreview(info);
  }, []);

  const cleanupEventSource = useCallback(() => {
    if (eventSourceRef.current) {
      try {
        eventSourceRef.current.close();
      } catch (error) {
        console.debug('[VivlioDBG][BuildPdf] EventSource close error', error);
      }
      eventSourceRef.current = null;
    }
  }, []);

  const cleanupFetch = useCallback(() => {
    if (activeFetchRef.current) {
      try {
        activeFetchRef.current.abort();
      } catch (error) {
        console.debug('[VivlioDBG][BuildPdf] Abort controller error', error);
      }
      activeFetchRef.current = null;
    }
  }, []);

  const cleanupJobResources = useCallback(() => {
    cleanupEventSource();
    cleanupFetch();
  }, [cleanupEventSource, cleanupFetch]);

  useEffect(() => cleanupJobResources, [cleanupJobResources]);

  useEffect(() => () => {
    if (configCopyTimerRef.current) {
      window.clearTimeout(configCopyTimerRef.current);
      configCopyTimerRef.current = null;
    }
    if (logCopyTimerRef.current) {
      window.clearTimeout(logCopyTimerRef.current);
      logCopyTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    
    // Only run initial fetch on first open, not on markdown updates
    if (dialogOpenedOnce) return;
    setDialogOpenedOnce(true);
    
    // If markdown prop is empty or very short, try API fetch for raw markdown
    const shouldFetchFromApi = !markdown || markdown.trim().length < 50;
    
    if (shouldFetchFromApi) {
      console.info('[VivlioDBG][BuildPdf] Dialog opened with insufficient markdown, attempting API fetch');
      
      (async () => {
        try {
          const detectedContext = await detectGrowiContext();
          if (!detectedContext) {
            console.warn('[VivlioDBG][BuildPdf] Cannot detect GROWI context for API fetch');
            updateConfigPreview(markdown);
            return;
          }
          
          const pageInfo = await fetchGrowiPageInfo(detectedContext).catch(() => null);
          const effectiveContext = pageInfo
            ? { ...detectedContext, pagePath: pageInfo.pagePath ?? detectedContext.pagePath }
            : detectedContext;
          
          const fetchMarkdown = createGrowiMarkdownFetcher(effectiveContext);
          const pagePath = effectiveContext.pagePath ?? pageInfo?.pagePath ?? null;
          
          if (pagePath) {
            const fetched = await fetchMarkdown(pagePath);
            if (typeof fetched === 'string' && fetched.trim().length > 0) {
              console.info('[VivlioDBG][BuildPdf] API fetch on dialog open successful:', {
                length: fetched.length,
                hasConfig: /```\s*vivliostyle(?:-?config)/i.test(fetched),
              });
              forceUpdateMarkdown(fetched);
              updateConfigPreview(fetched);
              return;
            }
          }
        } catch (error) {
          console.error('[VivlioDBG][BuildPdf] API fetch on dialog open failed:', error);
        }
        
        // Fallback to original markdown
  updateConfigPreview(markdown);
      })();
    } else {
  updateConfigPreview(markdown);
    }
  }, [markdown, isOpen, updateConfigPreview, forceUpdateMarkdown]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const node = document.createElement('div');
    node.className = 'vivlio-buildpdf-portal-root';
    node.style.position = 'relative';
    node.style.zIndex = '1060';
    document.body.appendChild(node);
    portalRootRef.current = node;
    return () => {
      portalRootRef.current = null;
      if (node.parentElement) {
        node.parentElement.removeChild(node);
      }
    };
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent;
      console.debug('[VivlioDBG][BuildPdf] Open dialog event', custom.detail ?? null);
      let snapshotValue: string | null = null;
      try {
        const snapshot = readEditorMarkdownSnapshot();
        snapshotValue = snapshot;
        if (snapshot) {
          forceUpdateMarkdown(snapshot);
        }
      } catch (error) {
        console.debug('[VivlioDBG][BuildPdf] forceUpdateMarkdown snapshot error', error);
      }
      cleanupJobResources();
      pdfBlobRef.current = null;
      contextRef.current = null;
      pageInfoRef.current = null;
      if (configCopyTimerRef.current) {
        window.clearTimeout(configCopyTimerRef.current);
        configCopyTimerRef.current = null;
      }
      if (logCopyTimerRef.current) {
        window.clearTimeout(logCopyTimerRef.current);
        logCopyTimerRef.current = null;
      }
      setConfigCopied(false);
      setLogsCopied(false);
      setDialogOpenedOnce(false);
      setJobState(createInitialJobState());
      updateConfigPreview(snapshotValue ?? markdown);
      setIsOpen(true);
    };
    window.addEventListener('vivlio-build-pdf', handler as EventListener);
    return () => window.removeEventListener('vivlio-build-pdf', handler as EventListener);
  }, [cleanupJobResources, forceUpdateMarkdown, markdown, updateConfigPreview]);

  useEffect(() => {
    if (!autoScroll) return;
    const container = logContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [jobState.logs, autoScroll]);

  const isProcessing = PROCESSING_STAGES.includes(jobState.stage);

  const handleClose = useCallback(() => {
    cleanupJobResources();
    if (configCopyTimerRef.current) {
      window.clearTimeout(configCopyTimerRef.current);
      configCopyTimerRef.current = null;
    }
    if (logCopyTimerRef.current) {
      window.clearTimeout(logCopyTimerRef.current);
      logCopyTimerRef.current = null;
    }
    setConfigCopied(false);
    setLogsCopied(false);
    setDialogOpenedOnce(false);
    setIsOpen(false);
  }, [cleanupJobResources]);

  const handleSubmit = useCallback(async () => {
    if (isProcessing) {
      return;
    }
    cleanupJobResources();
    pdfBlobRef.current = null;
    contextRef.current = null;
    pageInfoRef.current = null;

    setJobState(() => ({
      ...createInitialJobState(),
      stage: 'preparing',
      submittedAt: Date.now(),
    }));

  // TOC-CSS feature removed: no capture variable needed

    try {
      const freshSnapshot = readEditorMarkdownSnapshot();
      if (freshSnapshot) {
        try {
          forceUpdateMarkdown(freshSnapshot);
        } catch (snapshotError) {
          console.debug('[VivlioDBG][BuildPdf] forceUpdateMarkdown failed', snapshotError);
        }
      }

      let sourceMarkdown = (markdown && markdown.trim().length > 0)
        ? markdown
        : freshSnapshot;

      // Capture TOC-CSS from initial markdown (before API fetch)
        if (sourceMarkdown) {
        // TOC-CSS extraction removed
      }

      console.info('[VivlioDBG][BuildPdf] Initial sourceMarkdown:', {
        fromMarkdownProp: !!(markdown && markdown.trim().length > 0),
        fromSnapshot: !!freshSnapshot,
        length: sourceMarkdown?.length || 0,
      });

      const detectedContext = await detectGrowiContext();
      if (!detectedContext) {
        throw new Error('Failed to detect GROWI context. Are you on an editable page?');
      }
      contextRef.current = detectedContext;

      const pageInfo = await fetchGrowiPageInfo(detectedContext).catch((error) => {
        console.debug('[VivlioDBG][BuildPdf] fetchGrowiPageInfo error', error);
        return null;
      });
      if (pageInfo) {
        pageInfoRef.current = pageInfo;
        contextRef.current = {
          ...detectedContext,
          pagePath: pageInfo.pagePath ?? detectedContext.pagePath,
          pageId: detectedContext.pageId ?? pageInfo.pageId ?? null,
          pageTitle: detectedContext.pageTitle ?? pageInfo.title ?? null,
        };
      }

      const effectiveContext = contextRef.current;
      if (!effectiveContext) {
        throw new Error('Failed to resolve page context.');
      }

      const fetchMarkdown = createGrowiMarkdownFetcher(effectiveContext);

      // Always try API fetch to ensure we have raw markdown with config blocks
      // (View mode doesn't have editor, so markdown prop may be empty or preprocessed)
      const fallbackPath = effectiveContext.pagePath ?? pageInfoRef.current?.pagePath ?? null;
      if (fallbackPath) {
        console.info('[VivlioDBG][BuildPdf] Attempting API fetch for raw markdown:', fallbackPath);
        try {
          const fetched = await fetchMarkdown(fallbackPath);
          if (typeof fetched === 'string' && fetched.trim().length > 0) {
            console.info('[VivlioDBG][BuildPdf] API fetch successful:', {
              length: fetched.length,
              hasConfigBlock: /```\s*vivliostyle(?:-?config)/i.test(fetched),
            });
            // Prefer API-fetched markdown if it has more content or has config block
            const hasConfigInFetched = /```\s*vivliostyle(?:-?config)/i.test(fetched);
            const hasConfigInSource = sourceMarkdown ? /```\s*vivliostyle(?:-?config)/i.test(sourceMarkdown) : false;
            
            if (!sourceMarkdown || hasConfigInFetched || fetched.length > sourceMarkdown.length) {
              sourceMarkdown = fetched;
              console.info('[VivlioDBG][BuildPdf] Using API-fetched markdown');
              try { 
                forceUpdateMarkdown(fetched);
                updateConfigPreview(fetched); // Update dialog display with fetched markdown
                
                // Extract CSS from fetched markdown and capture locally (state update is async!)
                // TOC-CSS extraction removed for API-fetched markdown
              } catch (syncError) {
                console.debug('[VivlioDBG][BuildPdf] forceUpdateMarkdown failed', syncError);
              }
            } else {
              console.info('[VivlioDBG][BuildPdf] Keeping original sourceMarkdown');
            }
          } else {
            console.warn('[VivlioDBG][BuildPdf] API fetch returned empty');
          }
        } catch (fallbackError) {
          console.error('[VivlioDBG][BuildPdf] API fetch error:', { fallbackPath, fallbackError });
        }
      } else {
        console.warn('[VivlioDBG][BuildPdf] No fallbackPath available for API fetch');
      }

      if (!sourceMarkdown || sourceMarkdown.trim().length === 0) {
        throw new Error('Markdown is empty. Unable to fetch content via GROWI API for this page.');
      }

      // Debug: Log markdown source to identify config block presence
      console.info('[VivlioDBG][BuildPdf] sourceMarkdown length:', sourceMarkdown.length);
      console.info('[VivlioDBG][BuildPdf] contains vivliostyleconfig:', /```\s*vivliostyle(?:-?config)/i.test(sourceMarkdown));

      const timestampSlug = buildTimestampSlug(new Date());
      const downloadFileName = buildDownloadFileName(
        effectiveContext.pageTitle ?? pageInfoRef.current?.title ?? null,
        effectiveContext.pagePath ?? pageInfoRef.current?.pagePath ?? null,
        timestampSlug,
      );
      const attachmentFileName = buildCacheAttachmentFileName(timestampSlug);
      pendingFileNamesRef.current = { download: downloadFileName, attachment: attachmentFileName };

      const client = await getSharedVfmClient();
      const payload = await buildVfmPayloadAsync(
        sourceMarkdown,
        {
          vivlioCssOptions: {
            currentPath: effectiveContext.pagePath ?? null,
            basePath: effectiveContext.basePath,
            fetchMarkdown,
          },
        },
        client as any,
      ) as VivlioPayload;
      console.info('[VivlioDBG][BuildPdf] payload.config:', payload.config);
      setConfigPreview(payload.config);

      const archive = await createArchiveWithConfigProcessing(
        payload,
        effectiveContext,
        pageInfoRef.current,
        attachmentFileName,
        downloadFileName,
      );
      setJobState((prev) => ({
        ...prev,
        stage: 'uploading',
        archiveSize: archive.blob.size,
      }));

      const submission = await submitArchive(
        archive.blob,
        effectiveContext,
        pageInfoRef.current,
        archive.configInfo,
        attachmentFileName,
      );
      setJobState((prev) => ({
        ...prev,
        stage: 'queued',
        jobId: submission.jobId,
        jobStatus: submission.status ?? 'queued',
        attachment: { status: 'pending', message: null },
      }));

      const logStream = openLogStream(
        effectiveContext,
        submission.jobId,
        {
          onLog: (entry) => {
            setJobState((prev) => ({
              ...prev,
              logs: [...prev.logs, entry].slice(-MAX_LOG_ENTRIES),
            }));
          },
          onStatus: (nextStatus) => {
            setJobState((prev) => ({
              ...prev,
              jobStatus: nextStatus,
              stage: nextStatus === 'running' ? 'running' : prev.stage,
            }));
          },
          onComplete: async (payload) => {
            cleanupEventSource();
            const status = payload?.status ?? 'failed';
            if (status !== 'succeeded') {
              const message = payload?.reason
                ? `Job ${status}: ${payload.reason}`
                : `Job ${status}.`;
              setJobState((prev) => ({
                ...prev,
                stage: 'failed',
                jobStatus: 'failed',
                error: message,
                completedAt: Date.now(),
              }));
              return;
            }

            try {
              setJobState((prev) => ({ ...prev, stage: 'receiving', jobStatus: 'succeeded' }));
              const pdfBlob = await fetchResultBlob(effectiveContext, submission.jobId, activeFetchRef);
              pdfBlobRef.current = pdfBlob;
              const pendingNames = pendingFileNamesRef.current;
              const fallbackTimestamp = buildTimestampSlug(new Date());
              const downloadFileName = pendingNames?.download ?? buildDownloadFileName(
                effectiveContext.pageTitle ?? pageInfoRef.current?.title ?? null,
                effectiveContext.pagePath ?? pageInfoRef.current?.pagePath ?? null,
                fallbackTimestamp,
              );
              const attachmentFileName = pendingNames?.attachment ?? buildCacheAttachmentFileName(fallbackTimestamp);
              const pageId = effectiveContext.pageId ?? pageInfoRef.current?.pageId ?? undefined;
              // Trigger browser download immediately with the human-friendly filename
              try {
                const safeName = sanitizeFilename(downloadFileName);
                triggerBrowserDownload(pdfBlob, safeName);
              } catch (e) {
                console.warn('[VivlioDBG][BuildPdf] Browser download failed', e);
              }
              // If we don't have a pageId, skip attaching but keep the PDF for download
              if (!pageId) {
                setJobState((prev) => ({
                  ...prev,
                  stage: 'succeeded',
                  completedAt: Date.now(),
                  error: null,
                  attachment: {
                    status: 'skipped',
                    message: 'PDF download ready. Attachment skipped (page ID not detected).',
                  },
                }));
                pendingFileNamesRef.current = null;
                return;
              }

              try {
                const attachResult = await attachPdfToGrowi(effectiveContext, pdfBlob, pageId, attachmentFileName);
                // Use server-provided attachment id (if any) when pruning old cache attachments
                const createdId = attachResult?.id ?? null;
                // For debugging, write attach response only to browser console (not visible in dialog)
                try {
                  const rawText = JSON.stringify(attachResult?.raw ?? attachResult, null, 2);
                  console.groupCollapsed && console.groupCollapsed('[VivlioDBG][Attach] attach response');
                  console.info('[VivlioDBG][Attach] attach response raw:', rawText.slice(0, 2000));
                  console.groupEnd && console.groupEnd();
                } catch (e) {
                  // ignore
                }

                // Prune strategy: since GROWI listing APIs don't return attachments in this environment,
                // we use localStorage to track the previous __CACHE__ attachment ID and delete it.
                // This ensures only one __CACHE__ file remains per page.
                let pruneResults: string[] = [];
                const storageKey = `vivlio-cache-attachment-${pageId}`;
                const previousId = localStorage.getItem(storageKey);
                
                if (previousId && createdId && previousId !== createdId) {
                  // Delete previous cache attachment using direct DELETE on the attachment resource
                  const csrf = readCsrfToken();
                  const csrfHeader = csrf ? { 'X-CSRF-Token': csrf } : undefined;
                  
                  // Try multiple delete endpoints to cover different GROWI versions
                  const deleteEndpoints = [
                    { method: 'DELETE', url: buildApiUrl(effectiveContext.origin, effectiveContext.basePath, `/attachments/${previousId}`, {}) },
                    { method: 'DELETE', url: buildApiUrl(effectiveContext.origin, effectiveContext.basePath, `/_api/attachments/${previousId}`, {}) },
                    { method: 'POST', url: buildApiUrl(effectiveContext.origin, effectiveContext.basePath, '/_api/attachments.remove', {}), body: JSON.stringify({ attachment_id: previousId, attachmentId: previousId }) },
                  ];
                  
                  let deleted = false;
                  for (const endpoint of deleteEndpoints) {
                    try {
                      const fetchOptions: RequestInit = {
                        method: endpoint.method,
                        credentials: 'same-origin',
                        headers: csrfHeader,
                      };
                      
                      if (endpoint.body && endpoint.method === 'POST') {
                        fetchOptions.headers = { ...csrfHeader, 'Content-Type': 'application/json' };
                        fetchOptions.body = endpoint.body;
                      }
                      
                      const res = await fetch(endpoint.url, fetchOptions);
                      if (res.ok) {
                        const msg = `deleted previous cache attachment ${previousId} via ${endpoint.method} ${endpoint.url}`;
                        console.info('[VivlioDBG][BuildPdf]', msg);
                        pruneResults.push(msg);
                        deleted = true;
                        break;
                      } else {
                        const txt = await res.text().catch(() => '');
                        pruneResults.push(`${endpoint.method} ${endpoint.url} => ${res.status} ${txt.slice(0,150)}`);
                      }
                    } catch (e) {
                      pruneResults.push(`${endpoint.method} ${endpoint.url} => error: ${String(e).slice(0,150)}`);
                    }
                  }
                  
                  if (!deleted) {
                    pruneResults.push(`Failed to delete previous attachment ${previousId} (tried ${deleteEndpoints.length} endpoints)`);
                  }
                } else if (!previousId) {
                  pruneResults.push('No previous cache attachment to delete (first build for this page)');
                } else if (previousId === createdId) {
                  pruneResults.push('Previous and current attachment IDs are the same (skipped delete)');
                }
                
                // Save current attachment ID to localStorage for next time
                if (createdId) {
                  localStorage.setItem(storageKey, createdId);
                  pruneResults.push(`Saved current attachment ID ${createdId} to localStorage`);
                } else {
                  pruneResults.push('Warning: No attachment ID returned from upload (cannot track for future prune)');
                }

                // If the upload response contains the page object with attachments,
                // prefer using that local list to prune instead of calling listing APIs.
                const raw = attachResult?.raw ?? null;
                const attachmentsFromUpload: any[] | null = (raw && (
                  raw?.data?.page?.attachments || raw?.page?.attachments || raw?.page?.revision?._attachments || raw?.data?.attachments || null
                )) || null;
                if (Array.isArray(attachmentsFromUpload) && attachmentsFromUpload.length > 0) {
                  // Inline prune using provided array
                  try {
                    for (const a of attachmentsFromUpload) {
                      const name = (a?.filename || a?.fileName || a?.originalName || a?.name || '').toString();
                      const id = a?._id || a?.id || a?.attachmentId || a?.attachment_id || null;
                      if (!name || !name.startsWith(CACHE_PREFIX)) continue;
                      if (name === attachmentFileName) continue; // keep new
                      if (createdId && id && createdId === id) continue;
                      // attempt delete by id
                      if (id) {
                        const delUrl = buildApiUrl(effectiveContext.origin, effectiveContext.basePath, `/attachments/${id}`, {} as Record<string,string>);
                        try {
                          const csrf = readCsrfToken();
                          const res = await fetch(delUrl, { method: 'DELETE', credentials: 'same-origin', headers: csrf ? { 'X-CSRF-Token': csrf } : undefined });
                          if (res.ok) {
                            const msg = `deleted (from upload list) ${name} ${id}`;
                            console.info('[VivlioDBG][BuildPdf]', msg);
                            pruneResults.push(msg);
                            continue;
                          }
                          const txt = await res.text().catch(() => '');
                          pruneResults.push(`delete (from upload list) ${delUrl} => ${res.status} ${txt.slice(0,200)}`);
                        } catch (e) {
                          pruneResults.push(`delete (from upload list) error ${String(e)}`);
                        }
                      } else {
                        pruneResults.push(`candidate for deletion (from upload list) found but no id: ${name}`);
                      }
                    }
                  } catch (e) {
                    pruneResults.push(`inline prune failed: ${String(e)}`);
                  }
                }
                // If inline prune produced nothing, fall back to network listing-based prune
                if (pruneResults.filter(r => r.includes('deleted')).length === 0 && !previousId) {
                  const fallback = await pruneOldCacheAttachments(effectiveContext, pageId, attachmentFileName, createdId);
                  pruneResults.push(...fallback);
                }
                
                // Prune results are useful for debugging but noisy for end-users.
                // Log detailed prune/debug info to the browser console only.
                try {
                  console.groupCollapsed && console.groupCollapsed('[VivlioDBG][Prune] Attachment prune details');
                  console.info('[VivlioDBG][Prune] Attachment ID:', createdId || '(none)');
                  console.info('[VivlioDBG][Prune] Cache filename:', attachmentFileName);
                  console.info('[VivlioDBG][Prune] Raw attach response sample:', JSON.stringify(attachResult?.raw || {}).slice(0, 1000));
                  for (const r of pruneResults) {
                    // use info for deletions, debug for verbose messages
                    if (r.includes('deleted')) console.info('[VivlioDBG][Prune]', r);
                    else console.debug('[VivlioDBG][Prune]', r);
                  }
                  console.groupEnd && console.groupEnd();
                } catch (e) {
                  // swallow console errors
                }
                setJobState((prev) => ({
                  ...prev,
                  stage: 'succeeded',
                  completedAt: Date.now(),
                  error: null,
                  attachment: {
                    status: 'success',
                    message: 'PDF attached to the page.',
                  },
                }));
              } catch (attachError) {
                console.warn('[VivlioDBG][BuildPdf] Attachment failed', attachError);
                setJobState((prev) => ({
                  ...prev,
                  stage: 'succeeded',
                  completedAt: Date.now(),
                  attachment: {
                    status: 'failed',
                    message: stringifyError(attachError),
                  },
                }));
              } finally {
                pendingFileNamesRef.current = null;
              }
            } catch (receiveError) {
              console.error('[VivlioDBG][BuildPdf] Result retrieval failed', receiveError);
              setJobState((prev) => ({
                ...prev,
                stage: 'failed',
                jobStatus: 'failed',
                error: stringifyError(receiveError),
                completedAt: Date.now(),
              }));
            }
          },
          onError: (error) => {
            console.warn('[VivlioDBG][BuildPdf] SSE error', error);
            cleanupEventSource();
            setJobState((prev) => {
              if (prev.stage === 'succeeded' || prev.stage === 'failed') return prev;
              return {
                ...prev,
                stage: 'failed',
                jobStatus: 'failed',
                error: 'Connection to log stream lost. Build status unknown.',
                completedAt: Date.now(),
              };
            });
          },
        },
      );
      eventSourceRef.current = logStream;
    } catch (error) {
      cleanupJobResources();
      setJobState((prev) => ({
        ...prev,
        stage: 'failed',
        jobStatus: 'failed',
        error: stringifyError(error),
        completedAt: Date.now(),
      }));
    }
  }, [cleanupEventSource, cleanupJobResources, forceUpdateMarkdown, isProcessing, markdown]);

  const stageLabel = useMemo(() => buildStageLabel(jobState.stage, jobState.jobStatus), [jobState.stage, jobState.jobStatus]);

  const summaryRows = useMemo(() => {
    const ctx = contextRef.current;
    const pagePath = ctx?.pagePath ?? pageInfoRef.current?.pagePath ?? 'Unknown';
    const pageTitle = ctx?.pageTitle ?? pageInfoRef.current?.title ?? null;
    return [
      { label: 'Page', value: `${pagePath}${pageTitle ? ` (${pageTitle})` : ''}` },
      { label: 'Stage', value: stageLabel },
      { label: 'Job ID', value: jobState.jobId ?? '?' },
      { label: 'Archive', value: formatBytes(jobState.archiveSize) },
      { label: 'Logs', value: `${jobState.logs.length}` },
    ];
  }, [jobState.archiveSize, jobState.jobId, jobState.logs.length, stageLabel]);

  const configInfo = configPreview;
  const configSourceLabel = configInfo.source === 'embedded' ? 'Embedded in markdown' : 'Auto-generated (doc.html)';
  const configRawForCopy = configInfo.raw ?? '';
  const handleConfigCopy = useCallback(() => {
    if (!configRawForCopy) return;
    try {
      navigator.clipboard?.writeText(configRawForCopy);
      setConfigCopied(true);
      if (configCopyTimerRef.current) window.clearTimeout(configCopyTimerRef.current);
      configCopyTimerRef.current = window.setTimeout(() => setConfigCopied(false), 1500);
    } catch (error) {
      console.warn('[VivlioDBG][BuildPdf] copy config failed', error);
    }
  }, [configRawForCopy]);
  const logsRawForCopy = useMemo(() => {
    if (!jobState.logs.length) return '';
    return jobState.logs
      .map((entry) => {
        const timestamp = entry.timestamp ? formatTimestamp(entry.timestamp) : '--:--:--';
        const level = (entry.level ?? 'info').toUpperCase();
        const message = entry.message ?? entry.raw ?? '';
        const details = entry.details ? ` ${safeStringify(entry.details)}` : '';
        return `[${timestamp}] ${level} ${message}${details}`.trimEnd();
      })
      .join('\n');
  }, [jobState.logs]);
  const handleLogCopy = useCallback(() => {
    if (!logsRawForCopy) return;
    try {
      navigator.clipboard?.writeText(logsRawForCopy);
      setLogsCopied(true);
      if (logCopyTimerRef.current) window.clearTimeout(logCopyTimerRef.current);
      logCopyTimerRef.current = window.setTimeout(() => setLogsCopied(false), 1500);
    } catch (error) {
      console.warn('[VivlioDBG][BuildPdf] copy logs failed', error);
    }
  }, [logsRawForCopy]);

  if (!isOpen || !portalRootRef.current) return null;

  return createPortal(
    <>
      <div className="modal vivlio-buildpdf-modal fade show" role="dialog" aria-modal="true" style={{ display: 'block', zIndex: 1060 }}>
        <div className="modal-dialog modal-lg modal-dialog-scrollable">
          <div className="modal-content">
            <div className="modal-header py-2 px-3">
              <h5 className="modal-title d-flex align-items-center gap-2 mb-0">
                <span className="material-symbols-outlined">picture_as_pdf</span>
                <span>Build PDF (Vivliostyle CLI)</span>
              </h5>
              <button type="button" className="btn btn-close" aria-label="Close" onClick={handleClose} />
            </div>
            <div className="modal-body grw-modal-body-style">
              <div className="mb-3">
                <table className="table table-sm table-borderless mb-0">
                  <tbody>
                    {summaryRows.map((row) => (
                      <tr key={row.label}>
                        <th scope="row" className="text-muted fw-normal small" style={{ width: '30%' }}>{row.label}</th>
                        <td className="small">{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {jobState.error && (
                <div className="alert alert-danger py-2 px-3 small mb-3">{jobState.error}</div>
              )}

              {jobState.attachment.status !== 'pending' && (
                <div
                  className={`alert py-2 px-3 small mb-3 ${
                    jobState.attachment.status === 'success'
                      ? 'alert-success'
                      : jobState.attachment.status === 'skipped'
                        ? 'alert-info'
                        : 'alert-warning'
                  }`}
                >
                  {jobState.attachment.message}
                </div>
              )}

              <div className="mb-3">
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <div className="d-flex align-items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-sm btn-link p-0 d-inline-flex align-items-center"
                      onClick={() => setConfigCollapsed((v) => !v)}
                      aria-expanded={!configCollapsed}
                      aria-controls="vivlio-buildpdf-config-panel"
                      title={configCollapsed ? 'Show config' : 'Hide config'}
                      style={{ lineHeight: 1 }}
                    >
                      {/* triangle toggle */}
                      <span className="vivlio-config-triangle" aria-hidden>
                        {configCollapsed ? '▸' : '▾'}
                      </span>
                    </button>
                    <span className="fw-semibold small">Config <span className="text-body-secondary small">({configSourceLabel})</span></span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-link btn-sm p-0"
                    onClick={handleConfigCopy}
                    disabled={!configRawForCopy}
                  >
                    {configCopied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                {!configCollapsed && (
                  <>
                    {configInfo?.parseError && (
                      <div className="alert alert-warning py-2 px-3 small mb-2">
                        Failed to parse config as JSON: {configInfo.parseError}
                      </div>
                    )}
                    <pre id="vivlio-buildpdf-config-panel" className="form-control form-control-sm vivlio-buildpdf-config-preview mb-0">
                      {configRawForCopy || '(empty)'}
                    </pre>
                  </>
                )}
              </div>

              {/* TOC-VivliostyleCSS section removed */}

              {/* Auto-scroll is always enabled; removed toggle from UI per request */}

              <div className="mb-3">
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <span className="fw-semibold small">Logs</span>
                  <button
                    type="button"
                    className="btn btn-link btn-sm p-0"
                    onClick={handleLogCopy}
                    disabled={!logsRawForCopy}
                  >
                    {logsCopied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <div className="vivlio-buildpdf-logarea border rounded bg-body-tertiary" ref={logContainerRef}>
                  {jobState.logs.length === 0 ? (
                    <div className="text-muted small">Awaiting log stream…</div>
                  ) : (
                    jobState.logs.map((entry, index) => {
                      const level = (entry.level ?? 'info').toLowerCase();
                      return (
                        <div
                          key={`${entry.timestamp ?? 'log'}-${index}`}
                          className={`vivlio-buildpdf-logline level-${level}`}
                        >
                          <span className="vivlio-buildpdf-logtime">
                            {entry.timestamp ? formatTimestamp(entry.timestamp) : '--:--:--'}
                          </span>
                          <span className="vivlio-buildpdf-loglevel">
                            {(entry.level ?? 'info').toUpperCase()}
                          </span>
                          <span className="vivlio-buildpdf-logmessage">
                            {entry.message ?? entry.raw ?? ''}
                            {entry.details ? (
                              <span className="vivlio-buildpdf-logdetails"> {safeStringify(entry.details)}</span>
                            ) : null}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          <div className="modal-footer py-2">
            <button
              type="button"
              className="btn btn-primary btn-sm d-inline-flex align-items-center gap-2"
              onClick={handleSubmit}
              disabled={isProcessing}
            >
              {isProcessing && (<span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />)}
              <span>
                {isProcessing
                  ? 'Building…'
                  : jobState.stage === 'succeeded'
                    ? 'Build Again'
                    : 'Submit'}
              </span>
            </button>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={handleClose}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show" style={{ zIndex: 1055 }} />
    </>,
    portalRootRef.current,
  );
};

export default BuildPdfDialog;

function buildStageLabel(stage: BuildStage, jobStatus: JobStatus): string {
  switch (stage) {
    case 'idle':
      return 'Ready';
    case 'preparing':
      return 'Preparing bundle';
    case 'uploading':
      return 'Uploading archive';
    case 'queued':
      return 'Queued';
    case 'running':
      return 'Running Vivliostyle CLI';
    case 'receiving':
      return 'Fetching PDF';
    case 'attaching':
      return 'Attaching to GROWI';
    case 'succeeded':
      return 'Completed';
    case 'failed':
      return jobStatus === 'failed' ? 'Failed' : 'Aborted';
    default:
      return stage;
  }
}

/**
 * Creates archive with GROWI link processing if config contains [[...]] links
 */
async function createArchiveWithConfigProcessing(
  payload: VivlioPayload,
  context: GrowiContext,
  pageInfo: GrowiPageInfo | null,
  cacheFileName: string,
  downloadFileName: string,
): Promise<{ blob: Blob; configInfo: VivlioConfigInfo | null }> {
  const configInfo = payload.config;
  
  // Check if config exists and is valid
  if (!configInfo || !configInfo.parsed || configInfo.parseError) {
    return createSourceArchive(payload, context, pageInfo, cacheFileName, downloadFileName);
  }
  
  // Check if config contains GROWI links
  const configStr = JSON.stringify(configInfo.parsed);
  if (!/\[\[.+?\]\]/.test(configStr)) {
    return createSourceArchive(payload, context, pageInfo, cacheFileName, downloadFileName);
  }
  
  console.info('[VivlioDBG][BuildPdf] Config contains GROWI links, processing...');
  
  const currentPagePath = context.pagePath ?? pageInfo?.pagePath ?? null;
  if (!currentPagePath) {
    console.warn('[VivlioDBG][BuildPdf] No page path available, falling back to standard archive');
    return createSourceArchive(payload, context, pageInfo, cacheFileName, downloadFileName);
  }
  
  const growiOrigin = context.origin ?? context.basePath;
  if (!growiOrigin) {
    console.warn('[VivlioDBG][BuildPdf] No GROWI origin available, falling back to standard archive');
    return createSourceArchive(payload, context, pageInfo, cacheFileName, downloadFileName);
  }
  
  try {
    const fetchMarkdown = createGrowiMarkdownFetcher(context);
    const result = await processConfigWithGrowiLinks(
      configInfo,
      context,
      {
        fetchMarkdown,
        vivlioCssOptions: {
          currentPath: currentPagePath,
          basePath: context.basePath,
          fetchMarkdown,
        },
      },
    );
    
    console.info('[VivlioDBG][BuildPdf] Successfully processed config with GROWI links:', {
      resolvedEntries: result.resolvedEntries.length,
      totalAssets: result.totalAssets,
    });
    
    return { blob: result.zipBlob, configInfo: result.processedConfig };
  } catch (error) {
    console.error('[VivlioDBG][BuildPdf] Error processing config with GROWI links:', error);
    // Fallback to standard archive on error
    return createSourceArchive(payload, context, pageInfo, cacheFileName, downloadFileName);
  }
}

async function createSourceArchive(
  payload: VivlioPayload,
  context: GrowiContext,
  pageInfo: GrowiPageInfo | null,
  cacheFileName: string,
  downloadFileName: string,
): Promise<{ blob: Blob; configInfo: VivlioConfigInfo | null }> {
  const zip = new JSZip();
  const offlineBundle = await collectAttachmentsForHtml(payload.html, context);
  zip.file('doc.html', offlineBundle.html);
  const assetsTotalBytes = offlineBundle.assets.reduce((sum, asset) => sum + asset.size, 0);
  if (offlineBundle.assets.length > 0) {
    console.info('[VivlioDBG][BuildPdf] Bundling attachment assets', {
      count: offlineBundle.assets.length,
      totalBytes: assetsTotalBytes,
    });
  }
  for (const asset of offlineBundle.assets) {
    try {
      zip.file(asset.localPath, asset.data, { binary: true });
    } catch (error) {
      console.error('[VivlioDBG][BuildPdf] Failed to include attachment asset', {
        localPath: asset.localPath,
        error,
      });
      throw error;
    }
  }
  const configInfo = payload.config;
  if (configInfo) {
    const configFileName = getConfigFileNameForInfo(configInfo);
    let configText: string | null = null;
    if (configInfo.format === 'js') {
      configText = configInfo.raw ?? null;
    } else if (configInfo.parseError == null && typeof configInfo.parsed !== 'undefined') {
      try {
        configText = JSON.stringify(configInfo.parsed, null, 2);
      } catch (error) {
        console.warn('[VivlioDBG][BuildPdf] Failed to serialise vivliostyle config to JSON', error);
      }
    }
    if (!configText && configInfo.raw) {
      configText = configInfo.raw;
    }
    if (configText) {
      zip.file(configFileName, ensureTrailingNewline(configText));
    }
  }
  const assetsSummary = {
    count: offlineBundle.assets.length,
    totalBytes: assetsTotalBytes,
  };
  const assetsForMetadata = offlineBundle.assets.map((asset) => ({
    originalUrl: asset.originalUrl,
    localPath: asset.localPath,
    fileName: asset.fileName,
    size: asset.size,
    contentType: asset.contentType,
    usage: asset.usage,
  }));
  const metadata = {
    pagePath: context.pagePath,
    pageId: context.pageId ?? pageInfo?.pageId ?? null,
    title: context.pageTitle ?? pageInfo?.title ?? null,
    generatedAt: new Date().toISOString(),
    dependencies: payload.dependencies ?? [],
    assets: assetsForMetadata,
    config: {
      source: configInfo?.source ?? 'generated',
      parseError: configInfo?.parseError ?? null,
    },
    runtime: {
      downloadFileName,
      attachmentFileName: cacheFileName,
      assets: assetsSummary,
    },
  };
  zip.file('metadata.json', JSON.stringify(metadata, null, 2));
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  return { blob, configInfo };
}

async function submitArchive(
  archiveBlob: Blob,
  context: GrowiContext,
  pageInfo: GrowiPageInfo | null,
  configInfo: VivlioConfigInfo | null,
  cacheFileName: string,
): Promise<{ jobId: string; status?: JobStatus }> {
  const url = buildApiUrl(context.origin, context.basePath, '/vivliostyle/jobs', {} as Record<string, string>);
  const base64 = await blobToBase64(archiveBlob);
  const pageId = context.pageId ?? pageInfo?.pageId ?? undefined;
  
  const cliOptions = {
    entry: ['doc.html'],
  };
  
  const payload = {
    jobId: createJobIdCandidate(pageId),
    sourceArchive: base64,
    metadata: {
      title: context.pageTitle ?? pageInfo?.title ?? undefined,
      pageId,
      pagePath: context.pagePath ?? pageInfo?.pagePath ?? undefined,
      source: 'json-base64',
      attachmentFileName: cacheFileName,
      config: {
        source: configInfo?.source ?? 'generated',
        parseError: configInfo?.parseError ?? null,
      },
    },
    cliOptions,
  };

  console.info('[VivlioDBG][BuildPdf] 📤 Submitting job payload:', {
    jobId: payload.jobId,
    cliOptions: payload.cliOptions,
  });

  const res = await fetch(url, {
    method: 'POST',
    body: JSON.stringify(payload),
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Job submission failed (${res.status}): ${text || res.statusText}`);
  }
  const json = await res.json().catch(() => null);
  const jobId = json?.jobId;
  if (!jobId) throw new Error('Job submission response missing jobId.');
  return { jobId: String(jobId), status: json?.status ?? 'queued' };
}

function openLogStream(
  context: GrowiContext,
  jobId: string,
  handlers: {
    onLog: (entry: RemoteLogEntry) => void;
    onStatus: (status: JobStatus) => void;
    onComplete: (payload: any) => void;
    onError: (error: unknown) => void;
  },
): EventSource {
  const url = buildApiUrl(
    context.origin,
    context.basePath,
    `/vivliostyle/jobs/${jobId}/log/stream`,
    {} as Record<string, string>,
  );
  const es = new EventSource(url);
  es.addEventListener('jobs', (event) => {
    const data = parseLogEvent((event as MessageEvent).data);
    handlers.onLog(data);
  });
  es.addEventListener('status', (event) => {
    try {
      const parsed = JSON.parse((event as MessageEvent).data);
      handlers.onStatus(parsed?.status ?? null);
    } catch (error) {
      console.warn('[VivlioDBG][BuildPdf] Failed to parse status event', error);
    }
  });
  es.addEventListener('complete', (event) => {
    try {
      const parsed = JSON.parse((event as MessageEvent).data || '{}');
      handlers.onComplete(parsed);
    } catch (error) {
      handlers.onError(error);
    }
  });
  es.onerror = (error) => handlers.onError(error);
  return es;
}

async function fetchResultBlob(
  context: GrowiContext,
  jobId: string,
  controllerRef: React.MutableRefObject<AbortController | null>,
): Promise<Blob> {
  const controller = new AbortController();
  controllerRef.current = controller;
  try {
    const url = buildApiUrl(
      context.origin,
      context.basePath,
      `/vivliostyle/jobs/${jobId}/result`,
      {} as Record<string, string>,
    );
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'same-origin',
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch PDF (${res.status}) ${res.statusText}`);
    }
    return await res.blob();
  } finally {
    if (controllerRef.current === controller) {
      controllerRef.current = null;
    }
  }
}

async function attachPdfToGrowi(
  context: GrowiContext,
  blob: Blob,
  pageId: string,
  fileName: string,
): Promise<{ id?: string | null; filename?: string | null; raw?: any } | void> {
  const csrf = readCsrfToken();
  const headers: Record<string, string> = {
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (csrf) headers['X-CSRF-Token'] = csrf;

  const tryUpload = async (endpoint: string, formBuilder: () => FormData) => {
    const url = buildApiUrl(context.origin, context.basePath, endpoint, {} as Record<string, string>);
    const res = await fetch(url, {
      method: 'POST',
      body: formBuilder(),
      credentials: 'same-origin',
      headers,
    });
    if (res.ok) return res;
    const text = await res.text().catch(() => '');
    const error = new Error(`Attachment failed (${res.status} @ ${endpoint}): ${text || res.statusText}`);
    (error as any).status = res.status;
    (error as any).body = text;
    (error as any).endpoint = endpoint;
    throw error;
  };

  const createFormDataV3 = () => {
    const form = new FormData();
    form.append('pageId', pageId);
    form.append('page_id', pageId);
    form.append('file', new File([blob], fileName, { type: 'application/pdf' }));
    form.append('fileName', fileName);
    return form;
  };

  const createFormDataV1 = () => {
    const form = new FormData();
    form.append('page_id', pageId);
    form.append('file', new File([blob], fileName, { type: 'application/pdf' }));
    return form;
  };

  try {
    const res = await tryUpload('/_api/v3/attachment', createFormDataV3);
    try {
      const json = await res.json().catch(() => null);
      // attempt to extract attachment metadata
      const attachObj = json?.data?.attachment || json?.attachment || json?.data || null;
      const id = attachObj?._id || attachObj?.id || attachObj?.attachmentId || attachObj?.attachment_id || null;
      const filename = attachObj?.filename || attachObj?.fileName || attachObj?.name || attachObj?.originalName || null;
      // Log upload response to help debug variations across GROWI versions
      try { console.info('[VivlioDBG][BuildPdf] attachPdfToGrowi v3 response', { endpoint: '/_api/v3/attachment', id, filename, raw: json }); } catch (e) { /* ignore */ }
      return { id: id ?? null, filename: filename ?? null, raw: json };
    } catch (e) {
      return { raw: null };
    }
  } catch (error) {
    const status = (error as any).status;
    const body = ((error as any).body || '') as string;
    if (
      status !== 404 &&
      status !== 405 &&
      !(status === 400 && /\bpage[_-]?id\b/i.test(body))
    ) {
      throw error;
    }
  }
  const res2 = await tryUpload('/_api/attachments.add', createFormDataV1);
  try {
    const json = await res2.json().catch(() => null);
    const attachObj = json?.data?.attachment || json?.attachment || json?.data || null;
    const id = attachObj?._id || attachObj?.id || attachObj?.attachmentId || attachObj?.attachment_id || null;
    const filename = attachObj?.filename || attachObj?.fileName || attachObj?.name || attachObj?.originalName || null;
    try { console.info('[VivlioDBG][BuildPdf] attachPdfToGrowi v1 response', { endpoint: '/_api/attachments.add', id, filename, raw: json }); } catch (e) { /* ignore */ }
    return { id: id ?? null, filename: filename ?? null, raw: json };
  } catch (e) {
    return { raw: null };
  }
}

function readCsrfToken(): string | null {
  const meta = document.querySelector('meta[name="csrf-token"]')
    ?? document.querySelector('meta[name="_csrf"]');
  if (meta && typeof meta.getAttribute === 'function') {
    const value = meta.getAttribute('content');
    if (value) return value;
  }
  const input = document.querySelector<HTMLInputElement>('input[name="_csrf"]');
  return input?.value ?? null;
}

function triggerBrowserDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const ANSI_SEQUENCE_REGEX = /\u001B\[[0-9;]*[A-Za-z]/g;

function stripAnsiSequences(value: string): string {
  return value.replace(ANSI_SEQUENCE_REGEX, '');
}

function parseLogEvent(data: string): RemoteLogEntry {
  if (!data) return { raw: '' };
  try {
    const parsed = JSON.parse(data);
    return {
      timestamp: typeof parsed?.timestamp === 'string' ? parsed.timestamp : undefined,
      level: typeof parsed?.level === 'string' ? stripAnsiSequences(parsed.level) : undefined,
      message: typeof parsed?.message === 'string' ? stripAnsiSequences(parsed.message) : undefined,
      details: typeof parsed?.details === 'string' ? stripAnsiSequences(parsed.details) : parsed?.details,
    };
  } catch (error) {
    return { raw: stripAnsiSequences(data) };
  }
}

function formatTimestamp(value: string): string {
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error('Invalid date');
    return date.toLocaleTimeString(undefined, { hour12: false });
  } catch {
    return value;
  }
}

function safeStringify(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = bytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function suggestPdfFileName(title: string | null, pagePath: string | null): string {
  const base = title || pagePath || 'vivliostyle-output';
  const safe = base
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 100);
  return `${safe || 'vivliostyle'}.pdf`;
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const commaIndex = result.indexOf(',');
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function createJobIdCandidate(pageId?: string): string | undefined {
  const base = pageId && pageId.trim().length > 0 ? pageId.trim() : undefined;
  const stamp = Math.floor(Date.now() / 1000);
  if (!base) return undefined;
  const normalized = base.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'job';
  return `${normalized}-${stamp}`;
}

// --- Filename and cache helpers -------------------------------------------------
function buildTimestampSlug(d: Date): string {
  const pad = (n: number, width = 2) => n.toString().padStart(width, '0');
  const Y = d.getFullYear();
  const M = pad(d.getMonth() + 1);
  const D = pad(d.getDate());
  const h = pad(d.getHours());
  const m = pad(d.getMinutes());
  const s = pad(d.getSeconds());
  return `${Y}${M}${D}${h}${m}${s}`;
}

function buildDownloadFileName(title: string | null, pagePath: string | null, timestampSlug: string): string {
  const base = title || pagePath || 'vivliostyle-output';
  const safe = base
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 100) || 'vivliostyle';
  return `${safe}_${timestampSlug}.pdf`;
}

function buildCacheAttachmentFileName(timestampSlug: string): string {
  return `${CACHE_PREFIX}${timestampSlug}.pdf`;
}

function sanitizeFilename(name: string): string {
  if (!name) return 'download.pdf';
  // Replace path separators and control characters
  return name
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 200) || 'download.pdf';
}

// Prune older attachments that start with CACHE_PREFIX except the keepFileName.
// This is best-effort: try multiple GROWI endpoints to list and remove attachments.
async function pruneOldCacheAttachments(context: GrowiContext, pageId: string, keepFileName: string, createdId: string | null = null): Promise<string[]> {
  const results: string[] = [];
  if (!pageId) return results;
  try {
    // Try v3 attachments listing
    const listUrls = [
      buildApiUrl(context.origin, context.basePath, '/_api/v3/attachments', { pageId }),
      buildApiUrl(context.origin, context.basePath, '/_api/attachments.list', { page_id: pageId }),
      buildApiUrl(context.origin, context.basePath, '/_api/attachments', { page_id: pageId }),
      buildApiUrl(context.origin, context.basePath, '/_api/pages.get', { page_id: pageId }),
    ];

    let attachments: Array<any> | null = null;

    for (const url of listUrls) {
      try {
        const res = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
        if (!res.ok) {
          results.push(`list endpoint ${url} => status ${res.status}`);
          continue;
        }
        const json = await res.json().catch(() => null);
        // Push raw json (truncated) into results for debugging/visibility in UI
        try {
          const rawText = JSON.stringify(json).slice(0, 2000);
          results.push(`list endpoint ${url} => ${rawText}`);
        } catch (e) {
          results.push(`list endpoint ${url} => <unserializable json>`);
        }
        // attempt to normalize attachments into an array
        let candidates: any = json?.data?.attachments || json?.attachments || json?.page?.attachments || json?.data || null;
        if (candidates && !Array.isArray(candidates) && typeof candidates === 'object') {
          candidates = Object.values(candidates);
        }
        if (Array.isArray(candidates) && candidates.length > 0) {
          attachments = candidates;
          break;
        }

        // Some endpoints return a page object containing attachments under revision._attachments
        const maybePage = json?.data?.page || json?.page || json;
        let maybeAttach: any = maybePage?.revision?._attachments || maybePage?.attachments || maybePage?._attachments || null;
        if (maybeAttach && !Array.isArray(maybeAttach) && typeof maybeAttach === 'object') {
          maybeAttach = Object.values(maybeAttach);
        }
        if (Array.isArray(maybeAttach) && maybeAttach.length > 0) { attachments = maybeAttach; break; }
      } catch (e) {
        // continue
      }
    }

    // If none of the list endpoints returned attachments, try fetching page detail explicitly
    if (!attachments || attachments.length === 0) {
      try {
        const pageUrl = buildApiUrl(context.origin, context.basePath, '/_api/v3/page', { pageId });
        const resPage = await fetch(pageUrl, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
        if (resPage.ok) {
          const jsonPage = await resPage.json().catch(() => null);
          const maybePage = jsonPage?.data?.page || jsonPage?.page || jsonPage;
          let maybeAttach: any = maybePage?.revision?._attachments || maybePage?.attachments || maybePage?._attachments || null;
          if (maybeAttach && !Array.isArray(maybeAttach) && typeof maybeAttach === 'object') {
            maybeAttach = Object.values(maybeAttach);
          }
          if (Array.isArray(maybeAttach) && maybeAttach.length > 0) {
            attachments = maybeAttach;
          }
        }
      } catch (e) {
        // ignore
      }
    }

    if (!attachments || attachments.length === 0) {
      results.push('No attachments found for pruning.');
      return results;
    }

    const toDelete = attachments.filter((a: any) => {
      const name = (a?.filename || a?.fileName || a?.name || a?.nameOnServer || '').toString();
      return name.startsWith(CACHE_PREFIX) && name !== keepFileName;
    });

    for (const a of toDelete) {
      const id = a?._id || a?.id || a?.attachmentId || a?.attachment_id || null;
      const name = (a?.filename || a?.fileName || a?.name || a?.nameOnServer || '').toString();
      // Try several removal endpoints
      // If createdId is provided and matches this attachment id, skip deleting
      if (createdId && id && createdId === id) continue;
      const csrf = readCsrfToken();
      const headersJson: Record<string, string> = { 'Content-Type': 'application/json' };
      if (csrf) headersJson['X-CSRF-Token'] = csrf;

      // Build a list of removal attempts. For POST endpoints, we'll try both
      // JSON and FormData payloads because different GROWI versions accept
      // different content types.
      const candidateEndpoints = [
        { method: 'POST', url: buildApiUrl(context.origin, context.basePath, '/_api/attachments.remove', {}) },
        { method: 'POST', url: buildApiUrl(context.origin, context.basePath, '/_api/attachment.remove', {}) },
        { method: 'POST', url: buildApiUrl(context.origin, context.basePath, '/_api/attachments.remove', {}) },
        { method: 'DELETE', url: id ? buildApiUrl(context.origin, context.basePath, `/attachments/${id}`, {}) : null },
        { method: 'DELETE', url: id ? buildApiUrl(context.origin, context.basePath, `/api/attachments/${id}`, {}) : null },
      ];

      let deleted = false;
      for (const cand of candidateEndpoints) {
        if (!cand.url) continue;
        try {
          // If it's a POST endpoint, first try JSON payload
            if (cand.method === 'POST') {
            try {
              const res = await fetch(cand.url, {
                method: 'POST',
                credentials: 'same-origin',
                headers: headersJson,
                body: JSON.stringify({ attachment_id: id, attachmentId: id, fileName: name }),
              });
              if (res.ok) { const msg = `deleted old cache attachment (json) ${name} ${id} via ${cand.url}`; console.info('[VivlioDBG][BuildPdf]', msg); results.push(msg); deleted = true; break; }
              const text = await res.text().catch(() => '');
              results.push(`delete (json) response ${cand.url} => ${res.status} ${text.slice(0, 200)}`);
              console.debug('[VivlioDBG][BuildPdf] delete (json) response', { url: cand.url, status: res.status, text: text.slice(0, 1000) });
            } catch (e) {
              console.debug('[VivlioDBG][BuildPdf] delete (json) error', { url: cand.url, error: e });
            }

            // Next try FormData variant
            try {
              const form = new FormData();
              // Some endpoints expect 'attachmentId' or 'attachment_id' as form fields
              form.append('attachment_id', id ?? '');
              form.append('attachmentId', id ?? '');
              form.append('fileName', name);
              const res2 = await fetch(cand.url, {
                method: 'POST',
                credentials: 'same-origin',
                body: form,
                // Do NOT set Content-Type header when sending FormData; the browser will set the boundary
                headers: csrf ? { 'X-CSRF-Token': csrf } : undefined,
              });
              if (res2.ok) { const msg = `deleted old cache attachment (form) ${name} ${id} via ${cand.url}`; console.info('[VivlioDBG][BuildPdf]', msg); results.push(msg); deleted = true; break; }
              const text2 = await res2.text().catch(() => '');
              results.push(`delete (form) response ${cand.url} => ${res2.status} ${text2.slice(0, 200)}`);
              console.debug('[VivlioDBG][BuildPdf] delete (form) response', { url: cand.url, status: res2.status, text: text2.slice(0, 1000) });
            } catch (e) {
              console.debug('[VivlioDBG][BuildPdf] delete (form) error', { url: cand.url, error: e });
            }
          } else {
            // DELETE by direct resource url
            try {
              const res = await fetch(cand.url, { method: 'DELETE', credentials: 'same-origin', headers: csrf ? { 'X-CSRF-Token': csrf } : undefined });
              if (res.ok) { const msg = `deleted old cache attachment (delete) ${name} ${id} via ${cand.url}`; console.info('[VivlioDBG][BuildPdf]', msg); results.push(msg); deleted = true; break; }
              const text = await res.text().catch(() => '');
              results.push(`delete (delete) response ${cand.url} => ${res.status} ${text.slice(0, 200)}`);
              console.debug('[VivlioDBG][BuildPdf] delete (delete) response', { url: cand.url, status: res.status, text: text.slice(0, 1000) });
            } catch (e) {
              console.debug('[VivlioDBG][BuildPdf] delete (delete) error', { url: cand.url, error: e });
              results.push(`delete (delete) error ${cand.url} => ${String(e)}`);
            }
          }
        } catch (e) {
          // ignore and try next
        }
      }
      if (!deleted) {
        const msg = `failed to delete cache attachment (best-effort) ${name} ${id}`;
        console.warn('[VivlioDBG][BuildPdf]', msg);
        results.push(msg);
      }
    }
  } catch (e) {
    const msg = `pruneOldCacheAttachments failed ${String(e)}`;
    console.warn('[VivlioDBG][BuildPdf]', msg);
    results.push(msg);
  }
  return results;
}


