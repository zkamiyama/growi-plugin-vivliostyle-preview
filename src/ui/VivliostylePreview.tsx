import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Renderer } from '@vivliostyle/react';
import { buildVfmPayload } from '../vfm/buildVfmHtml';

interface VivliostylePreviewProps {
  markdown: string;
}

export const VivliostylePreview: React.FC<VivliostylePreviewProps> = ({ markdown }) => {
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [vivlioPayload, setVivlioPayload] = useState<any>(null);
  const [showRawInline, setShowRawInline] = useState<boolean>(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  // Unified gutter/background color for iframe and outer wrapper
  const GUTTER_COLOR = '#e6e6e6';

  
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

  const activeBtn = (active: boolean): React.CSSProperties => ({
    ...btnBase,
    background: active ? 'rgba(40,120,180,0.95)' : btnBase.background,
    boxShadow: active ? '0 6px 18px rgba(0,0,0,0.32)' : btnBase.boxShadow,
    color: active ? 'white' : btnBase.color
  });

  // Minimal viewer: we only build payload and display it. Advanced debug/page logic removed.

  const openRawHtml = () => { if (!sourceUrl) return; setShowRawInline((s) => !s); };

  React.useEffect(() => {
    if (showInfo) {
      // immediate attempt when panel is opened
  // debug collection removed; info panel will show raw payload only
    }
  }, [showInfo]);

  useEffect(() => {
    if (!markdown) { setSourceUrl(null); setVivlioPayload(null); return; }
    try {
      // Build payload without injecting @page rules; margin visuals are not used.
      const payload = buildVfmPayload(markdown, {});
      setVivlioPayload(payload);
      const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(payload.html)}`;
      setSourceUrl(dataUrl);
    } catch (error) {
      console.error('[VivlioDBG] Error building HTML:', error);
      setSourceUrl(null);
      setVivlioPayload(null);
    }
  }, [markdown]);

  // Setup portal container when iframe loads. Use srcDoc instead of document.write
  // to avoid cross-document races. onLoad handler below populates portalContainer.
  const handleIframeLoad = () => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;
      const mount = doc.getElementById('vivlio-root');
      if (mount) setPortalContainer(mount as HTMLElement);
      else {
        // fallback: create mount node
        const el = doc.createElement('div');
        el.id = 'vivlio-root';
        doc.body.appendChild(el);
        setPortalContainer(el);
      }
    } catch (e) {
      console.warn('[VivlioDBG] iframe onLoad mount failed', e);
      setPortalContainer(null);
    }
  };

  // Diagnostic CSS injection removed to keep preview minimal and side-effect free
  if (!sourceUrl) {
    return <div>Loading...</div>;
  }

  return (
    <div className="vivlio-simple-viewer" style={{ height: '100%', width: '100%', position: 'relative', background: GUTTER_COLOR }}>
      {/* Information button */}
      <button
        onClick={() => setShowInfo(!showInfo)}
        title="Toggle info"
        aria-label="Toggle info"
        style={{ position: 'absolute', top: 10, right: 24, zIndex: 1000, padding: '6px', ...activeBtn(showInfo) }}
      >
        ℹ️
      </button>

      {/* Raw HTML button - opens the current generated HTML in a new tab for inspection */}
      <button
        onClick={openRawHtml}
        title="Open raw HTML"
        aria-label="Open raw HTML"
        style={{ position: 'absolute', top: 10, right: 104, zIndex: 1000, padding: '6px', ...activeBtn(showRawInline) }}
      >
        🧾
      </button>

  {/* Viewer controls removed (page navigation and viewer API not needed for minimal display) */}
  {/* Margin visualization removed */}

      {/* Information panel (simplified) */}
  {showInfo && (
  <div style={{ position: 'absolute', top: 40, right: 20, width: 760, height: '72vh', background: 'rgba(28,28,30,0.85)', color: 'rgba(255,255,255,0.95)', borderRadius: 10, padding: 12, zIndex: 1000, overflow: 'auto', fontSize: 12, backdropFilter: 'blur(6px)', boxShadow: '0 12px 40px rgba(0,0,0,0.36)', border: '1px solid rgba(255,255,255,0.04)' }}>
        <style>{localScrollStyles}</style>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ fontSize: 13 }}>Vivliostyle Info</strong>
          </div>
          {/* top action buttons removed as requested */}
          <div style={{ fontSize: 12, marginBottom: 8 }}>
            <div><strong>Preview built:</strong> {vivlioPayload ? 'yes' : 'no'}</div>
          </div>

          <Section title="Raw Markdown" collapsed={collapsed.md} onToggle={() => setCollapsed((s) => ({ ...s, md: !s.md }))} copy={() => doCopy('md', vivlioPayload?.rawMarkdown || '')} active={lastCopied === 'md'}>
            <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 220, overflow: 'auto', background: 'rgba(0,0,0,0.06)', padding: 8, borderRadius: 6, fontSize: 11 }}>{vivlioPayload ? (vivlioPayload.rawMarkdown || '(empty)') : '(not built yet)'}</pre>
          </Section>

          <Section title="Final HTML (passed to Vivliostyle)" collapsed={collapsed.html} onToggle={() => setCollapsed((s) => ({ ...s, html: !s.html }))} copy={() => doCopy('html', vivlioPayload?.html || '')} active={lastCopied === 'html'}>
            <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 320, overflow: 'auto', background: 'rgba(0,0,0,0.04)', padding: 8, borderRadius: 6, fontSize: 11 }}>{vivlioPayload ? (vivlioPayload.html || '(none)') : '(not built yet)'}</pre>
          </Section>
        </div>
      )}

      {/* Viewer (iframe-isolated). Buttons/panel use zIndex 10000 to remain above iframe. */}
      <div style={{ height: '100%', width: '100%', position: 'relative' }}>
        {vivlioPayload && (() => {
          // When showing raw HTML, use the full generated payload in srcDoc.
          // When using the React Renderer mounted into the iframe, use a minimal
          // shell that only contains the mount node to avoid double-initialization
          // by scripts present in the full payload.
          const minimalShell = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1" /><title>Vivlio Preview</title><style>
            /* unified bg token for gutters/outside area */
            :root { --vivlio-bg: ${GUTTER_COLOR}; --bleed-shadow: rgba(0,0,0,0.12); }
            html, body { height: 100%; margin: 0; padding: 0; background: var(--vivlio-bg); }
            /* center the viewer inside the gray gutter */
            #vivlio-root { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; box-sizing: border-box; }
            /* pages themselves (spread container contents) should remain white; remove runtime shadows */
            .vivliostyle-page, .page, [data-vivliostyle-page-container] {
              background: white;
              box-shadow: none;
            }
            /* keep spread container transparent so the gutter (body) shows through as gray */
            [data-vivliostyle-spread-container], [data-vivliostyle-root] { background: transparent; }
            /* ensure the viewer viewport uses the same gutter color (override runtime CSS if necessary) */
            [data-vivliostyle-viewer-viewport], html[data-vivliostyle-paginated] [data-vivliostyle-viewer-viewport] { background: var(--vivlio-bg) !important; }
            /* overlays injected by the host script */
            #vivlio-bleed-shadow, #vivlio-margin-guide { position: absolute; pointer-events: none; z-index: 9999; box-sizing: border-box; }
            #vivlio-bleed-shadow { box-shadow: 0 32px 64px rgba(0,0,0,0.5); transition: opacity 220ms linear; opacity: 0.98; }
            #vivlio-margin-guide { border: 2px dashed rgba(255,165,0,0.95); border-radius: 0; display: none; }
          </style></head><body><div id="vivlio-root"></div>
          <script>
            (function(){
              try {
                var SHOW_MARGINS = false;
                function ensureOverlays() {
                  if (!document.getElementById('vivlio-bleed-shadow')) {
                    var s = document.createElement('div');
                    s.id = 'vivlio-bleed-shadow';
                    s.style.position = 'absolute';
                    s.style.pointerEvents = 'none';
                    s.style.zIndex = '9999';
                    s.style.boxShadow = '0 32px 64px rgba(0,0,0,0.5)';
                    s.style.transition = 'opacity 220ms linear';
                    s.style.opacity = '0.98';
                    document.body.appendChild(s);
                  }
                  if (!document.getElementById('vivlio-margin-guide')) {
                    var g = document.createElement('div');
                    g.id = 'vivlio-margin-guide';
                    g.style.position = 'absolute';
                    g.style.pointerEvents = 'none';
                    g.style.zIndex = '9999';
                    g.style.border = '2px dashed rgba(255,165,0,0.95)';
                    g.style.display = 'none';
                    // inner guide uses CSS inset in mm to avoid layout math here
                    var inner = document.createElement('div');
                    inner.style.position = 'absolute';
                    inner.style.left = '12mm';
                    inner.style.top = '12mm';
                    inner.style.right = '12mm';
                    inner.style.bottom = '12mm';
                    inner.style.border = '1px dashed rgba(255,165,0,0.9)';
                    inner.style.pointerEvents = 'none';
                    g.appendChild(inner);
                    document.body.appendChild(g);
                  }
                }

                function updateOverlays() {
                  var spread = document.querySelector('[data-vivliostyle-spread-container]') || document.querySelector('[data-vivliostyle-page-container]') || document.querySelector('.page');
                  var s = document.getElementById('vivlio-bleed-shadow');
                  var g = document.getElementById('vivlio-margin-guide');
                  if (!spread || !s) return;
                  var r = spread.getBoundingClientRect();
                  var left = r.left + window.scrollX;
                  var top = r.top + window.scrollY;
                  s.style.left = left + 'px';
                  s.style.top = top + 'px';
                  s.style.width = Math.max(0, r.width) + 'px';
                  s.style.height = Math.max(0, r.height) + 'px';
                  if (g) {
                    g.style.left = left + 'px';
                    g.style.top = top + 'px';
                    g.style.width = Math.max(0, r.width) + 'px';
                    g.style.height = Math.max(0, r.height) + 'px';
                    g.style.display = SHOW_MARGINS ? 'block' : 'none';
                  }
                }

                ensureOverlays();
                updateOverlays();

                var ro = new ResizeObserver(function(){ updateOverlays(); });
                var mo = new MutationObserver(function(){ updateOverlays(); });
                var spreadEl = document.querySelector('[data-vivliostyle-spread-container]') || document.querySelector('[data-vivliostyle-page-container]') || document.querySelector('.page');
                if (spreadEl) {
                  try { ro.observe(spreadEl); } catch(e) { /* ignore */ }
                  try { mo.observe(spreadEl, { childList: true, subtree: true, attributes: true }); } catch(e) { /* ignore */ }
                }
                window.addEventListener('resize', updateOverlays);
                window.addEventListener('scroll', updateOverlays, true);
                // fallback polling for environments without RO
                var poll = setInterval(updateOverlays, 500);
                // clean up on unload
                window.addEventListener('unload', function(){ try { clearInterval(poll); ro.disconnect(); mo.disconnect(); } catch(e) {} });
              } catch (e) { /* ignore iframe helper errors */ }
            })();
          </script></body></html>`;

          const iframeSrcDoc = showRawInline ? (vivlioPayload?.html || '') : minimalShell;

          return (
            <iframe
              ref={iframeRef}
              key={(vivlioPayload?.html || '') + (showRawInline ? '_raw' : '_n')}
              srcDoc={iframeSrcDoc}
              title={showRawInline ? 'Vivliostyle Raw HTML' : 'Vivliostyle Preview'}
              style={{ width: '100%', height: '100%', border: 0, zIndex: 1 }}
              onLoad={handleIframeLoad}
            />
          );
        })()}
        {/* Render React-based Renderer into the iframe using a portal when possible. */}
        {portalContainer && vivlioPayload && sourceUrl && !showRawInline && createPortal(
          <div style={{ width: '100%', height: '100%' }}>
            {/* Use data URL so the viewer treats source as a URL resource (data:...) instead of attempting to fetch raw HTML text as a URL */}
            <Renderer source={sourceUrl} style={{ width: '100%', height: '100%' }} />
          </div>,
          portalContainer
        )}
        {/* If showRawInline is true, we simply let src display the raw HTML in the iframe */}
      </div>
    </div>
  );
};

