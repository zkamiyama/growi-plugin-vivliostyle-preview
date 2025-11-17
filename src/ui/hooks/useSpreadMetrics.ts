import { MutableRefObject, useEffect, useRef, useState } from "react";
import { PageViewMode } from "@vivliostyle/core";

export interface SpreadMetrics {
  width: number | null;
  height: number | null;
}

const SPREAD_SELECTOR = "[data-vivliostyle-spread-container], [data-vivliostyle-page-container], .page";

function approximatelyEqual(a: number, b: number, epsilon = 0.5) {
  return Math.abs(a - b) <= epsilon;
}

function pickSpread(doc: Document | null): HTMLElement | null {
  if (!doc) return null;
  try {
    // Prefer the explicit spread container when present (covers two-page spread)
    const spread = doc.querySelector('[data-vivliostyle-spread-container]') as HTMLElement | null;
    if (spread) return spread;
    const pageContainer = doc.querySelector('[data-vivliostyle-page-container]') as HTMLElement | null;
    if (pageContainer) return pageContainer;
    // Fallback to a single page element
    return doc.querySelector('.page') as HTMLElement | null;
  } catch (e) {
    return null;
  }
}

export function useSpreadMetrics(
  portalContainer: HTMLElement | null,
  page: number,
  pageViewMode: PageViewMode,
  readingDirection: "ltr" | "rtl",
  iframeRef: MutableRefObject<HTMLIFrameElement | null>
): SpreadMetrics {
  const [metrics, setMetrics] = useState<SpreadMetrics>({ width: null, height: null });
  const observedSpreadRef = useRef<HTMLElement | null>(null);
  void readingDirection;

  useEffect(() => {
    const iframe = iframeRef.current;
    const doc = portalContainer?.ownerDocument ?? iframe?.contentDocument ?? null;
    const win = doc?.defaultView ?? null;
    if (!doc || !win) {
      observedSpreadRef.current = null;
      setMetrics({ width: null, height: null });
      return () => {};
    }

    let resizeObserver: ResizeObserver | null = null;
    let pollHandle: number | null = null;

    const updateFromNode = (node: HTMLElement | null) => {
      if (!node) {
        setMetrics((prev) => (prev.width === null && prev.height === null ? prev : { width: null, height: null }));
        return null;
      }
      try {
        const rect = node.getBoundingClientRect();
        const nextWidth = Math.max(1, Math.round(rect.width));
        const nextHeight = Math.max(1, Math.round(rect.height));
        setMetrics((prev) => {
          if (
            prev.width !== null &&
            prev.height !== null &&
            approximatelyEqual(prev.width, nextWidth) &&
            approximatelyEqual(prev.height, nextHeight)
          ) {
            return prev;
          }
          return { width: nextWidth, height: nextHeight };
        });
      } catch (e) {
        /* ignore */
      }
      return node;
    };

    const ensureObserver = (spread: HTMLElement | null) => {
      if (observedSpreadRef.current === spread) {
        return;
      }
      if (resizeObserver && observedSpreadRef.current) {
        try {
          resizeObserver.unobserve(observedSpreadRef.current);
        } catch (e) {
          /* ignore */
        }
      }
      observedSpreadRef.current = spread;
      if (!spread) {
        return;
      }
      if (typeof ResizeObserver !== "undefined") {
        if (!resizeObserver) {
          resizeObserver = new ResizeObserver(() => {
            updateFromNode(spread);
          });
        }
        try {
          resizeObserver.observe(spread);
        } catch (e) {
          try { resizeObserver.disconnect(); } catch (err) { /* ignore */ }
          resizeObserver = null;
        }
      }
    };

    const refresh = () => {
      const spread = updateFromNode(pickSpread(doc));
      ensureObserver(spread);
    };

    refresh();

    pollHandle = win.setInterval(refresh, 250);

    return () => {
      if (pollHandle !== null) {
        win.clearInterval(pollHandle);
      }
      if (resizeObserver) {
        try {
          resizeObserver.disconnect();
        } catch (e) {
          /* ignore */
        }
        resizeObserver = null;
      }
      observedSpreadRef.current = null;
    };
  }, [portalContainer, page, pageViewMode, readingDirection, iframeRef]);

  return metrics;
}
