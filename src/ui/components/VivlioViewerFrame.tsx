import React, { useCallback, useRef, useState } from 'react';
import { PageViewMode } from '@vivliostyle/core';
import { createPortal } from 'react-dom';
import { Renderer } from '@vivliostyle/react';
import { VivlioPayload, BuildErrorInfo } from '../hooks/useVivlioBuild';
import { useElementSize } from '../hooks/useElementSize';
import { useSpreadMetrics } from '../hooks/useSpreadMetrics';
import { useRendererLoadWithScripts } from '../hooks/useRendererLoadWithScripts';
import { useBaseScale } from '../hooks/useBaseScale';
import { useWheelZoom } from '../hooks/useWheelZoom';
import { useScaledIframeLayout } from '../hooks/useScaledIframeLayout';
import { useIframeOverlay } from '../hooks/useIframeOverlay';

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
  runInlineScripts?: boolean;
}

const MIN_SCALE = 0.05;

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
  zoom,
  onZoomChange,
  error,
  onRetry,
  runInlineScripts = true,
}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const spacerRef = useRef<HTMLDivElement | null>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  const wrapperSize = useElementSize(wrapperRef as any);
  const spreadMetrics = useSpreadMetrics(portalContainer, page, pageViewMode, readingDirection, iframeRef);
  const baseScale = useBaseScale({ wrapperRef, wrapperSize, spreadMetrics, pageViewMode, minScale: MIN_SCALE });
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

  const rendererLoadHandlerWithScripts = useRendererLoadWithScripts({ payload, iframeRef, onRendererLoad });
  const rendererLoadHandler = runInlineScripts ? rendererLoadHandlerWithScripts : onRendererLoad;

  useWheelZoom({ wrapperRef, iframeRef, zoom, onZoomChange, showRaw });
  useScaledIframeLayout({
    wrapperRef,
    spacerRef,
    iframeRef,
    wrapperSize,
    spreadMetrics,
    appliedScale,
    pageViewMode,
    baseScale,
    zoom,
    portalReady: !!portalContainer,
  });
  useIframeOverlay(portalContainer, page, readingDirection, pageViewMode, iframeRef);

  if (!payload || !sourceUrl) {
    return renderFallbackContent({ error, isBuilding, onRetry });
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
            onLoad={rendererLoadHandler}
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
            srcDoc={runInlineScripts ? (payload.html || '') : (payload.htmlForIframe || payload.html || '')}
            title="Vivliostyle Raw HTML (with scripts)"
          />
        </div>
      )}
    </div>
  );
};

interface FallbackProps {
  error?: BuildErrorInfo | null;
  isBuilding: boolean;
  onRetry?: () => void;
}

function renderFallbackContent({ error, isBuilding, onRetry }: FallbackProps) {
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
}

function buildShell(gutterColor: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1" /><title>Vivlio Preview</title><style>
    :root{ --vivlio-bg: ${gutterColor}; }
    html,body{height:100%;margin:0;padding:0;background:var(--vivlio-bg);overflow:hidden}
    #vivlio-root{display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box}
  </style></head><body><div id="vivlio-root"></div></body></html>`;
}
