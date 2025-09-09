import React, { useEffect, useState } from 'react';
import { Renderer } from '@vivliostyle/react';
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
  const [isSpread, setIsSpread] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageCount, setPageCount] = useState<number>(0);
  const rendererWrapRef = React.useRef<HTMLDivElement | null>(null);
  const viewerRef = React.useRef<any>(null);
  const rawWindowRef = React.useRef<Window | null>(null);
  const [showRawInline, setShowRawInline] = useState<boolean>(false);

  
  // collapsible Section helper — compact header with emphasized border and small right-aligned Copy
  const Section: React.FC<{ title: string; collapsed: boolean; onToggle: () => void; copy?: () => void; active?: boolean; children?: React.ReactNode }> = ({ title, collapsed, onToggle, copy, active, children }) => (
    <div style={{ marginBottom: 8, borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div
        onClick={onToggle}
        role="button"
        tabIndex={0}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '6px 8px',
          cursor: 'pointer',
          userSelect: 'none',
          background: 'rgba(0,0,0,0.08)',
          borderBottom: '1px solid rgba(255,255,255,0.03)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'inline-block', width: 14, textAlign: 'center', fontSize: 12, lineHeight: '12px' }}>{collapsed ? '▶' : '▼'}</span>
          <span style={{ fontSize: 12, lineHeight: '14px' }}>{title}</span>
        </div>
        {/* copy button on the right edge of the header; stopPropagation so it doesn't toggle */}
        {copy && (
          <button
            onClick={(e) => { e.stopPropagation(); copy(); }}
            aria-label={`Copy ${title}`}
            style={{
              padding: '4px 8px',
              fontSize: 12,
              borderRadius: 6,
              background: active ? 'rgba(60,160,60,0.85)' : 'rgba(40,40,40,0.55)',
              color: 'white',
              border: '1px solid rgba(255,255,255,0.04)',
              cursor: 'pointer'
            }}
          >
            {active ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
      {!collapsed && (
        <div style={{ position: 'relative', padding: 8, background: 'rgba(0,0,0,0.02)' }}>
          <div className="vivlio-section-scroll" style={{ overflow: 'auto', maxHeight: 380 }}>{children}</div>
        </div>
      )}
    </div>
  );

  // local scrollbar styles for compact thin scrollbar inside the info panel
  const localScrollStyles = `
    .vivlio-simple-viewer .vivlio-section-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.14) transparent; }
    .vivlio-simple-viewer .vivlio-section-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
    .vivlio-simple-viewer .vivlio-section-scroll::-webkit-scrollbar-track { background: transparent; }
    .vivlio-simple-viewer .vivlio-section-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 8px; }
    .vivlio-simple-viewer .vivlio-section-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
  `;

  const [collapsed, setCollapsed] = useState<{ md: boolean; userCss: boolean; compCss: boolean; html: boolean }>({ md: false, userCss: false, compCss: false, html: false });
  const [lastCopied, setLastCopied] = useState<string | null>(null);
  const copyTimerRef = React.useRef<number | null>(null);

  const doCopy = (key: string, text?: string) => {
    if (!text) return;
    try {
      navigator.clipboard?.writeText(text);
    } catch (e) {
      // ignore
    }
    setLastCopied(key);
    if (copyTimerRef.current) { window.clearTimeout(copyTimerRef.current); }
    copyTimerRef.current = window.setTimeout(() => setLastCopied(null), 1500);
  };

  React.useEffect(() => {
    return () => { if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current); };
  }, []);

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
    // collect shortly after renderer/iframe loads
    const t = window.setTimeout(() => { try { collectVivlioDebug(); } catch (e) { /* ignore */ } }, 300);
    return () => { clearTimeout(t); };
  }, [sourceUrl]);

  // Helper: find page elements inside renderer or iframe and determine current index
  const findPages = () => {
    const wrap = rendererWrapRef.current;
    if (!wrap) return { pages: [] as Element[], rootIsIframe: false, iframe: null as HTMLIFrameElement | null };
    const iframe = wrap.querySelector('iframe') as HTMLIFrameElement | null;
    if (iframe && iframe.contentDocument) {
      const doc = iframe.contentDocument;
      const pages = Array.from(doc.querySelectorAll('.vivliostyle-page, .page, [data-vivliostyle-page-side]')) as Element[];
      return { pages, rootIsIframe: true, iframe };
    }
    // fallback: renderer container (in-document)
    const pages = Array.from(wrap.querySelectorAll('.vivliostyle-page, .page, [data-vivliostyle-page-side]')) as Element[];
    return { pages, rootIsIframe: false, iframe: null };
  };

  const refreshPages = () => {
    try {
      const { pages, rootIsIframe, iframe } = findPages();
      setPageCount(pages.length || 0);

      let foundIndex = 0;
      try {
        const rects = pages.map((el) => (el as HTMLElement).getBoundingClientRect());
        let best = { idx: 0, dist: Infinity };
        rects.forEach((r, i) => {
          const dist = Math.abs(r.top - 20);
          if (dist < best.dist) { best = { idx: i, dist }; }
        });
        foundIndex = best.idx;
      } catch (e) { /* ignore */ }

      setCurrentPage(foundIndex + 1);
    } catch (e) {
      // ignore
    }
  };

  const gotoPageIndex = (index: number) => {
    const { pages, rootIsIframe, iframe } = findPages();
    if (!pages || pages.length === 0) return;
    const idx = Math.max(0, Math.min(pages.length - 1, index));
    const el = pages[idx] as HTMLElement;
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {
      try { (el as any).scrollIntoView(); } catch (err) { /* ignore */ }
    }
    setCurrentPage(idx + 1);
  };

  const prevPage = () => gotoPageIndex(currentPage - 2);
  const nextPage = () => gotoPageIndex(currentPage);

  const toggleSpread = () => {
    try {
      const viewer = viewerRef.current;
      if (viewer && typeof viewer.setOptions === 'function') {
        viewer.setOptions({ spread: !isSpread });
        setIsSpread(!isSpread);
        setTimeout(refreshPages, 200);
        return;
      }
    } catch (e) { /* ignore */ }

    // fallback: toggle CSS class in the renderer root
    const wrap = rendererWrapRef.current;
    if (!wrap) { setIsSpread((s) => !s); return; }
    const bodyLike = wrap.querySelector('body') as HTMLElement | null;
    if (bodyLike) {
      if (!isSpread) bodyLike.classList.add('vivlio-spread-mode');
      else bodyLike.classList.remove('vivlio-spread-mode');
    }
    setIsSpread((s) => !s);
    setTimeout(refreshPages, 200);
  };

  const openRawHtml = () => {
    if (!sourceUrl) return;
    // Toggle inline raw-HTML iframe view. If already showing inline, switch back to renderer.
    setShowRawInline((s) => {
      const next = !s;
      // request a debug/info refresh after switch
      setTimeout(() => { try { collectVivlioDebug(); refreshPages(); } catch (e) { /* ignore */ } }, 120);
      return next;
    });
  };

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

      {/* Raw HTML button - opens the current generated HTML in a new tab for inspection */}
      <button
        onClick={openRawHtml}
        title="Open raw HTML"
        aria-label="Open raw HTML"
        style={{ position: 'absolute', top: 10, right: 104, zIndex: 1000, ...btnBase, padding: '6px' }}
      >
        🧾
      </button>

      {/* Simple viewer controls: prev/next, spread toggle, page indicator */}
      <div style={{ position: 'absolute', bottom: 12, left: 12, zIndex: 1000, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={prevPage} aria-label="Prev page" style={{ ...btnBase, padding: '6px 8px' }}>◀</button>
        <div style={{ minWidth: 120, display: 'flex', gap: 8, alignItems: 'center', background: 'rgba(0,0,0,0.38)', padding: '6px 8px', borderRadius: 8 }}>
          <button onClick={() => gotoPageIndex(0)} style={{ ...btnBase, padding: '6px 8px' }}>First</button>
          <div style={{ color: 'white', fontSize: 13 }}>{currentPage} / {pageCount || '–'}</div>
          <button onClick={() => gotoPageIndex((pageCount || 1) - 1)} style={{ ...btnBase, padding: '6px 8px' }}>Last</button>
        </div>
        <button onClick={nextPage} aria-label="Next page" style={{ ...btnBase, padding: '6px 8px' }}>▶</button>
        <button onClick={toggleSpread} aria-pressed={isSpread} title="Toggle single/spread" style={{ ...btnBase, padding: '6px 8px', background: isSpread ? 'rgba(60,160,60,0.85)' : btnBase.background }}>双頁</button>
      </div>
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
  <div style={{ position: 'absolute', top: 40, right: 20, width: 760, height: '72vh', background: 'rgba(28,28,30,0.85)', color: 'rgba(255,255,255,0.95)', borderRadius: 10, padding: 12, zIndex: 1000, overflow: 'auto', fontSize: 12, backdropFilter: 'blur(6px)', boxShadow: '0 12px 40px rgba(0,0,0,0.36)', border: '1px solid rgba(255,255,255,0.04)' }}>
        <style>{localScrollStyles}</style>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ fontSize: 13 }}>Vivliostyle Info</strong>
            <span style={{ fontSize: 12, opacity: 0.9 }}>{showMargins ? 'Margins ON' : 'Margins OFF'}</span>
          </div>
          {/* top action buttons removed as requested */}
          <div style={{ fontSize: 12, marginBottom: 8 }}>
            <div><strong>Pages found:</strong> {vivlioDebug?.entries?.length ?? 0}</div>
          </div>

          <Section title="Raw Markdown" collapsed={collapsed.md} onToggle={() => setCollapsed((s) => ({ ...s, md: !s.md }))} copy={() => doCopy('md', vivlioPayload?.rawMarkdown || '')} active={lastCopied === 'md'}>
            <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 220, overflow: 'auto', background: 'rgba(0,0,0,0.06)', padding: 8, borderRadius: 6, fontSize: 11 }}>{vivlioPayload ? (vivlioPayload.rawMarkdown || '(empty)') : '(not built yet)'}</pre>
          </Section>

          <Section title="Extracted user CSS" collapsed={collapsed.userCss} onToggle={() => setCollapsed((s) => ({ ...s, userCss: !s.userCss }))} copy={() => doCopy('userCss', vivlioPayload?.userCss || '')} active={lastCopied === 'userCss'}>
            <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 220, overflow: 'auto', background: 'rgba(0,0,0,0.09)', padding: 8, borderRadius: 6, fontSize: 11 }}>{vivlioPayload ? (vivlioPayload.userCss || '(none)') : '(not built yet)'}</pre>
          </Section>

          <Section title="Composed CSS (base + user + inline)" collapsed={collapsed.compCss} onToggle={() => setCollapsed((s) => ({ ...s, compCss: !s.compCss }))} copy={() => doCopy('compCss', vivlioPayload?.finalCss || '')} active={lastCopied === 'compCss'}>
            <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 220, overflow: 'auto', background: 'rgba(0,0,0,0.12)', padding: 8, borderRadius: 6, fontSize: 11 }}>{vivlioPayload ? (vivlioPayload.finalCss || '(none)') : '(not built yet)'}</pre>
          </Section>

          <Section title="Final HTML (passed to Vivliostyle)" collapsed={collapsed.html} onToggle={() => setCollapsed((s) => ({ ...s, html: !s.html }))} copy={() => doCopy('html', vivlioPayload?.html || '')} active={lastCopied === 'html'}>
            <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 320, overflow: 'auto', background: 'rgba(0,0,0,0.04)', padding: 8, borderRadius: 6, fontSize: 11 }}>{vivlioPayload ? (vivlioPayload.html || '(none)') : '(not built yet)'}</pre>
          </Section>
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
          showRawInline ? (
            <iframe
              key={sourceUrl + (showMargins ? '_m' : '_n') + '_raw'}
              src={sourceUrl}
              title="Vivliostyle Raw HTML"
              style={{ width: '100%', height: '100%', border: 0 }}
              onLoad={() => { try { collectVivlioDebug(); refreshPages(); } catch (e) { /* ignore */ } }}
            />
          ) : (
            <Renderer
              key={sourceUrl + (showMargins ? '_m' : '_n')}
              source={sourceUrl}
              onLoad={(params: any) => {
                try {
                  // params may include container and viewer depending on version
                  const viewer = params.viewer || (params as any).vivliostyleViewer || null;
                  viewerRef.current = viewer || viewerRef.current;
                  // allow external debug collector
                  try { collectVivlioDebug(); } catch (e) { /* ignore */ }
                  // refresh page list
                  setTimeout(refreshPages, 120);
                } catch (e) { /* ignore */ }
              }}
            >
              {({ container }: any) => container}
            </Renderer>
          )
        )}
      </div>
    </div>
  );
};
