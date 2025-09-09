import React, { useEffect, useState } from 'react';
// Renderer replaced by isolated iframe to avoid host CSS leakage
import { buildVfmHtml, buildVfmPayload } from '../vfm/buildVfmHtml';

interface VivliostylePreviewProps {
  markdown: string;
}

export const VivliostylePreview: React.FC<VivliostylePreviewProps> = ({ markdown }) => {
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [vivlioDebug, setVivlioDebug] = useState<any>(null);
  const [vivlioPayload, setVivlioPayload] = useState<any>(null);
  const [showMargins, setShowMargins] = useState(false);
  const rendererWrapRef = React.useRef<HTMLDivElement | null>(null);

  // unified button base style
  const btnBase: React.CSSProperties = {
  padding: '6px 12px',
  background: 'rgba(40,40,40,0.55)',
  color: 'rgba(255,255,255,0.95)',
  border: '1px solid rgba(255,255,255,0.06)',
  backdropFilter: 'blur(6px)',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 12,
  boxShadow: '0 4px 10px rgba(0,0,0,0.18)'
  };

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
      // avoid cross-origin access: we only inspect same-origin (data:) iframes
      const src = iframe.getAttribute('src') || '';
      if (!src.startsWith('data:')) {
        setVivlioDebug({ error: 'cross-origin: cannot access iframe document' });
        return;
      }
      const doc = iframe.contentDocument;
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
  const payload = buildVfmPayload(markdown, {
        inlineCss: showMargins ? `
          /* reset UA body margins to avoid visual confusion */
          html, body { margin: 0 !important; padding: 0 !important; }

          /* Ensure any theme variables that control page size are overridden */
          :root {
            --vs-page-width: 148mm;
            --vs-page-height: 210mm;
            --vs-page-margin: 12mm;
          }

          /* Final @page (mm values to avoid alias resolution issues) */
          @page {
            size: 148mm 210mm;
            margin: 12mm;
            marks: crop cross;
            bleed: 3mm;
          }

          /* Ensure :left/:right variants are overridden as well */
          @page :left {
            size: 148mm 210mm;
            margin: 12mm;
          }
          @page :right {
            size: 148mm 210mm;
            margin: 12mm;
          }

          /* visual helpers */
          [data-vivliostyle-page-area] {
            background: rgba(144, 238, 144, 0.3) !important;
          }
          [data-vivliostyle-page-box] {
            background: rgba(100, 149, 237, 0.3) !important;
          }
        ` : undefined,
        inlineScript: `
          window.addEventListener('load', () => {
            if (window.vivliostyle && window.vivliostyle.viewer) {
              window.vivliostyle.viewer.setOptions({ spread: false });
            }
          });
        `
  });
  // store payload for Info panel
  setVivlioPayload(payload);
  // Use data URL to load the generated full HTML into an isolated iframe
  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(payload.html)}`;
  setSourceUrl(dataUrl);
  return () => { /* no-op for data URL */ };
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
        title="Toggle info"
        aria-label="Toggle info"
        style={{ position: 'absolute', top: 10, right: 24, zIndex: 1000, ...btnBase, padding: '6px' }}
      >
        ℹ️
      </button>

      {/* Margin visualization toggle button */}
      <button
        onClick={() => setShowMargins(!showMargins)}
        title={showMargins ? 'Disable margins' : 'Enable margins'}
        aria-label="Toggle margins"
        style={{ position: 'absolute', top: 10, right: 64, zIndex: 1000, ...btnBase, padding: '6px', background: showMargins ? 'rgba(255,165,0,0.9)' : btnBase.background }}
      >
        📐
      </button>

      {/* Information panel (simplified) */}
  {showInfo && (
  <div style={{ position: 'absolute', top: 50, right: 24, width: 320, maxHeight: 400, background: 'rgba(28,28,30,0.75)', color: 'rgba(255,255,255,0.95)', borderRadius: 10, padding: 12, zIndex: 1000, overflow: 'auto', fontSize: 12, backdropFilter: 'blur(6px)', boxShadow: '0 8px 22px rgba(0,0,0,0.28)', border: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ fontSize: 13 }}>Vivliostyle Info</strong>
            <span style={{ fontSize: 12, opacity: 0.9 }}>{showMargins ? 'Margins ON' : 'Margins OFF'}</span>
          </div>
          <div style={{ marginBottom: 8 }}>
            <button
              onClick={collectVivlioDebug}
              title="Refresh info"
              aria-label="Refresh info"
              style={{ marginRight: 6, ...btnBase, padding: '6px', fontSize: 12 }}
            >
              🔄
            </button>
            <button
              onClick={() => { if (vivlioDebug) navigator.clipboard?.writeText(JSON.stringify(vivlioDebug, null, 2)); }}
              title="Copy debug JSON"
              aria-label="Copy debug JSON"
              style={{ ...btnBase, padding: '6px', fontSize: 12 }}
            >
              📋
            </button>
          </div>
          <div style={{ fontSize: 12, marginBottom: 8 }}>
            <div><strong>Pages found:</strong> {vivlioDebug?.entries?.length ?? 0}</div>
            <div><strong>Collected:</strong> {vivlioDebug?.collectedAt ? new Date(vivlioDebug.collectedAt).toLocaleTimeString() : '-'}</div>
          </div>

          {/* New payload inspector sections */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 12 }}>Extracted user CSS</strong>
              <button style={{ ...btnBase, padding: '4px 8px', fontSize: 11 }} onClick={() => vivlioPayload && navigator.clipboard?.writeText(vivlioPayload.userCss || '')}>Copy</button>
            </div>
            <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto', background: 'rgba(0,0,0,0.22)', padding: 8, borderRadius: 6, fontSize: 11 }}>{vivlioPayload ? (vivlioPayload.userCss || '(none)') : '(not built yet)'}</pre>
          </div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 12 }}>Composed CSS (base + user + inline)</strong>
              <button style={{ ...btnBase, padding: '4px 8px', fontSize: 11 }} onClick={() => vivlioPayload && navigator.clipboard?.writeText(vivlioPayload.finalCss || '')}>Copy</button>
            </div>
            <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto', background: 'rgba(0,0,0,0.18)', padding: 8, borderRadius: 6, fontSize: 11 }}>{vivlioPayload ? (vivlioPayload.finalCss || '(none)') : '(not built yet)'}</pre>
          </div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 12 }}>Raw Markdown</strong>
              <button style={{ ...btnBase, padding: '4px 8px', fontSize: 11 }} onClick={() => vivlioPayload && navigator.clipboard?.writeText(vivlioPayload.rawMarkdown || '')}>Copy</button>
            </div>
            <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto', background: 'rgba(0,0,0,0.12)', padding: 8, borderRadius: 6, fontSize: 11 }}>{vivlioPayload ? (vivlioPayload.rawMarkdown || '(empty)') : '(not built yet)'}</pre>
          </div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 12 }}>Final HTML (passed to Vivliostyle)</strong>
              <button style={{ ...btnBase, padding: '4px 8px', fontSize: 11 }} onClick={() => vivlioPayload && navigator.clipboard?.writeText(vivlioPayload.html || '')}>Copy</button>
            </div>
            <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 220, overflow: 'auto', background: 'rgba(0,0,0,0.08)', padding: 8, borderRadius: 6, fontSize: 11 }}>{vivlioPayload ? (vivlioPayload.html || '(none)') : '(not built yet)'}</pre>
          </div>
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
        {sourceUrl && (
          <iframe
            key={sourceUrl + (showMargins ? '_m' : '_n')}
            src={sourceUrl}
            title="Vivliostyle Preview"
            style={{ width: '100%', height: '100%', border: 0 }}
            // allow scripts to run inside the data: URL context
            // do NOT set sandbox here so viewer scripts can execute
            onLoad={() => {
              // collect debug info after iframe content loads
              try { collectVivlioDebug(); } catch (e) { /* ignore */ }
            }}
          />
        )}
      </div>
    </div>
  );
};
