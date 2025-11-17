import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PageViewMode } from '@vivliostyle/core';
import { Renderer } from '@vivliostyle/react';
import { VivlioPayload } from '../hooks/useVivlioBuild';

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
}

/**
 * Clean, from-scratch implementation of Vivliostyle viewer frame
 * 
 * Architecture:
 * 1. Direct Renderer mounting (no iframe portal complexity)
 * 2. Simple zoom with transform: scale() and proper scroll handling
 * 3. Spacer element to ensure correct scroll area
 * 4. Center-based zoom to prevent offset drift
 */
export const VivlioViewerFrame: React.FC<VivlioViewerFrameProps> = ({
  payload,
  sourceUrl,
  showRaw,
  gutterColor,
  page,
  onRendererLoad,
  onRendererNavigation,
  viewerReady,
  pageViewMode = PageViewMode.SINGLE_PAGE,
  readingDirection = 'ltr',
  zoom,
}) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const spacerRef = useRef<HTMLDivElement | null>(null);
  const [contentSize, setContentSize] = useState({ width: 800, height: 1000 });
  const lastZoomRef = useRef(zoom);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Measure content size after Renderer mounts/updates
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const measure = () => {
      // Get the actual rendered size from Vivliostyle
      const rendererEl = content.querySelector('[data-vivliostyle-viewer-viewport]') 
        || content.querySelector('.vivliostyle-viewer-viewport')
        || content.firstElementChild;
      
      if (rendererEl) {
        const rect = rendererEl.getBoundingClientRect();
        const newWidth = Math.max(100, Math.round(rect.width));
        const newHeight = Math.max(100, Math.round(rect.height));
        
        console.log('[VivlioV2] Content size measured:', { width: newWidth, height: newHeight, zoom });
        setContentSize({ width: newWidth, height: newHeight });
      }
    };

    // Initial measurement
    const timer = setTimeout(measure, 100);

    // Set up ResizeObserver to track size changes
    if ('ResizeObserver' in window) {
      resizeObserverRef.current = new ResizeObserver(measure);
      resizeObserverRef.current.observe(content);
    }

    return () => {
      clearTimeout(timer);
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
    };
  }, [sourceUrl, pageViewMode, page]);

  // Handle zoom changes with center-based scroll adjustment
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const content = contentRef.current;
    const spacer = spacerRef.current;
    
    if (!wrapper || !content || !spacer) return;

    const prevZoom = lastZoomRef.current;
    const zoomChanged = prevZoom !== zoom;

    console.log('[VivlioV2] Applying zoom:', { prevZoom, zoom, zoomChanged, contentSize });

    // Calculate scaled dimensions
    const scaledWidth = Math.round(contentSize.width * zoom);
    const scaledHeight = Math.round(contentSize.height * zoom);

    // Update spacer to provide correct scroll area
    spacer.style.width = `${scaledWidth}px`;
    spacer.style.height = `${scaledHeight}px`;

    // Apply transform to content
    content.style.width = `${contentSize.width}px`;
    content.style.height = `${contentSize.height}px`;
    content.style.transform = `scale(${zoom})`;
    content.style.transformOrigin = 'center center';

    if (zoomChanged) {
      // Calculate content center point in wrapper coordinates (before zoom)
      const centerX = (wrapper.scrollLeft + wrapper.clientWidth / 2) / prevZoom;
      const centerY = (wrapper.scrollTop + wrapper.clientHeight / 2) / prevZoom;

      // After applying new zoom, calculate new scroll position to keep center point at viewport center
      requestAnimationFrame(() => {
        const newScrollLeft = centerX * zoom - wrapper.clientWidth / 2;
        const newScrollTop = centerY * zoom - wrapper.clientHeight / 2;

        wrapper.scrollLeft = Math.max(0, newScrollLeft);
        wrapper.scrollTop = Math.max(0, newScrollTop);

        console.log('[VivlioV2] Scroll adjusted for zoom:', {
          centerX,
          centerY,
          newScrollLeft,
          newScrollTop,
          actualScrollLeft: wrapper.scrollLeft,
          actualScrollTop: wrapper.scrollTop
        });
      });
    }

    lastZoomRef.current = zoom;
  }, [zoom, contentSize]);

  if (!payload || !sourceUrl) {
    return <div style={{ padding: 20, color: '#666' }}>Loading...</div>;
  }

  return (
    <div
      ref={wrapperRef}
      className="vivlio-viewer-wrapper-v2"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'auto',
        background: gutterColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        ref={spacerRef}
        style={{
          position: 'relative',
          minWidth: '100%',
          minHeight: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          ref={contentRef}
          style={{
            position: 'relative',
            transformOrigin: 'center center',
            willChange: 'transform',
          }}
        >
          <Renderer
            key={`${sourceUrl}_${pageViewMode}`}
            source={sourceUrl}
            page={page}
            pageViewMode={pageViewMode}
            style={{ width: '100%', height: '100%' }}
            onLoad={onRendererLoad}
            onNavigation={onRendererNavigation}
          />
        </div>
      </div>

      {showRaw && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 900,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            background: 'rgba(14,14,18,0.9)',
            overflow: 'auto',
          }}
        >
          <iframe
            srcDoc={payload.html || ''}
            title="Raw HTML"
            style={{
              width: '90%',
              height: '90%',
              border: '1px solid rgba(255,255,255,0.2)',
              background: '#fff',
            }}
          />
        </div>
      )}
    </div>
  );
};
