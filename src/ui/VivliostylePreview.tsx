import React, { useEffect, useState } from 'react';
import { Renderer } from '@vivliostyle/react';
import { buildVfmHtml } from '../vfm/buildVfmHtml';

interface VivliostylePreviewProps {
  markdown: string;
}

export const VivliostylePreview: React.FC<VivliostylePreviewProps> = ({ markdown }) => {
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [vivlioDebug, setVivlioDebug] = useState<any>(null);
  const [showMargins, setShowMargins] = useState(false);
  const rendererWrapRef = React.useRef<HTMLDivElement | null>(null);

  // Collect debug information from the Vivliostyle-rendered iframe when available
  const collectVivlioDebug = async () => {
    try {
      const wrap = rendererWrapRef.current;
      if (!wrap) return;
      const iframe = wrap.querySelector('iframe') as HTMLIFrameElement | null;
      if (!iframe) {
        setVivlioDebug(null);
        return;
      }
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) {
        setVivlioDebug(null);
        return;
      }

      // find candidate page containers using Vivliostyle data attributes or common page markers
      const candidates: Element[] = Array.from(doc.querySelectorAll('[data-vivliostyle-page-side], [data-vivliostyle-auto-page-width], [data-vivliostyle-auto-page-height]'));
      if (candidates.length === 0) {
        // fallback: common page container heuristics
        const fallbacks = Array.from(doc.querySelectorAll('.vivliostyle-page, .page, [role="document"], article'));
        candidates.push(...fallbacks);
      }

      const entries = candidates.slice(0, 6).map((el) => {
        const inline = el.getAttribute('style') || '';
        const ds: any = {};
        try { Object.keys((el as HTMLElement).dataset || {}).forEach((k) => { ds[k] = (el as HTMLElement).dataset[k as any]; }); } catch (e) { /* ignore */ }
        const cs = iframe.contentWindow ? iframe.contentWindow.getComputedStyle(el as Element) : null;
        const comp = cs ? { width: cs.width, height: cs.height, left: cs.left, top: cs.top, padding: cs.padding } : null;
        // try to find bleed/crop related child
        const bleed = (el as Element).querySelector('[data-bleed], .bleed, .vivliostyle-bleed, [data-vivliostyle-bleed]') as Element | null;
        const bleedInline = bleed ? (bleed.getAttribute('style') || '') : null;
        return {
          tag: el.tagName.toLowerCase(),
          id: (el as HTMLElement).id || null,
          className: (el as HTMLElement).className || null,
          dataset: ds,
          inlineStyle: inline,
          computed: comp,
          bleedInline,
        };
      });

      // also try to surface top-level container sizes (sheet width/height) from inline styles
      let pageSheetWidth: string | null = null;
      let pageSheetHeight: string | null = null;
      try {
        const anyContainer = doc.querySelector('[data-vivliostyle-page-side], .vivliostyle-page, .page') as HTMLElement | null;
        if (anyContainer) {
          pageSheetWidth = anyContainer.style.width || null;
          pageSheetHeight = anyContainer.style.height || null;
        }
      } catch (e) { /* ignore */ }

      setVivlioDebug({ entries, pageSheetWidth, pageSheetHeight, collectedAt: Date.now() });
    } catch (e) {
      // ignore cross-origin/timing issues silently
      setVivlioDebug({ error: (e as Error).message });
    }
  };

  // run debug collection when sourceUrl changes and when info panel is open
  React.useEffect(() => {
    if (!sourceUrl) return;
    // collect shortly after iframe loads; data-based iframe should be same-origin
    const t = window.setTimeout(() => { try { collectVivlioDebug(); } catch (e) { /* ignore */ } }, 300);
    return () => { clearTimeout(t); };
  }, [sourceUrl]);

  React.useEffect(() => {
    if (showInfo) {
      // immediate attempt when panel is opened
      collectVivlioDebug();
    }
  }, [showInfo]);

  useEffect(() => {
    if (!markdown) {
      setSourceUrl(null);
      return;
    }

    try {
      const html = buildVfmHtml(markdown, {
        inlineCss: showMargins ? `
          [data-vivliostyle-page-area] {
            background: rgba(144, 238, 144, 0.3) !important;
          }
          [data-vivliostyle-page-box] {
            background: rgba(100, 149, 237, 0.3) !important;
          }
        ` : undefined
      });
      // Blob URLの代わりにdata URLを使用
      const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
      setSourceUrl(dataUrl);

      // Blob URLの場合はrevokeが必要だが、data URLは不要
      return () => {
        // data URLの場合は何もしない
      };
    } catch (error) {
      console.error('[VivlioDBG] Error building HTML:', error);
      setSourceUrl(null);
    }
  }, [markdown, showMargins]);

  if (!sourceUrl) {
    return <div>Loading...</div>;
  }

  return (
    <div className="vivlio-simple-viewer" style={{ height: '100%', width: '100%', position: 'relative' }}>
      {/* Information button */}
      <button
        onClick={() => setShowInfo(!showInfo)}
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          zIndex: 1000,
          padding: '6px 12px',
          background: 'rgba(0,0,0,0.7)',
          color: 'white',
          border: 'none',
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: 12
        }}
      >
        ℹ️ Info
      </button>

      {/* Margin visualization toggle button */}
      <button
        onClick={() => setShowMargins(!showMargins)}
        style={{
          position: 'absolute',
          top: 10,
          right: 80,
          zIndex: 1000,
          padding: '6px 12px',
          background: showMargins ? 'rgba(255,165,0,0.8)' : 'rgba(0,0,0,0.7)',
          color: 'white',
          border: 'none',
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: 12
        }}
      >
        📐 Margins
      </button>

      {/* Information panel */}
      {showInfo && (
        <div
          style={{
            position: 'absolute',
            top: 50,
            right: 10,
            width: 400,
            maxHeight: 600,
            background: 'rgba(0,0,0,0.9)',
            color: 'white',
            borderRadius: 8,
            padding: 16,
            zIndex: 1000,
            overflow: 'auto',
            fontSize: 12
          }}
        >
          <h3 style={{ margin: '0 0 12px 0', fontSize: 14 }}>Vivliostyle Debug Info</h3>

          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button
              onClick={collectVivlioDebug}
              style={{
                padding: '6px 8px',
                background: '#444',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 11
              }}
            >
              🔄 Refresh
            </button>
            <button
              onClick={() => {
                if (vivlioDebug) {
                  navigator.clipboard?.writeText(JSON.stringify(vivlioDebug, null, 2));
                }
              }}
              style={{
                padding: '6px 8px',
                background: '#444',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 11
              }}
            >
              📋 Copy JSON
            </button>
          </div>

          <div style={{ marginBottom: 12 }}>
            <strong>Margin Visualization:</strong> {showMargins ? 'ON' : 'OFF'}
          </div>

          <pre
            style={{
              whiteSpace: 'pre-wrap',
              maxHeight: 400,
              overflow: 'auto',
              background: 'rgba(0,0,0,0.3)',
              padding: 8,
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 4,
              fontSize: 11,
              lineHeight: 1.4
            }}
          >
            {vivlioDebug ? JSON.stringify(vivlioDebug, null, 2) : 'No debug information collected. Click Refresh to collect data.'}
          </pre>
        </div>
      )}

      {/* Renderer with margin visualization */}
      <div
        ref={rendererWrapRef}
        style={{
          height: '100%',
          width: '100%',
          position: 'relative'
        }}
      >
        <Renderer source={sourceUrl} />
      </div>
    </div>
  );
};
