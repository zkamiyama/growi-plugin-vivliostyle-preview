import { useCallback, useEffect, useRef, useState } from "react";
import { PageViewMode } from '@vivliostyle/core';

export interface ViewerStateHandlers {
  page: number;
  pageCount: number | null;
  viewerReady: boolean;
  gotoPage: (pageNumber: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  handleRendererLoad: (state: unknown) => void;
  handleRendererNavigation: (state: unknown) => void;
  reset: () => void;
  renderProgress: { page: number | null; pageCount: number | null; lastSource: 'load' | 'nav' | null };
  pageSourceRef: React.MutableRefObject<'user' | 'renderer'>;
}

type RendererState = {
  epage?: number;
  epageCount?: number;
  metadata?: unknown;
};

function coercePositiveInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : null;
}

export function useVivlioViewerState(
  pageViewMode: PageViewMode,
  readingDirection: 'ltr' | 'rtl' = 'ltr',
  savedPageOnMarkdownChangeRef?: React.MutableRefObject<number | null>
): ViewerStateHandlers {
  const [pageState, setPageState] = useState(1);
  const [pageCountState, setPageCountState] = useState<number | null>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [renderProgress, setRenderProgress] = useState<{ page: number | null; pageCount: number | null; lastSource: 'load' | 'nav' | null }>({ page: null, pageCount: null, lastSource: null });
  const pageCountRef = useRef<number | null>(null);
  const lastRendererPageRef = useRef<number | null>(null);
  const pageSourceRef = useRef<'user' | 'renderer'>('renderer');
  const lastUserNavTsRef = useRef<number | null>(null);
  const pendingSpreadAlignRef = useRef<number | null>(null);
  const modeSwitchSuppressRef = useRef<number | null>(null);
  const lastLoadTsRef = useRef<number | null>(null); // Track last handleRendererLoad call

  const applyPageCount = useCallback((value: number | null) => {
    pageCountRef.current = value;
    setPageCountState(value);
  }, []);

  const clampPage = useCallback((value: number, overrideCount?: number | null) => {
    const normalized = Math.max(1, Math.floor(value));
    const effectiveCount =
      typeof overrideCount === "number" && overrideCount > 0
        ? overrideCount
        : pageCountRef.current;
    if (typeof effectiveCount === "number" && effectiveCount > 0) {
      return Math.min(effectiveCount, normalized);
    }
    return normalized;
  }, []);

  const normalizeForViewMode = useCallback((value: number, overrideCount?: number | null) => {
    const clamped = clampPage(value, overrideCount);
    if (pageViewMode !== PageViewMode.SPREAD) {
      return clamped;
    }
    const effectiveCount =
      typeof overrideCount === "number" && overrideCount > 0
        ? overrideCount
        : pageCountRef.current ?? undefined;

    // In spread mode, page 1 is always allowed (cover page / explicit navigation)
    if (clamped === 1) {
      return 1;
    }

    if (readingDirection === 'rtl') {
      // RTL spread: even pages are left pages in spreads
      if (clamped % 2 === 0) {
        return clamped;
      }
      // Odd page (not 1): try to align to next even, or fall back to previous
      if (typeof effectiveCount === 'number' && clamped + 1 <= effectiveCount) {
        return clampPage(clamped + 1, effectiveCount);
      }
      return clampPage(clamped - 1, effectiveCount);
    }

    // LTR spread: odd pages (3, 5, 7...) are left pages in spreads
    // Even pages should align to previous odd (except when explicitly navigating)
    if (clamped % 2 === 0) {
      return clampPage(clamped - 1, effectiveCount);
    }
    return clamped;
  }, [clampPage, pageViewMode, readingDirection]);

  const syncFromRenderer = useCallback((rawState: RendererState, markReady: boolean, source: "load" | "nav") => {
    if (markReady) setViewerReady(true);

    const directCount = coercePositiveInt(rawState?.epageCount);
    const metadata = (rawState?.metadata ?? {}) as { pageCount?: number; currentPage?: number } | undefined;
    const metadataCount = coercePositiveInt(metadata?.pageCount);
    const candidateCount = directCount ?? metadataCount;

    if (
      candidateCount &&
      (pageCountRef.current === null || candidateCount >= pageCountRef.current)
    ) {
      applyPageCount(candidateCount);
    }

    const directPage = coercePositiveInt(rawState?.epage);
    const metadataPage = coercePositiveInt(metadata?.currentPage);
    const candidatePage = directPage ?? metadataPage;

    if (candidatePage !== null) {
      const resolved = clampPage(candidatePage, candidateCount);
      const normalized = normalizeForViewMode(resolved, candidateCount);
      const now = Date.now();
      const lastUserTs = lastUserNavTsRef.current ?? 0;
      const lastLoadTs = lastLoadTsRef.current ?? 0;
      const suppressionWindowMs = 400;
      
      // eslint-disable-next-line no-console
      if (source === 'nav') {
        console.debug('[VivlioDBG][preserve][hook] syncFromRenderer nav event', {
          candidatePage, resolved, normalized,
          now, lastUserTs, lastLoadTs,
          userDiff: lastUserTs ? now - lastUserTs : null,
          loadDiff: lastLoadTs ? now - lastLoadTs : null,
          mode: pageViewMode
        });
      }
      
      // If user recently navigated, ignore renderer nav (debounce user actions)
      if (source === 'nav' && lastUserTs && (now - lastUserTs) < suppressionWindowMs) {
        // eslint-disable-next-line no-console
        console.debug('[VivlioDBG][preserve][hook] ignoring nav event, user action too recent');
        return;
      }
      // If we recently loaded (including page restoration), ignore nav events briefly
      if (source === 'nav' && lastLoadTs && (now - lastLoadTs) < 1000) {
        // eslint-disable-next-line no-console
        console.debug('[VivlioDBG][preserve][hook] ignoring nav event, too soon after load', { now, lastLoadTs, diff: now - lastLoadTs });
        return;
      }
      // Additionally, if we are within a short window after a mode switch, ignore nav events
      if (source === 'nav' && modeSwitchSuppressRef.current) {
        return;
      }
      if (pendingSpreadAlignRef.current !== null) {
        if (normalized !== pendingSpreadAlignRef.current) {
          pendingSpreadAlignRef.current = null;
          return;
        }
        pendingSpreadAlignRef.current = null;
      }
      lastRendererPageRef.current = normalized;
      pageSourceRef.current = 'renderer';
      setRenderProgress({ page: normalized, pageCount: candidateCount ?? pageCountRef.current, lastSource: source });
      setPageState(normalized);
      return;
    }

    if (source === "load" && !viewerReady) {
      setPageState((prev) => {
        const resolved = clampPage(prev, candidateCount ?? undefined);
        const normalizedPrev = normalizeForViewMode(resolved, candidateCount);
        lastRendererPageRef.current = normalizedPrev;
        return normalizedPrev;
      });
    }
  }, [applyPageCount, clampPage, viewerReady, normalizeForViewMode]);

  const gotoPage = useCallback((pageNumber: number) => {
    lastUserNavTsRef.current = Date.now();
    pendingSpreadAlignRef.current = null;
    const target = normalizeForViewMode(pageNumber);
    pageSourceRef.current = 'user';
    setPageState(() => target);
  }, [normalizeForViewMode]);

  const nextPage = useCallback(() => {
    lastUserNavTsRef.current = Date.now();
    pendingSpreadAlignRef.current = null;
    setPageState((current) => {
      if (pageViewMode === PageViewMode.SPREAD) {
        // Special case: from page 1, go to the first spread (page 2 for LTR, page 2 or 3 for RTL)
        if (current === 1) {
          const next = readingDirection === 'rtl' ? normalizeForViewMode(2) : normalizeForViewMode(2);
          // eslint-disable-next-line no-console
          console.debug('[VivlioDBG][preserve][hook] nextPage called', {
            from: current, to: next, userNavTs: lastUserNavTsRef.current, mode: 'SPREAD'
          });
          pageSourceRef.current = 'user';
          return next;
        }
        // Normal case: advance by 2 pages
        const next = normalizeForViewMode(current + 2);
        // eslint-disable-next-line no-console
        console.debug('[VivlioDBG][preserve][hook] nextPage called', {
          from: current, to: next, userNavTs: lastUserNavTsRef.current, mode: 'SPREAD'
        });
        pageSourceRef.current = 'user';
        return next;
      }
      // Single page mode: advance by 1
      const next = normalizeForViewMode(current + 1);
      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG][preserve][hook] nextPage called', {
        from: current, to: next, userNavTs: lastUserNavTsRef.current, mode: 'SINGLE'
      });
      pageSourceRef.current = 'user';
      return next;
    });
  }, [normalizeForViewMode, pageViewMode, readingDirection]);

  const prevPage = useCallback(() => {
    lastUserNavTsRef.current = Date.now();
    pendingSpreadAlignRef.current = null;
    setPageState((current) => {
      if (pageViewMode === PageViewMode.SPREAD) {
        // From first spread (2-3 or 3-4), go back to page 1
        if (current <= 3) {
          // eslint-disable-next-line no-console
          console.debug('[VivlioDBG][preserve][hook] prevPage called', {
            from: current, to: 1, userNavTs: lastUserNavTsRef.current, mode: 'SPREAD'
          });
          pageSourceRef.current = 'user';
          return 1;
        }
        // Normal case: go back by 2 pages
        const next = normalizeForViewMode(current - 2);
        // eslint-disable-next-line no-console
        console.debug('[VivlioDBG][preserve][hook] prevPage called', {
          from: current, to: next, userNavTs: lastUserNavTsRef.current, mode: 'SPREAD'
        });
        pageSourceRef.current = 'user';
        return next;
      }
      // Single page mode: go back by 1
      const next = normalizeForViewMode(Math.max(1, current - 1));
      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG][preserve][hook] prevPage called', {
        from: current, to: next, userNavTs: lastUserNavTsRef.current, mode: 'SINGLE'
      });
      pageSourceRef.current = 'user';
      return next;
    });
  }, [normalizeForViewMode, pageViewMode]);

  const handleRendererLoad = useCallback((state: unknown) => {
    // Record load timestamp to suppress navigation events briefly
    lastLoadTsRef.current = Date.now();
    
    // Check if we need to restore a saved page
    const shouldRestore = savedPageOnMarkdownChangeRef?.current !== null && savedPageOnMarkdownChangeRef?.current !== undefined;
    const savedPage = shouldRestore ? savedPageOnMarkdownChangeRef!.current : null;
    if (shouldRestore) {
      savedPageOnMarkdownChangeRef!.current = null;
      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG][preserve][hook] will restore savedPage =', savedPage, 'skipping renderer page sync');
    }
    
    // Sync renderer state (this will update pageCount, but NOT page if we're restoring)
    const rawState = (state ?? {}) as RendererState;
    setViewerReady(true);

    // Extract and apply pageCount
    const directCount = coercePositiveInt(rawState?.epageCount);
    const metadata = (rawState?.metadata ?? {}) as { pageCount?: number; currentPage?: number } | undefined;
    const metadataCount = coercePositiveInt(metadata?.pageCount);
    const candidateCount = directCount ?? metadataCount;

    if (
      candidateCount &&
      (pageCountRef.current === null || candidateCount >= pageCountRef.current)
    ) {
      applyPageCount(candidateCount);
    }
    
    // If we're restoring a saved page, use that instead of renderer's page
    if (shouldRestore && savedPage !== null) {
      // Use requestAnimationFrame to ensure pageCount has been applied
      requestAnimationFrame(() => {
        const normalized = normalizeForViewMode(savedPage, candidateCount ?? undefined);
        // eslint-disable-next-line no-console
        console.debug('[VivlioDBG][preserve][hook] RAF: about to setPageState to', normalized, 'from savedPage =', savedPage, 'candidateCount =', candidateCount);
        setRenderProgress({ page: normalized, pageCount: candidateCount ?? pageCountRef.current, lastSource: 'load' });
        pageSourceRef.current = 'renderer';
        setPageState(normalized);
        lastRendererPageRef.current = normalized;
        // eslint-disable-next-line no-console
        console.debug('[VivlioDBG][preserve][hook] RAF: setPageState called, current state should be', normalized);
      });
      return;
    }
    
    // Otherwise, use renderer's page as normal
    const directPage = coercePositiveInt(rawState?.epage);
    const metadataPage = coercePositiveInt(metadata?.currentPage);
    const candidatePage = directPage ?? metadataPage;

    if (candidatePage !== null) {
      const resolved = clampPage(candidatePage, candidateCount);
      const normalized = normalizeForViewMode(resolved, candidateCount);
      lastRendererPageRef.current = normalized;
      setRenderProgress({ page: normalized, pageCount: candidateCount ?? pageCountRef.current, lastSource: 'load' });
      pageSourceRef.current = 'renderer';
      setPageState(normalized);
    }
  }, [normalizeForViewMode, savedPageOnMarkdownChangeRef, clampPage, applyPageCount]);

  const handleRendererNavigation = useCallback((state: unknown) => {
    syncFromRenderer((state ?? {}) as RendererState, false, "nav");
  }, [syncFromRenderer]);

  const reset = useCallback(() => {
    setViewerReady(false);
    setPageState(1);
    applyPageCount(null);
    lastRendererPageRef.current = null;
    pendingSpreadAlignRef.current = null;
    lastUserNavTsRef.current = null;
    setRenderProgress({ page: null, pageCount: null, lastSource: null });
    pageSourceRef.current = 'renderer';
  }, [applyPageCount]);

  // Removed useEffect([pageCountState, normalizeForViewMode, viewerReady]) that was
  // interfering with page restoration by normalizing the page after setPageState(savedPage).
  // Normalization is already handled in gotoPage, nextPage, prevPage, handleRendererLoad, and syncFromRenderer.

  useEffect(() => {
    // When the page view mode changes, suppress renderer "nav" events briefly to avoid
    // reacting to side-effect navigation notifications emitted during layout changes.
    if (modeSwitchSuppressRef.current) {
      try { clearTimeout(modeSwitchSuppressRef.current); } catch (e) { /* ignore */ }
      modeSwitchSuppressRef.current = null;
    }
    modeSwitchSuppressRef.current = window.setTimeout(() => {
      modeSwitchSuppressRef.current = null;
    }, 500);
  }, [pageViewMode]);

  return {
    page: pageState,
    pageCount: pageCountState,
    viewerReady,
    gotoPage,
    nextPage,
    prevPage,
    handleRendererLoad,
    handleRendererNavigation,
    reset,
    renderProgress,
    pageSourceRef,
  };
}
