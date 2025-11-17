import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PageViewMode } from '@vivliostyle/core';
import { createPortal } from 'react-dom';
import { Renderer } from '@vivliostyle/react';
import { VivlioPayload, BuildErrorInfo } from '../hooks/useVivlioBuild';
import { useElementSize } from '../hooks/useElementSize';
import { useSpreadMetrics } from '../hooks/useSpreadMetrics';

interface VivlioViewerFrameProps {
  payload: VivlioPayload | null;
  sourceUrl: string | null;
  showRaw: boolean;
  gutterColor: string;
  page: number;
  onRendererLoad: (state: unknown) => void;
  onRendererNavigation?: (state: unknown) => void;
  onReset: () => void;
  viewerReady: boolean;
  isBuilding: boolean;
  pageViewMode?: PageViewMode;
  readingDirection?: 'ltr' | 'rtl';
  pageCount: number | null;
  zoom: number;
  onZoomChange: (newZoom: number) => void;
  error?: BuildErrorInfo | null;
  onRetry?: () => void;
}

export const VivlioViewerFrame: React.FC<VivlioViewerFrameProps> = ({
  payload,
  sourceUrl,
  showRaw,
  gutterColor,
  page,
  onRendererLoad,
  onRendererNavigation,
  onReset,
  viewerReady,
  isBuilding,
  pageViewMode = PageViewMode.SINGLE_PAGE,
  readingDirection = 'ltr',
  pageCount,
  zoom,
  onZoomChange,
  error,
  onRetry,
}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const spacerRef = useRef<HTMLDivElement | null>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const [baseScale, setBaseScale] = useState(1);
  const lastScaleRef = useRef(1);
  const lastLayoutRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  
  const MIN_SCALE = 0.05;
  // measure the actual preview viewport (wrapperRef is the scroll container)
  const wrapperSize = useElementSize(wrapperRef as any);
  const spreadMetrics = useSpreadMetrics(portalContainer, page, pageViewMode, readingDirection, iframeRef);
  const appliedScale = Math.max(MIN_SCALE, zoom * baseScale);

  const handleIframeLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;
      let mount = doc.getElementById('vivlio-root') as HTMLElement | null;
      if (!mount) {
        mount = doc.createElement('div');
        mount.id = 'vivlio-root';
        doc.body.appendChild(mount);
      }
      setPortalContainer(mount);
      onReset();
    } catch (e) {
      console.warn('[VivlioDBG] iframe onLoad mount failed', e);
      setPortalContainer(null);
    }
  }, [onReset]);

  // Wrapped onRendererLoad to restore position after Renderer finishes loading
  const handleRendererLoad = useCallback((state: unknown) => {
    onRendererLoad(state);
    
    // Renderer完了後、iframe内のDOMに<script>タグを直接挿入して実行
    // 注: @vivliostyle/reactは about:srcdoc を使うため、iframe内スクリプトは
    // 親ウィンドウと同一オリジン扱いになる。完全分離は原理的に不可能。
    // ユーザースクリプトには「iframe内のDOMのみ操作する」ことを期待する。
    if (payload?.inlineScripts && payload.inlineScripts.length > 0) {
      console.debug(`[VivlioDBG] Executing ${payload.inlineScripts.length} inline scripts from payload`);
      
      const shellIframe = iframeRef.current;
      if (!shellIframe?.contentWindow) {
        console.warn('[VivlioDBG] Cannot execute scripts: no iframe contentWindow');
        return;
      }
      
      const iframeDocument = shellIframe.contentDocument || (shellIframe.contentWindow as any)?.document;
      
      if (!iframeDocument) {
        console.warn('[VivlioDBG] Cannot execute scripts: no iframe document');
        return;
      }
      
      payload.inlineScripts.forEach((scriptCode: string, idx: number) => {
        try {
          // iframe内のbodyに<script type="module">を直接追加
          const scriptElement = iframeDocument.createElement('script');
          scriptElement.type = 'module';
          
          // スクリプトをIIFE（即時実行関数）でラップし、iframe内のdocument/windowを引数として渡す
          // 注: about:srcdoc では親と同一オリジンのため完全分離は不可能。
          // TreeWalkerやquerySelectorAllのrootを明示的にiframe.bodyに限定することで影響を最小化。
          const iframeWindow = iframeDocument.defaultView || shellIframe.contentWindow;
          
          // 一時的なグローバル変数に格納して参照渡し（実行後に削除）
          const tempVarName = `__vivlio_script_ctx_${Date.now()}_${idx}`;
          (window as any)[tempVarName] = { doc: iframeDocument, win: iframeWindow };
          
          console.debug(`[VivlioDBG] Script ${idx + 1}: tempVar='${tempVarName}', iframe.title='${iframeDocument.title}', parent.title='${window.document.title}'`);
          
          const wrappedCode = `
(function() {
  console.debug('[VivlioDBG][wrapper] Script starting, self.parent exists:', !!self.parent, 'tempVar:', '${tempVarName}');
  
  // 親ウィンドウの一時変数から取得
  const ctx = self.parent['${tempVarName}'];
  if (!ctx) {
    console.error('[VivlioDBG] Script context not found, tempVar=${tempVarName}');
    return;
  }
  
  console.debug('[VivlioDBG][wrapper] Context retrieved, doc.title:', ctx.doc.title);
  
  // 一時変数を削除（document/window を定義する前に）
  delete self.parent['${tempVarName}'];
  
  // ローカルスコープで document/window を再定義
  const document = ctx.doc;
  const window = ctx.win;
  
  console.debug('[VivlioDBG][wrapper] Variables bound, document.title:', document.title, 'window === ctx.win:', window === ctx.win);
  
  try {
    // ユーザースクリプト本体
${scriptCode}
  } catch (err) {
    console.error('[VivlioDBG] User script error:', err);
  }
})();
`;
          scriptElement.textContent = wrappedCode;
          
          // bodyに追加するとブラウザが自動実行
          (iframeDocument.body || iframeDocument.documentElement).appendChild(scriptElement);
          
          console.debug(`[VivlioDBG] Injected script ${idx + 1}/${payload.inlineScripts.length} into iframe (${scriptCode.length} chars, about:srcdoc, parent isolation limited)`);
        } catch (err) {
          console.warn(`[VivlioDBG] Script ${idx + 1} injection error:`, err);
        }
      });
    } else {
      console.debug('[VivlioDBG] No inline scripts in payload');
    }
  }, [onRendererLoad, payload?.inlineScripts]);

  useIframeOverlay(portalContainer, page, readingDirection, pageViewMode, iframeRef);

  // Recompute the base scale so that zoom=100% fits the available viewport without cropping.
  // Choose the spread target width based on view mode: single -> single page width, spread -> spread width
  useEffect(() => {
    const wrapper = wrapperRef.current;
    // pick the effective content size based on view mode
    const width = (pageViewMode === PageViewMode.SPREAD && spreadMetrics.width) ? spreadMetrics.width : spreadMetrics.width;
    const height = spreadMetrics.height;
    if (!wrapper || !width || !height || wrapperSize.width === 0 || wrapperSize.height === 0) {
      return;
    }
  // Compute base so that at zoom === 1 the content fits into the available wrapperSize
  const fitWidth = wrapperSize.width / Math.max(1, width);
  const fitHeight = wrapperSize.height / Math.max(1, height);
  const nextBase = Math.max(MIN_SCALE, Math.min(1, Math.min(fitWidth, fitHeight)));
    // Diagnostic log: report the values used to compute baseScale so we can debug fit issues
    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG][baseScale] wrapperSize=', { wrapperClient: { width: wrapperSize.width, height: wrapperSize.height }, spread: { width, height }, fitWidth, fitHeight, nextBase });
    setBaseScale((prev) => (Math.abs(prev - nextBase) <= 0.0001 ? prev : nextBase));
  }, [spreadMetrics.width, spreadMetrics.height, wrapperSize.width, wrapperSize.height]);

  useEffect(() => {
    if (!portalContainer) {
      lastScaleRef.current = appliedScale;
    }
  }, [portalContainer, appliedScale]);

  // Ctrl/Cmd + wheel to control zoom when mouse is over preview wrapper.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    // zoom steps (multipliers). These match the requested sequences.
    const zoomSteps = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];

    const findClosestIndex = (val: number) => {
      let best = 0;
      let bestDiff = Math.abs(zoomSteps[0] - val);
      for (let i = 1; i < zoomSteps.length; i++) {
        const d = Math.abs(zoomSteps[i] - val);
        if (d < bestDiff) {
          best = i;
          bestDiff = d;
        }
      }
      return best;
    };

    const getNextZoom = (current: number, deltaY: number) => {
      const idx = findClosestIndex(current);
      // wheel deltaY < 0 -> wheel up -> zoom in
      const nextIdx = deltaY < 0 ? Math.min(zoomSteps.length - 1, idx + 1) : Math.max(0, idx - 1);
      return zoomSteps[nextIdx];
    };

    const onWheel = (e: WheelEvent) => {
      // support Ctrl (Windows) and Meta (mac) as modifier for zoom
      if (!(e.ctrlKey || e.metaKey)) return;
      // ignore when raw overlay is visible
      if (showRaw) return;
      // if wrapper is missing, bail
      if (!wrapper) return;

      // Only intercept when the event target is inside the wrapper (covers iframe element too)
      try {
        const target = e.target as Node | null;
        if (!target) return;
        // If the event did not originate from inside our wrapper, don't interfere
        if (!wrapper.contains(target)) return;
      } catch (err) {
        // defensive: if contains check fails, don't block
        return;
      }

      // Prevent browser-level zoom. Using a capture, non-passive listener on window
      // should allow us to stop the default browser zoom when ctrl/meta+wheel occurs.
      e.preventDefault();
      e.stopImmediatePropagation();

      try {
        const newZoom = getNextZoom(zoom, e.deltaY);
        if (newZoom !== zoom) {
          onZoomChange(newZoom);
        }
      } catch (err) {
        // swallow
        // eslint-disable-next-line no-console
        console.warn('[VivlioDBG][wheelZoom] failed', err);
      }
    };

    // Attach at the window level with capture and non-passive so we can reliably
    // prevent the browser's zoom action before it takes effect.
    window.addEventListener('wheel', onWheel as any, { passive: false, capture: true });
    return () => {
      try { window.removeEventListener('wheel', onWheel as any, { capture: true } as EventListenerOptions); } catch (e) { /* ignore */ }
    };
  }, [zoom, onZoomChange, showRaw]);

  // In some browsers wheel events over the iframe's document do not bubble to the parent
  // so attach the same non-passive capture listener directly to the iframe's contentWindow
  // when the iframe is available (srcDoc same-origin). This ensures ctrl/meta+wheel
  // inside the iframe can be prevented.
  useEffect(() => {
    const iframe = iframeRef.current;
    const win = iframe?.contentWindow ?? null;
    if (!win) return;

    const zoomSteps = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
    const findClosestIndex = (val: number) => {
      let best = 0;
      let bestDiff = Math.abs(zoomSteps[0] - val);
      for (let i = 1; i < zoomSteps.length; i++) {
        const d = Math.abs(zoomSteps[i] - val);
        if (d < bestDiff) {
          best = i;
          bestDiff = d;
        }
      }
      return best;
    };
    const getNextZoom = (current: number, deltaY: number) => {
      const idx = findClosestIndex(current);
      const nextIdx = deltaY < 0 ? Math.min(zoomSteps.length - 1, idx + 1) : Math.max(0, idx - 1);
      return zoomSteps[nextIdx];
    };

    const onWheelInIframe = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (showRaw) return;
      // Prevent browser-level zoom inside iframe
      try {
        e.preventDefault();
        e.stopImmediatePropagation();
      } catch (err) { /* ignore */ }
      try {
        const newZoom = getNextZoom(zoom, e.deltaY);
        if (newZoom !== zoom) onZoomChange(newZoom);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[VivlioDBG][wheelZoom][iframe] failed', err);
      }
    };

    win.addEventListener('wheel', onWheelInIframe as any, { passive: false, capture: true });
    return () => {
      try { win.removeEventListener('wheel', onWheelInIframe as any, { capture: true } as EventListenerOptions); } catch (e) { /* ignore */ }
    };
  }, [zoom, onZoomChange, showRaw, portalContainer]);

  // Synchronize iframe transform with the applied scale while keeping the visible center anchored.
  useEffect(() => {
    // Use wrapperRef directly - it's the scroll container
    const wrapper = wrapperRef.current;
    const iframe = iframeRef.current;
    const spacer = spacerRef.current;
    if (!wrapper || !iframe || !spacer) return;

    const viewportWidth = wrapper.clientWidth || wrapperSize.width || 1;
    const viewportHeight = wrapper.clientHeight || wrapperSize.height || 1;

    let contentWidth = Math.max(1, (spreadMetrics.width ?? (iframe.offsetWidth || 1)));
    let contentHeight = Math.max(1, (spreadMetrics.height ?? (iframe.offsetHeight || 1)));
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
    } catch (e) {
      /* ignore cross-origin or timing errors */
    }

    const SHELL_PADDING = 12;
    const intrinsicWidth = contentWidth + SHELL_PADDING * 2;
    const intrinsicHeight = contentHeight + SHELL_PADDING * 2;

    const scaleValue = appliedScale;
    const visualWidth = intrinsicWidth * scaleValue;
    const visualHeight = intrinsicHeight * scaleValue;

    // Capture scroll position BEFORE layout changes
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

    // Spacer provides the exact scrollable area
    // Decision logic based on whether content fits in viewport
    let spacerWidth: number;
    let spacerHeight: number;
    let iframeLeft: number;
    let iframeTop: number;

    const fitsWidth = visualWidth <= viewportWidth;
    const fitsHeight = visualHeight <= viewportHeight;
    const fitsInViewport = fitsWidth && fitsHeight;
    
    // Determine if zoomed past fit based on actual content dimensions vs viewport
    const isZoomedPastFit = !fitsInViewport;
    const wasZoomedPastFit = prevLayout.width > viewportWidth + 0.5 || prevLayout.height > viewportHeight + 0.5;

    if (fitsInViewport) {
      // Content fits entirely: center it within viewport
      spacerWidth = viewportWidth;
      spacerHeight = viewportHeight;
      // With transform-origin center, position iframe so its center aligns with spacer center
      iframeLeft = (viewportWidth - intrinsicWidth) / 2;
      iframeTop = (viewportHeight - intrinsicHeight) / 2;
    } else {
      // Content doesn't fit: make scrollable with center-based scaling
      spacerWidth = Math.max(visualWidth, viewportWidth);
      spacerHeight = Math.max(visualHeight, viewportHeight);
      // Position iframe so its center point is at the center of the spacer
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

    // Apply styles to iframe
    // IMPORTANT: With transform-origin 'center center', the iframe scales from its center
    // Position the iframe so its center is at the desired location in the spacer
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
    } catch (e) { /* ignore */ }

    const applyScroll = () => {
      // Precompute expected max scroll using spacer sizes we've just set
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
        // Transitioning from fit to zoomed: center the view (50%, 50%)
        targetLeft = Math.round(maxLeft * 0.5);
        targetTop = Math.round(maxTop * 0.5);
      } else if (scaleChanged) {
        targetLeft = Math.max(0, Math.min(maxLeft, Math.round(prevLeftRatio * maxLeft)));
        targetTop = Math.max(0, Math.min(maxTop, Math.round(prevTopRatio * maxTop)));
      } else {
        targetLeft = Math.round(prevLeftRatio * maxLeft);
        targetTop = Math.round(prevTopRatio * maxTop);
      }

      // Single RAF: write scroll and transform together to avoid intermediate repaint
      requestAnimationFrame(() => {
        try {
          wrapper.scrollLeft = targetLeft;
          wrapper.scrollTop = targetTop;

          // touch layout to flush if needed
          // eslint-disable-next-line @typescript-eslint/no-unused-expressions
          wrapper.offsetHeight;

          // Apply scale instantly (no transition)
          iframe.style.transition = '';
          iframe.style.transform = `scale(${scaleValue})`;
        } catch (e) {
          console.warn('[VivlioDBG][applyScroll] write failed', e);
        }
      });
    };

    try {
      console.debug('[VivlioDBG][scaleApply]', {
        contentWidth,
        contentHeight,
        SHELL_PADDING,
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
        actualIframeLeft: iframeLeft,
        actualIframeTop: iframeTop,
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
    } catch (e) { /* ignore */ }

    // Apply scroll with double RAF to ensure layout has settled
    applyScroll();

    lastScaleRef.current = scaleValue;
    lastLayoutRef.current = { width: visualWidth, height: visualHeight };
  }, [appliedScale, pageViewMode, spreadMetrics.height, spreadMetrics.width, wrapperSize.height, wrapperSize.width]);


  // Adjust wrapper layout based on the effective scale so sub-100% zoom stays centered.
  useEffect(() => {
    // Nothing to do here; outer container handles centering/overflow via CSS.
    return;
  }, [appliedScale]);



  const renderFallback = () => {
    const baseStyle: React.CSSProperties = {
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      background: '#1f1f23',
      color: '#f3f3f4',
      textAlign: 'center',
      padding: 24,
      boxSizing: 'border-box',
    };

    if (error) {
      return (
        <div style={baseStyle}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{error.message}</div>
          {error.detail ? <div style={{ fontSize: 13, opacity: 0.85 }}>{error.detail}</div> : null}
          <button
            type="button"
            onClick={onRetry}
            disabled={isBuilding || !onRetry}
            style={{
              marginTop: 8,
              padding: '6px 14px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.3)',
              background: 'transparent',
              color: '#fff',
              cursor: (isBuilding || !onRetry) ? 'not-allowed' : 'pointer',
              opacity: (isBuilding || !onRetry) ? 0.5 : 1,
            }}
          >
            Retry preview
          </button>
        </div>
      );
    }

    return (
      <div style={baseStyle}>
        <div style={{ fontSize: 15, fontWeight: 500 }}>Loading…</div>
      </div>
    );
  };

  if (!payload || !sourceUrl) {
    return renderFallback();
  }

  return (
    <div
      ref={wrapperRef}
      className="vivlio-viewer-wrapper"
      data-reading-direction={readingDirection}
      style={{ 
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'auto',
        display: 'block',
        pointerEvents: viewerReady ? 'auto' : 'none',
        userSelect: viewerReady ? 'auto' : 'none',
      }}
    >
      <div ref={spacerRef} style={{ position: 'relative' }}>
        <iframe
          ref={iframeRef}
          className="vivlio-iframe"
          key={`${(payload.htmlForIframe || payload.html || '')}_${readingDirection}_portal`}
          srcDoc={buildShell(gutterColor)}
          title="Vivliostyle Preview (isolated)"
          onLoad={handleIframeLoad}
          style={{
            pointerEvents: showRaw ? 'none' : 'auto',
            visibility: showRaw ? 'hidden' : 'visible',
            position: 'absolute',
            left: 0,
            top: 0,
            border: 'none',
          }}
        />
      </div>
      {portalContainer && createPortal(
        <div
          className="vivlio-portal"
          style={{
            width: '100%',
            height: '100%',
            pointerEvents: showRaw ? 'none' : 'auto',
            visibility: showRaw ? 'hidden' : 'visible',
          }}
        >
          <Renderer
            source={sourceUrl}
            page={page}
            pageViewMode={pageViewMode}
            style={{ width: '100%', height: '100%' }}
            onLoad={handleRendererLoad}
            onNavigation={onRendererNavigation}
          />
        </div>,
        portalContainer
      )}
      {showRaw && (
        <div className="vivlio-raw-overlay">
          <iframe
            className="vivlio-raw-frame"
            key={(payload.html || '') + '_' + readingDirection + '_' + pageViewMode + '_raw'}
            srcDoc={payload.html || ''}
            title="Vivliostyle Raw HTML (with scripts)"
          />
        </div>
      )}
    </div>
  );
};

