import { useEffect, useRef, useState, useCallback } from 'react';
import { buildVfmPayloadAsync } from '../../vfm/buildVfmHtml';
import { getSharedVfmClient, resetSharedVfmClient } from '../../vfmWorkerClient';
import type { VivlioCssPreprocessOptions } from '../../vfm/vivlioCssPreprocessor';
import { clearVivlioCssCache } from '../../vfm/vivlioCssPreprocessor';
import { createGrowiMarkdownFetcher, detectGrowiContext, GrowiContext } from '../../utils/growi';
import type { VivlioConfigInfo } from '../../vfm/vivlioConfigPreprocessor';

const BUILD_TIMEOUT_MS = 15000;
const MAX_AUTO_RETRY = 2;
const AUTO_RETRY_BASE_DELAY_MS = 1500;
const AUTO_RETRY_MAX_DELAY_MS = 7000;

export interface VivlioPayload {
  rawMarkdown: string;
  userCss: string;
  finalCss: string;
  html: string;                 // CLI/PDF用: スクリプト付き
  htmlForIframe?: string;       // プラグインプレビュー用: スクリプト削除済み（オプショナル: 後方互換性）
  inlineScripts: string[];      // Extracted script code for direct execution
  dependencies: string[];       // List of page paths that were accessed for CSS
  config: VivlioConfigInfo;
}

export interface BuildErrorInfo {
  type: 'timeout' | 'worker-error';
  message: string;
  detail?: string;
  attempt: number;
  timestamp: number;
  autoRetryScheduled: boolean;
  nextRetryInMs?: number;
}

export interface UseVivlioBuildResult {
  payload: VivlioPayload | null;
  sourceUrl: string | null;
  isBuilding: boolean;
  buildStage: string | null;
  error: BuildErrorInfo | null;
  retryBuild: () => void;
  refreshDependencies: () => void; // Force refresh of all CSS dependencies
}

