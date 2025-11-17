import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { PageViewMode } from '@vivliostyle/core';
import type { ElementSize } from './useElementSize';
import type { SpreadMetrics } from './useSpreadMetrics';

interface Params {
  wrapperRef: RefObject<HTMLDivElement | null>;
  spacerRef: RefObject<HTMLDivElement | null>;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  wrapperSize: ElementSize;
  spreadMetrics: SpreadMetrics;
  appliedScale: number;
  pageViewMode: PageViewMode;
  baseScale: number;
  zoom: number;
  portalReady: boolean;
}

export function useScaledIframeLayout({
  wrapperRef,
  spacerRef,
  iframeRef,
  wrapperSize,
  spreadMetrics,
  appliedScale,
  pageViewMode,
  baseScale,
  zoom,
  portalReady,
}: Params) {
  const lastScaleRef = useRef(1);
  const lastLayoutRef = useRef({ width: 0, height: 0 });

  useEffect(() => {
    if (!portalReady) {
      lastScaleRef.current = appliedScale;
    }
  }, [portalReady, appliedScale]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const iframe = iframeRef.current;
    const spacer = spacerRef.current;
    if (!wrapper || !iframe || !spacer) return;

    const viewportWidth = wrapper.clientWidth || wrapperSize.width || 1;
    const viewportHeight = wrapper.clientHeight || wrapperSize.height || 1;

    let contentWidth = Math.max(1, spreadMetrics.width ?? (iframe.offsetWidth || 1));
    let contentHeight = Math.max(1, spreadMetrics.height ?? (iframe.offsetHeight || 1));

    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        const spreadEl = doc.querySelector('[data-vivliostyle-spread-container]') as HTMLElement | null
          || doc.querySelector('[data-vivliostyle-page-container]') as HTMLElement | null;
        if (spreadEl) {
          const rect = spreadEl.getBoundingClientRect();
          contentWidth = Math.max(1, Math.round(rect.width));
          contentHeight = Math.max(1, Math.round(rect.height));
        }
      }
    } catch (error) {
      /* ignore */
    }

    const SHELL_PADDING = 12;
    const intrinsicWidth = contentWidth + SHELL_PADDING * 2;
    const intrinsicHeight = contentHeight + SHELL_PADDING * 2;

    const scaleValue = appliedScale;
    const visualWidth = intrinsicWidth * scaleValue;
    const visualHeight = intrinsicHeight * scaleValue;

    const prevScrollLeft = wrapper.scrollLeft;
    const prevScrollTop = wrapper.scrollTop;
    const prevScrollWidth = wrapper.scrollWidth;
    const prevClientWidth = wrapper.clientWidth;
    const prevScrollHeight = wrapper.scrollHeight;
    const prevClientHeight = wrapper.clientHeight;

    const prevLeftRatio = prevScrollWidth > prevClientWidth
      ? prevScrollLeft / Math.max(1, prevScrollWidth - prevClientWidth)
      : 0;
    const prevTopRatio = prevScrollHeight > prevClientHeight
      ? prevScrollTop / Math.max(1, prevScrollHeight - prevClientHeight)
      : 0;

    const prevScale = lastScaleRef.current ?? scaleValue;
    const scaleChanged = Math.abs(prevScale - scaleValue) > 0.0001;

    const prevLayout = lastLayoutRef.current;
    const layoutChanged = Math.abs(prevLayout.width - visualWidth) > 0.5
      || Math.abs(prevLayout.height - visualHeight) > 0.5;

    let spacerWidth: number;
    let spacerHeight: number;
    let iframeLeft: number;
    let iframeTop: number;

    const fitsWidth = visualWidth <= viewportWidth;
    const fitsHeight = visualHeight <= viewportHeight;
    const fitsInViewport = fitsWidth && fitsHeight;

    const isZoomedPastFit = !fitsInViewport;
    const wasZoomedPastFit = prevLayout.width > viewportWidth + 0.5 || prevLayout.height > viewportHeight + 0.5;

    if (fitsInViewport) {
      spacerWidth = viewportWidth;
      spacerHeight = viewportHeight;
      iframeLeft = (viewportWidth - intrinsicWidth) / 2;
      iframeTop = (viewportHeight - intrinsicHeight) / 2;
    } else {
      spacerWidth = Math.max(visualWidth, viewportWidth);
      spacerHeight = Math.max(visualHeight, viewportHeight);
      iframeLeft = (spacerWidth - intrinsicWidth) / 2;
      iframeTop = (spacerHeight - intrinsicHeight) / 2;
    }

    spacer.style.width = `${Math.round(spacerWidth)}px`;
    spacer.style.height = `${Math.round(spacerHeight)}px`;
    spacer.style.position = 'relative';
    spacer.style.left = '0px';
    spacer.style.top = '0px';
    spacer.style.margin = '0px';
    spacer.style.padding = '0px';
    spacer.style.flexShrink = '0';
    spacer.style.minWidth = `${Math.round(spacerWidth)}px`;
    spacer.style.minHeight = `${Math.round(spacerHeight)}px`;

    iframe.style.width = `${Math.round(intrinsicWidth)}px`;
    iframe.style.height = `${Math.round(intrinsicHeight)}px`;
    iframe.style.position = 'absolute';
    iframe.style.left = `${Math.round(iframeLeft)}px`;
    iframe.style.top = `${Math.round(iframeTop)}px`;
    iframe.style.transform = `scale(${scaleValue})`;
    iframe.style.transformOrigin = 'center center';
    iframe.style.maxWidth = 'none';
    iframe.style.display = 'block';

    try {
      const willOverflowHoriz = visualWidth > wrapper.clientWidth + 0.5;
      const willOverflowVert = visualHeight > wrapper.clientHeight + 0.5;
      wrapper.style.overflow = (willOverflowHoriz || willOverflowVert) ? 'auto' : 'hidden';
    } catch (error) {
      /* ignore */
    }

    const applyScroll = () => {
      const maxLeft = Math.max(0, Math.round(spacerWidth) - wrapper.clientWidth);
      const maxTop = Math.max(0, Math.round(spacerHeight) - wrapper.clientHeight);

      console.debug('[VivlioDBG][applyScroll-instant]', {
        scaleValue,
        wasZoomedPastFit,
        isZoomedPastFit,
        prevLeftRatio,
        prevTopRatio,
        maxLeft,
        maxTop,
        spacerWidth,
        spacerHeight,
        wrapperClientWidth: wrapper.clientWidth,
        wrapperClientHeight: wrapper.clientHeight,
      });

      let targetLeft: number;
      let targetTop: number;

      if (!isZoomedPastFit) {
        targetLeft = 0;
        targetTop = 0;
      } else if (!wasZoomedPastFit) {
        targetLeft = Math.round(maxLeft * 0.5);
        targetTop = Math.round(maxTop * 0.5);
      } else if (scaleChanged) {
        targetLeft = Math.max(0, Math.min(maxLeft, Math.round(prevLeftRatio * maxLeft)));
        targetTop = Math.max(0, Math.min(maxTop, Math.round(prevTopRatio * maxTop)));
      } else {
        targetLeft = Math.round(prevLeftRatio * maxLeft);
        targetTop = Math.round(prevTopRatio * maxTop);
      }

      requestAnimationFrame(() => {
        try {
          wrapper.scrollLeft = targetLeft;
          wrapper.scrollTop = targetTop;
          wrapper.offsetHeight;
          iframe.style.transition = '';
          iframe.style.transform = `scale(${scaleValue})`;
        } catch (error) {
          console.warn('[VivlioDBG][applyScroll] write failed', error);
        }
      });
    };

    console.debug('[VivlioDBG][scaleApply]', {
      contentWidth,
      contentHeight,
      intrinsicWidth,
      intrinsicHeight,
      scaleValue,
      visualWidth,
      visualHeight,
      viewportWidth,
      viewportHeight,
      zoom,
      baseScale,
      appliedScale,
      iframeLeft,
      iframeTop,
      spacerWidth,
      spacerHeight,
      prevScale,
      wasZoomedPastFit,
      isZoomedPastFit,
      prevLeftRatio,
      prevTopRatio,
      wrapperClientWidth: wrapper.clientWidth,
      wrapperClientHeight: wrapper.clientHeight,
      wrapperScrollWidth: wrapper.scrollWidth,
      wrapperScrollHeight: wrapper.scrollHeight,
      wrapperOverflow: wrapper.style.overflow,
      iframeRect: (() => {
        try { return iframe.getBoundingClientRect(); } catch (err) { return null; }
      })(),
    });

    applyScroll();

    lastScaleRef.current = scaleValue;
    if (layoutChanged) {
      lastLayoutRef.current = { width: visualWidth, height: visualHeight };
    } else {
      lastLayoutRef.current = {
        width: visualWidth,
        height: visualHeight,
      };
    }
  }, [
    appliedScale,
    spreadMetrics.width,
    spreadMetrics.height,
    wrapperSize.width,
    wrapperSize.height,
    pageViewMode,
    zoom,
    baseScale,
    wrapperRef,
    iframeRef,
    spacerRef,
  ]);
}
