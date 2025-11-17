import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { PageViewMode } from '@vivliostyle/core';

export function useIframeOverlay(
  portalContainer: HTMLElement | null,
  page: number,
  readingDirection: 'ltr' | 'rtl',
  pageViewMode: PageViewMode,
  iframeRef: RefObject<HTMLIFrameElement | null>,
) {
  const overlayRef = useRef<HTMLElement | null>(null);
  const iframeStyleRef = useRef<HTMLStyleElement | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const listenersAttachedRef = useRef(false);
  const transparentAppliedRef = useRef<HTMLElement[] | null>(null);
  const updateOverlayRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let currentWin: Window | null = null;
    let cancelPolling: (() => void) | null = null;
    let currentUpdate: (() => void) | null = null;

    const cleanup = () => {
      try {
        if (cancelPolling) {
          try { cancelPolling(); } catch (error) { /* ignore */ }
          cancelPolling = null;
        }
        if (roRef.current) {
          try { roRef.current.disconnect(); } catch (error) { /* ignore */ }
          roRef.current = null;
        }
        if (overlayRef.current?.parentElement) {
          overlayRef.current.parentElement.removeChild(overlayRef.current);
          overlayRef.current = null;
        }
        if (iframeStyleRef.current?.parentElement) {
          iframeStyleRef.current.parentElement.removeChild(iframeStyleRef.current);
          iframeStyleRef.current = null;
        }
        if (listenersAttachedRef.current && currentWin && currentUpdate) {
          try { currentWin.removeEventListener('scroll', currentUpdate, true); } catch (error) { /* ignore */ }
          try { currentWin.removeEventListener('resize', currentUpdate); } catch (error) { /* ignore */ }
          listenersAttachedRef.current = false;
        }
        if (transparentAppliedRef.current) {
          try { transparentAppliedRef.current.forEach((el) => el.classList.remove('vivlio--ancestor-transparent')); } catch (error) { /* ignore */ }
          transparentAppliedRef.current = null;
        }
      } catch (error) { /* ignore */ }
      updateOverlayRef.current = null;
      currentUpdate = null;
    };

    if (!portalContainer) {
      cleanup();
      return () => {};
    }

    const doc = portalContainer.ownerDocument as Document | null;
    const win = doc?.defaultView ?? null;
    currentWin = win;
    if (!doc) {
      cleanup();
      return () => {};
    }

    try {
      let styleEl = doc.getElementById('vivlio-isolation-style') as HTMLStyleElement | null;
      if (!styleEl) {
        styleEl = doc.createElement('style');
        styleEl.id = 'vivlio-isolation-style';
        doc.head.appendChild(styleEl);
      }
      let cssContent = `
        .vivlio--ancestor-transparent{ background: transparent !important; overflow: visible !important }
        #vivlio-bleed-shadow{ position:absolute; pointer-events:none; z-index:1050; opacity:0.98; border-radius:6px }
        #vivlio-root { transform-origin: center center; }
      `;
      if (pageViewMode === PageViewMode.SPREAD && readingDirection === 'rtl') {
        cssContent += `
          [data-vivliostyle-spread-container] { flex-direction: row-reverse; }
        `;
      }
      styleEl.textContent = cssContent;
      iframeStyleRef.current = styleEl;
    } catch (error) {
      console.warn('[VivlioDBG] inject style failed', error);
    }

    try {
      let overlay = doc.getElementById('vivlio-bleed-shadow') as HTMLElement | null;
      if (!overlay) {
        overlay = doc.createElement('div');
        overlay.id = 'vivlio-bleed-shadow';
        doc.body.appendChild(overlay);
      }
      overlayRef.current = overlay;
    } catch (error) {
      console.warn('[VivlioDBG] create overlay failed', error);
    }

    const getSpread = (): HTMLElement | null => {
      try {
        return doc.querySelector('[data-vivliostyle-spread-container], [data-vivliostyle-page-container], .page') as HTMLElement | null;
      } catch (error) {
        return null;
      }
    };

    const applyAncestorTransparency = (spread: HTMLElement | null) => {
      try {
        if (!spread) return;
        if (transparentAppliedRef.current) {
          try { transparentAppliedRef.current.forEach((el) => el.classList.remove('vivlio--ancestor-transparent')); } catch (error) { /* ignore */ }
        }
        const list: HTMLElement[] = [];
        let cursor: HTMLElement | null = spread.parentElement;
        while (cursor && cursor !== doc.documentElement) {
          const current = cursor;
          try {
            const styles = (doc.defaultView?.getComputedStyle(current) as CSSStyleDeclaration) || window.getComputedStyle(current);
            if (!styles) {
              cursor = current.parentElement;
              continue;
            }
            const hasBackground = styles.backgroundColor && styles.backgroundColor !== 'rgba(0, 0, 0, 0)' && styles.backgroundColor !== 'transparent';
            const hidesOverflow = styles.overflow === 'hidden';
            const hasTransform = styles.transform && styles.transform !== 'none';
            if (hasBackground || hidesOverflow || hasTransform) {
              current.classList.add('vivlio--ancestor-transparent');
              list.push(current);
            }
          } catch (error) { /* ignore */ }
          cursor = current.parentElement;
        }
        transparentAppliedRef.current = list;
      } catch (error) { /* ignore */ }
    };

    const updateOverlay = () => {
      try {
        const overlay = overlayRef.current;
        const spread = getSpread();
        if (!overlay) return;
        if (!spread) {
          overlay.style.opacity = '0';
          return;
        }
        applyAncestorTransparency(spread);
        const rect = spread.getBoundingClientRect();
        const left = rect.left + (win?.scrollX || 0);
        const top = rect.top + (win?.scrollY || 0);
        overlay.style.left = `${Math.max(0, left)}px`;
        overlay.style.top = `${Math.max(0, top)}px`;
        overlay.style.width = `${Math.max(0, rect.width)}px`;
        overlay.style.height = `${Math.max(0, rect.height)}px`;
        overlay.style.opacity = '0.98';
      } catch (error) {
        console.warn('[VivlioDBG] updateOverlay error', error);
      }
    };

    currentUpdate = updateOverlay;
    updateOverlayRef.current = updateOverlay;

    const startPolling = () => {
      let attempts = 0;
      const maxAttempts = 30;
      const pollInterval = 200;
      const handle = window.setInterval(() => {
        attempts += 1;
        const spread = getSpread();
        if (spread) {
          try {
            if ('ResizeObserver' in window) {
              const ro = new ResizeObserver(updateOverlay);
              try { ro.observe(spread); } catch (error) { ro.disconnect(); }
              roRef.current = ro;
            }
            if (win && !listenersAttachedRef.current) {
              try { win.addEventListener('scroll', updateOverlay, true); } catch (error) { /* ignore */ }
              try { win.addEventListener('resize', updateOverlay); } catch (error) { /* ignore */ }
              listenersAttachedRef.current = true;
            }
            setTimeout(updateOverlay, 80);
          } catch (error) {
            console.warn('[VivlioDBG] setup observers failed', error);
          }
          window.clearInterval(handle);
        } else if (attempts >= maxAttempts) {
          window.clearInterval(handle);
        }
      }, pollInterval);
      return () => window.clearInterval(handle);
    };

    cancelPolling = startPolling();

    return () => {
      cleanup();
    };
  }, [portalContainer, pageViewMode, readingDirection, iframeRef]);

  useEffect(() => {
    updateOverlayRef.current?.();
  }, [page]);
}