export function useVivlioBuild(markdown: string): UseVivlioBuildResult {
  const [payload, setPayload] = useState<VivlioPayload | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildStage, setBuildStage] = useState<string | null>(null);
  const [error, setError] = useState<BuildErrorInfo | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const lastBuiltHashRef = useRef<string | null>((globalThis as any).__vivlio_last_built_md_hash__ ?? null);
  const hasPayloadRef = useRef<boolean>(false);
  const jobIdRef = useRef(0);
  const idleHandleRef = useRef<number | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttemptRef = useRef(0);
  const growiContextRef = useRef<GrowiContext | null>(null);
  const fetchMarkdownRef = useRef<((path: string, ctx?: { basePath?: string }) => Promise<string | null>) | null>(null);
  const lastRefreshTriggerRef = useRef<number>(0);
  const progressUnsubRef = useRef<(() => void) | null>(null);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const settleMs = 1000;
    const ensureGrowiContext = async () => {
      try {
        const detected = await detectGrowiContext();
        if (!detected) return;
        const previous = growiContextRef.current;
        const needsRefresh = lastRefreshTriggerRef.current !== refreshTrigger;
        // Recreate fetcher if context changed OR if refresh was triggered
        if (!previous || previous.pagePath !== detected.pagePath || previous.basePath !== detected.basePath || previous.origin !== detected.origin || needsRefresh) {
          growiContextRef.current = detected;
          fetchMarkdownRef.current = createGrowiMarkdownFetcher(detected);
          lastRefreshTriggerRef.current = refreshTrigger;
        }
      } catch (e) { /* ignore */ }
    };

    const clearIdleHandle = () => {
      if (idleHandleRef.current === null) return;
      if (typeof (globalThis as any).cancelIdleCallback === 'function') {
        try { (globalThis as any).cancelIdleCallback(idleHandleRef.current); }
        catch (e) { clearTimeout(idleHandleRef.current); }
      } else {
        clearTimeout(idleHandleRef.current);
      }
      idleHandleRef.current = null;
    };

    const clearSettleTimer = () => {
      if (settleTimerRef.current !== null) {
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
    };

    const applyPayload = (next: VivlioPayload) => {
      const apply = () => {
        if (cancelled) return;
        clearRetryTimer();
        retryAttemptRef.current = 0;
        setError(null);
        setBuildStage(null);
        setPayload(next);
        hasPayloadRef.current = true;
        // プラグインプレビュー用にhtmlForIframe（スクリプト削除済み）を優先使用
        const htmlForViewer = next.htmlForIframe || next.html;
        const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(htmlForViewer)}`;
        setSourceUrl(dataUrl);
        try {
          const hash = hashString(markdown || '');
          lastBuiltHashRef.current = hash;
          (globalThis as any).__vivlio_last_built_md_hash__ = hash;
        } catch (e) { /* ignore */ }
        setIsBuilding(false);
        setBuildStage(null);
      };

      if (typeof (globalThis as any).requestIdleCallback === 'function') {
        try { (globalThis as any).requestIdleCallback(() => apply(), { timeout: 200 }); }
        catch (e) { setTimeout(apply, 50); }
      } else {
        setTimeout(apply, 50);
      }
    };

    const maybeSkip = () => {
      try {
        const currentHash = hashString(markdown || '');
        if (hasPayloadRef.current && lastBuiltHashRef.current && lastBuiltHashRef.current === currentHash) {
          setIsBuilding(false);
          setBuildStage(null);
          return true;
        }
      } catch (e) { /* ignore */ }
      return false;
    };

    const handleBuildFailure = (reason: 'timeout' | 'worker-error', rawError: unknown) => {
      if (cancelled) return;
      clearRetryTimer();
      setIsBuilding(false);
      setBuildStage(reason === 'timeout' ? 'timeout' : 'error');
      setSourceUrl(null);
      setPayload(null);
      hasPayloadRef.current = false;

      const attempt = retryAttemptRef.current + 1;
      retryAttemptRef.current = attempt;
      const detail = rawError instanceof Error ? rawError.message : (typeof rawError === 'string' ? rawError : undefined);
      const baseError: BuildErrorInfo = {
        type: reason,
        message: reason === 'timeout' ? 'Preview build timed out' : 'Preview build failed',
        detail,
        attempt,
        timestamp: Date.now(),
        autoRetryScheduled: false,
      };

      if (typeof console !== 'undefined' && console.error) {
        console.error('[VivlioDBG] Error building HTML (async worker):', rawError);
      }

      if (attempt <= MAX_AUTO_RETRY) {
        const delay = Math.min(AUTO_RETRY_BASE_DELAY_MS * attempt, AUTO_RETRY_MAX_DELAY_MS);
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null;
          setRefreshTrigger(prev => prev + 1);
        }, delay);

        setError({ ...baseError, autoRetryScheduled: true, nextRetryInMs: delay });
        return;
      }

      setError(baseError);
    };

    const runBuild = async () => {
      if (cancelled) return;
      if (!markdown) {
        setIsBuilding(false);
        setBuildStage(null);
        setError(null);
        return;
      }

      try {
        await ensureGrowiContext();
        const client = await getSharedVfmClient();
        if (progressUnsubRef.current) {
          try { progressUnsubRef.current(); } catch (e) { /* ignore */ }
          progressUnsubRef.current = null;
        }
        if (typeof (client as any)?.subscribeProgress === 'function') {
          progressUnsubRef.current = (client as any).subscribeProgress((payload: { stage: string; timestamp: number }) => {
            setBuildStage(payload.stage);
          });
        }
        if (cancelled) return;
        setBuildStage('worker:queued');
        clearRetryTimer();
        setError(null);
        const myJobId = ++jobIdRef.current;
        try { client?.cancelPending?.(); } catch (e) { /* ignore */ }
        const detectedContext = growiContextRef.current;
        let vivlioCssOptions: VivlioCssPreprocessOptions | undefined;
        if (detectedContext) {
          const nextOptions: VivlioCssPreprocessOptions = {
            currentPath: detectedContext.pagePath ?? null,
            basePath: detectedContext.basePath,
          };
          if (fetchMarkdownRef.current) {
            nextOptions.fetchMarkdown = fetchMarkdownRef.current;
          }
          vivlioCssOptions = nextOptions;
        }
        const payloadResult = await withTimeout(
          buildVfmPayloadAsync(
            markdown,
            vivlioCssOptions ? { vivlioCssOptions } : {},
            client as any
          ),
          BUILD_TIMEOUT_MS,
          () => {
            try { client?.cancelPending?.(); } catch (e) { /* ignore */ }
            try { client?.terminate?.(); } catch (e) { /* ignore */ }
            resetSharedVfmClient();
          }
        );
        if (cancelled) return;
        if (myJobId !== jobIdRef.current) {
          return;
        }
        applyPayload(payloadResult as VivlioPayload);
      } catch (error) {
        if (cancelled) return;
        const err = error as any;
        const timedOut = err && err.code === 'BUILD_TIMEOUT';
        if (timedOut) {
          resetSharedVfmClient();
        }
        handleBuildFailure(timedOut ? 'timeout' : 'worker-error', error);
      }
    };

    settleTimerRef.current = window.setTimeout(() => {
      if (cancelled) return;
      if (maybeSkip()) return;

      hasPayloadRef.current = false;
      setPayload(null);
      setSourceUrl(null);
      setIsBuilding(true);
      setBuildStage('scheduled');

      const triggerBuild = () => {
        idleHandleRef.current = null;
        runBuild();
      };

      if (typeof (globalThis as any).requestIdleCallback === 'function') {
        try {
          idleHandleRef.current = (globalThis as any).requestIdleCallback(() => triggerBuild(), { timeout: 1000 });
        } catch (e) {
          idleHandleRef.current = window.setTimeout(triggerBuild, 500) as unknown as number;
        }
      } else {
        idleHandleRef.current = window.setTimeout(triggerBuild, 500) as unknown as number;
      }
    }, settleMs);

    return () => {
      cancelled = true;
      hasPayloadRef.current = false;
      clearRetryTimer();
      clearSettleTimer();
      clearIdleHandle();
      if (progressUnsubRef.current) {
        try { progressUnsubRef.current(); } catch (e) { /* ignore */ }
        progressUnsubRef.current = null;
      }
      try {
        const shared = getSharedVfmClient();
        shared?.cancelPending?.();
      } catch (e) { /* ignore */ }
    };
  }, [markdown, refreshTrigger, clearRetryTimer]);

  const retryBuild = useCallback(() => {
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[VivlioDBG][build] manual retry requested');
    }
    clearRetryTimer();
    retryAttemptRef.current = 0;
    lastBuiltHashRef.current = null;
    hasPayloadRef.current = false;
    setError(null);
    setBuildStage('retry');
    setRefreshTrigger(prev => prev + 1);
  }, [clearRetryTimer]);

  const refreshDependencies = useCallback(() => {
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[VivlioDBG][refresh] Clearing CSS cache and triggering rebuild');
    }
    clearVivlioCssCache();
    retryBuild();
  }, [retryBuild]);

  return { payload, sourceUrl, isBuilding, buildStage, error, retryBuild, refreshDependencies };
}

function hashString(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) + value.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeout?: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
      if (settled) return;
      settled = true;
      onTimeout?.();
      const timeoutError = new Error(`build timed out after ${timeoutMs}ms`);
      (timeoutError as any).code = 'BUILD_TIMEOUT';
      reject(timeoutError);
    }, timeoutMs);

    promise
      .then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
  });
}
