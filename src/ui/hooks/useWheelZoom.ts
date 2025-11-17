import { useEffect } from 'react';
import type { RefObject } from 'react';

const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];

function findClosestIndex(value: number) {
  let best = 0;
  let bestDiff = Math.abs(ZOOM_STEPS[0] - value);
  for (let i = 1; i < ZOOM_STEPS.length; i += 1) {
    const diff = Math.abs(ZOOM_STEPS[i] - value);
    if (diff < bestDiff) {
      best = i;
      bestDiff = diff;
    }
  }
  return best;
}

function getNextZoom(current: number, deltaY: number) {
  const idx = findClosestIndex(current);
  const nextIdx = deltaY < 0 ? Math.min(ZOOM_STEPS.length - 1, idx + 1) : Math.max(0, idx - 1);
  return ZOOM_STEPS[nextIdx];
}

interface Params {
  wrapperRef: RefObject<HTMLDivElement | null>;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  zoom: number;
  onZoomChange: (value: number) => void;
  showRaw: boolean;
}

export function useWheelZoom({ wrapperRef, iframeRef, zoom, onZoomChange, showRaw }: Params) {
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey) || showRaw) return;
      const target = event.target as Node | null;
      if (!target || !wrapper.contains(target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const nextZoom = getNextZoom(zoom, event.deltaY);
      if (nextZoom !== zoom) {
        onZoomChange(nextZoom);
      }
    };

    window.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => {
      window.removeEventListener('wheel', onWheel as any, { capture: true } as EventListenerOptions);
    };
  }, [wrapperRef, zoom, onZoomChange, showRaw]);

  useEffect(() => {
    const iframeWindow = iframeRef.current?.contentWindow ?? null;
    if (!iframeWindow) return;

    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey) || showRaw) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const nextZoom = getNextZoom(zoom, event.deltaY);
      if (nextZoom !== zoom) {
        onZoomChange(nextZoom);
      }
    };

    iframeWindow.addEventListener('wheel', onWheel as any, { passive: false, capture: true });
    return () => {
      iframeWindow.removeEventListener('wheel', onWheel as any, { capture: true } as EventListenerOptions);
    };
  }, [iframeRef, zoom, onZoomChange, showRaw]);
}
