import { useState, useRef, useCallback, useEffect } from 'react';
import { PageViewMode } from '@vivliostyle/core';

/**
 * Clean, from-scratch state management for Vivliostyle viewer
 * 
 * Key principles:
 * 1. Simple page normalization logic
 * 2. No complex timing hacks or suppression
 * 3. Direct state updates without intermediate refs
 */

interface UseVivlioViewerStateProps {
  initialPage?: number;
  pageViewMode: PageViewMode;
  readingDirection: 'ltr' | 'rtl';
}

export interface VivlioViewerState {
  page: number;
  pageCount: number | null;
  viewerReady: boolean;
  syncFromRenderer: (state: any) => void;
  resetState: () => void;
  nextPage: () => void;
  prevPage: () => void;
  goToPage: (targetPage: number) => void;
}

export function useVivlioViewerState({
  initialPage = 1,
  pageViewMode,
  readingDirection,
}: UseVivlioViewerStateProps): VivlioViewerState {
  const [page, setPage] = useState(initialPage);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [viewerReady, setViewerReady] = useState(false);

  // Reset state when critical props change
  useEffect(() => {
    console.log('[VivlioStateV2] Props changed - resetting:', { pageViewMode, readingDirection });
    setViewerReady(false);
    setPage(1);
    setPageCount(null);
  }, [pageViewMode, readingDirection]);

  const resetState = useCallback(() => {
    console.log('[VivlioStateV2] Manual reset');
    setViewerReady(false);
    setPage(1);
    setPageCount(null);
  }, []);

  /**
   * Normalize page number for current view mode
   * 
   * Rules:
   * - Page 1 is always page 1 (often cover/title page)
   * - In SPREAD mode with LTR: prefer odd pages (1, 3, 5, ...)
   * - In SPREAD mode with RTL: prefer even pages (2, 4, 6, ...)
   * - In SINGLE mode: use page as-is
   */
  const normalizePageForViewMode = useCallback((targetPage: number, totalPages: number | null): number => {
    if (pageViewMode === PageViewMode.SINGLE_PAGE) {
      // Single page mode - use as is
      const normalized = Math.max(1, Math.min(targetPage, totalPages || targetPage));
      console.log('[VivlioStateV2] Normalize SINGLE:', { targetPage, normalized });
      return normalized;
    }

    // Spread mode normalization
    if (targetPage === 1) {
      // Page 1 is always page 1
      console.log('[VivlioStateV2] Normalize SPREAD: page 1 stays as 1');
      return 1;
    }

    // For pages >= 2, align to proper spread boundary
    let normalized: number;
    
    if (readingDirection === 'ltr') {
      // LTR: prefer odd pages (1, 3, 5, ...)
      // If even, go to previous odd
      normalized = targetPage % 2 === 0 ? targetPage - 1 : targetPage;
    } else {
      // RTL: prefer even pages (2, 4, 6, ...)
      // If odd (and > 1), go to next even
      normalized = targetPage % 2 === 1 ? targetPage + 1 : targetPage;
    }

    // Clamp to valid range
    if (totalPages !== null) {
      normalized = Math.max(1, Math.min(normalized, totalPages));
    } else {
      normalized = Math.max(1, normalized);
    }

    console.log('[VivlioStateV2] Normalize SPREAD:', { 
      targetPage, 
      normalized, 
      readingDirection,
      isEven: targetPage % 2 === 0 
    });

    return normalized;
  }, [pageViewMode, readingDirection]);

  /**
   * Sync state from Renderer callbacks
   */
  const syncFromRenderer = useCallback((state: any) => {
    if (!state) {
      console.warn('[VivlioStateV2] syncFromRenderer: invalid state', state);
      return;
    }

    const {
      epageCount = null,
      epage = null,
      markReady = false,
      type = 'unknown',
    } = state;

    console.log('[VivlioStateV2] syncFromRenderer:', {
      type,
      epage,
      epageCount,
      markReady,
      currentPage: page,
      currentPageCount: pageCount,
    });

    // Update page count
    if (epageCount !== null && epageCount !== pageCount) {
      console.log('[VivlioStateV2] Page count updated:', epageCount);
      setPageCount(epageCount);
    }

    // Update page if provided and different
    if (epage !== null && epage !== page) {
      const normalizedPage = normalizePageForViewMode(epage, epageCount);
      if (normalizedPage !== page) {
        console.log('[VivlioStateV2] Page updated:', { from: page, to: normalizedPage });
        setPage(normalizedPage);
      }
    }

    // Mark viewer as ready when Renderer signals readiness
    if (markReady && !viewerReady) {
      console.log('[VivlioStateV2] Viewer marked ready');
      setViewerReady(true);
    }
  }, [page, pageCount, viewerReady, normalizePageForViewMode]);

  /**
   * Navigate to next page
   */
  const nextPage = useCallback(() => {
    const step = pageViewMode === PageViewMode.SPREAD ? 2 : 1;
    const targetPage = page + step;
    const maxPage = pageCount || 9999;
    
    if (targetPage <= maxPage) {
      const normalized = normalizePageForViewMode(targetPage, pageCount);
      console.log('[VivlioStateV2] nextPage:', { from: page, to: normalized, step });
      setPage(normalized);
    } else {
      console.log('[VivlioStateV2] nextPage: already at end', { page, maxPage });
    }
  }, [page, pageCount, pageViewMode, normalizePageForViewMode]);

  /**
   * Navigate to previous page
   */
  const prevPage = useCallback(() => {
    const step = pageViewMode === PageViewMode.SPREAD ? 2 : 1;
    const targetPage = page - step;
    
    if (targetPage >= 1) {
      const normalized = normalizePageForViewMode(targetPage, pageCount);
      console.log('[VivlioStateV2] prevPage:', { from: page, to: normalized, step });
      setPage(normalized);
    } else {
      console.log('[VivlioStateV2] prevPage: already at start', { page });
    }
  }, [page, pageCount, pageViewMode, normalizePageForViewMode]);

  /**
   * Navigate to specific page
   */
  const goToPage = useCallback((targetPage: number) => {
    const normalized = normalizePageForViewMode(targetPage, pageCount);
    console.log('[VivlioStateV2] goToPage:', { target: targetPage, normalized });
    setPage(normalized);
  }, [pageCount, normalizePageForViewMode]);

  return {
    page,
    pageCount,
    viewerReady,
    syncFromRenderer,
    resetState,
    nextPage,
    prevPage,
    goToPage,
  };
}