function buildShell(gutterColor: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1" /><title>Vivlio Preview</title><style>
    :root{ --vivlio-bg: ${gutterColor}; }
    html,body{height:100%;margin:0;padding:0;background:var(--vivlio-bg);overflow:hidden}
    /* reduced padding to improve 100% fit */
    #vivlio-root{display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box}
  </style></head><body><div id="vivlio-root"></div></body></html>`;
}

function useIframeOverlay(portalContainer: HTMLElement | null, page: number, readingDirection: 'ltr' | 'rtl', pageViewMode: PageViewMode, iframeRef: React.RefObject<HTMLIFrameElement | null>) {
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
          try { cancelPolling(); } catch (e) { /* ignore */ }
          cancelPolling = null;
        }
        if (roRef.current) {
          try { roRef.current.disconnect(); } catch (e) { /* ignore */ }
          roRef.current = null;
        }
        if (overlayRef.current && overlayRef.current.parentElement) {
          overlayRef.current.parentElement.removeChild(overlayRef.current);
          overlayRef.current = null;
        }
        if (iframeStyleRef.current && iframeStyleRef.current.parentElement) {
          iframeStyleRef.current.parentElement.removeChild(iframeStyleRef.current);
          iframeStyleRef.current = null;
        }
        if (listenersAttachedRef.current && currentWin && currentUpdate) {
          try { currentWin.removeEventListener('scroll', currentUpdate, true); } catch (e) { /* ignore */ }
          try { currentWin.removeEventListener('resize', currentUpdate); } catch (e) { /* ignore */ }
          listenersAttachedRef.current = false;
        }
        if (transparentAppliedRef.current) {
          try { transparentAppliedRef.current.forEach((el) => el.classList.remove('vivlio--ancestor-transparent')); } catch (e) { /* ignore */ }
          transparentAppliedRef.current = null;
        }
      } catch (e) { /* ignore */ }
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
      // base isolation + overlay styles. We include a placeholder for zoom rules which will be updated below.
      let cssContent = `
        .vivlio--ancestor-transparent{ background: transparent !important; overflow: visible !important }
        #vivlio-bleed-shadow{ position:absolute; pointer-events:none; z-index:1050; opacity:0.98; border-radius:6px }
        /* zoom-target styles - runtime-updated */
        #vivlio-root { transform-origin: center center; }
      `;
      if (pageViewMode === PageViewMode.SPREAD && readingDirection === 'rtl') {
        cssContent += `
          [data-vivliostyle-spread-container] { flex-direction: row-reverse; }
        `;
      }
      styleEl.textContent = cssContent;
      iframeStyleRef.current = styleEl;

    } catch (e) {
      console.warn('[VivlioDBG] inject style failed', e);
    }

    try {
      let overlay = doc.getElementById('vivlio-bleed-shadow') as HTMLElement | null;
      if (!overlay) {
        overlay = doc.createElement('div');
        overlay.id = 'vivlio-bleed-shadow';
        doc.body.appendChild(overlay);
      }
      overlayRef.current = overlay;
    } catch (e) {
      console.warn('[VivlioDBG] create overlay failed', e);
    }

    const getSpread = (): HTMLElement | null => {
      try {
        return doc.querySelector('[data-vivliostyle-spread-container], [data-vivliostyle-page-container], .page') as HTMLElement | null;
      } catch (e) {
        return null;
      }
    };

    const applyAncestorTransparency = (spread: HTMLElement | null) => {
      try {
        if (!spread) return;
        if (transparentAppliedRef.current) {
          try { transparentAppliedRef.current.forEach((el) => el.classList.remove('vivlio--ancestor-transparent')); } catch (e) { /* ignore */ }
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
          } catch (e) { /* ignore */ }
          cursor = current.parentElement;
        }
        transparentAppliedRef.current = list;
      } catch (e) { /* ignore */ }
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
      } catch (e) {
        console.warn('[VivlioDBG] updateOverlay error', e);
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
              try { ro.observe(spread); } catch (err) { ro.disconnect(); }
              roRef.current = ro;
            }
            if (win && !listenersAttachedRef.current) {
              try { win.addEventListener('scroll', updateOverlay, true); } catch (err) { /* ignore */ }
              try { win.addEventListener('resize', updateOverlay); } catch (err) { /* ignore */ }
              listenersAttachedRef.current = true;
            }
            setTimeout(updateOverlay, 80);
          } catch (err) {
            console.warn('[VivlioDBG] setup observers failed', err);
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
  }, [portalContainer, pageViewMode, readingDirection]);

  useEffect(() => {
    updateOverlayRef.current?.();
  }, [page]);
}