/**
 * If any ancestor (up to document.body) has a computed transform other than
 * 'none', temporarily set inline style transform='none' for diagnosis and
 * layout. The function registers window.__vivlio_restoreTransform() that
 * restores original transforms.
 */
function handleAncestorTransformsForDiagnosis(container: Element | null) {
  try {
    if (!container) return;
    const root = container instanceof HTMLIFrameElement ? (container.contentDocument?.body as Element | null) : container as Element;
    if (!root) return;

    const transforms: Array<{ el: Element; original: string | null }> = [];
    let el: Element | null = root;
    while (el && el !== document.documentElement && el !== document.body) {
      const cs = window.getComputedStyle(el as Element);
      if (cs && cs.transform && cs.transform !== 'none') {
        transforms.push({ el, original: (el as HTMLElement).style.transform || null });
        (el as HTMLElement).style.transform = 'none';
      }
      el = el.parentElement;
    }

    if (transforms.length > 0) {
      // register restore helper globally so devtools message can call it
      (window as any).__vivlio_restoreTransform = () => {
        transforms.forEach(t => {
          try { if (t.original === null) (t.el as HTMLElement).style.removeProperty('transform'); else (t.el as HTMLElement).style.transform = t.original; } catch (e) { /* ignore */ }
        });
        delete (window as any).__vivlio_restoreTransform;
      };
      // schedule an automatic restore after short delay to avoid leaving the
      // host page mutated longer than necessary
      window.setTimeout(() => { try { (window as any).__vivlio_restoreTransform?.(); } catch (e) { /* ignore */ } }, 2000);
    }
  } catch (e) { /* ignore */ }
}
