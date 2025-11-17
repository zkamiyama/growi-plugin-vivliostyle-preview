import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { PageViewMode } from '@vivliostyle/core';
import type { ElementSize } from './useElementSize';
import type { SpreadMetrics } from './useSpreadMetrics';

interface Params {
  wrapperRef: RefObject<HTMLDivElement | null>;
  wrapperSize: ElementSize;
  spreadMetrics: SpreadMetrics;
  pageViewMode: PageViewMode;
  minScale: number;
}

export function useBaseScale({
  wrapperRef,
  wrapperSize,
  spreadMetrics,
  pageViewMode,
  minScale,
}: Params): number {
  const [baseScale, setBaseScale] = useState(1);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const width = spreadMetrics.width ?? null;
    const height = spreadMetrics.height ?? null;
    if (!wrapper || !width || !height || wrapperSize.width === 0 || wrapperSize.height === 0) {
      return;
    }

    const fitWidth = wrapperSize.width / Math.max(1, width);
    const fitHeight = wrapperSize.height / Math.max(1, height);
    const nextBase = Math.max(minScale, Math.min(1, Math.min(fitWidth, fitHeight)));

    console.debug('[VivlioDBG][baseScale] recompute', {
      wrapperSize,
      spread: { width, height },
      fitWidth,
      fitHeight,
      nextBase,
      pageViewMode,
    });

    setBaseScale((prev) => (Math.abs(prev - nextBase) <= 0.0001 ? prev : nextBase));
  }, [wrapperRef, wrapperSize.width, wrapperSize.height, spreadMetrics.width, spreadMetrics.height, pageViewMode, minScale]);

  return baseScale;
}
