import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Renderer } from '@vivliostyle/react';
import { buildVfmPayload, buildVfmPayloadAsync, injectInlineStyle } from '../vfm/buildVfmHtml';
import { createVfmClient } from '../vfmWorkerClient';
import './VivliostylePreview.css';

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
    <div className="vivlio-section">
      <div className="vivlio-section-header" onClick={onToggle} role="button" tabIndex={0}>
        <div className="vivlio-section-title">
          <span style={{ display: 'inline-block', width: 14, textAlign: 'center', fontSize: 12, lineHeight: '12px' }}>{collapsed ? '▶' : '▼'}</span>
          <span style={{ fontSize: 12, lineHeight: '14px' }}>{title}</span>
        </div>
        {copy && (
          <button
            onClick={(e) => { e.stopPropagation(); copy(); }}
            aria-label={`Copy ${title}`}
            className={`vivlio-section-copy ${active ? 'active' : ''}`}
          >
            {active ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
      {!collapsed && (
        <div className="vivlio-section-content">
          <div className="vivlio-section-scroll">{children}</div>
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
    let cancelled = false;
    const client = createVfmClient();
    (async () => {
      if (!markdown) { if (!cancelled) { setSourceUrl(null); setVivlioPayload(null); } return; }
      try {
        // use stringifyLatest so newer edits cancel older work
        const html = await client.stringifyLatest(markdown, { title: 'Preview', language: 'ja', math: true });
        if (cancelled) return;
        // inject CSS & script the same way as buildVfmPayloadAsync
        const payload = (() => {
          // reuse synchronous helper to assemble final HTML pieces
          const userCssMatch = (markdown || '').match(/```\s*vivliocss\s*\n([\s\S]*?)```/i);
          const userCss = userCssMatch ? (userCssMatch[1] || '') : '';
          const finalCss = '' + (userCss ? '\n' + userCss : '');
          const withCss = injectInlineStyle(html, finalCss);
          return { rawMarkdown: markdown, userCss, finalCss, html: withCss };
        })();
        setVivlioPayload(payload);
        const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(payload.html)}`;
        setSourceUrl(dataUrl);
      } catch (error) {
        console.error('[VivlioDBG] Error building HTML (async worker):', error);
        if (!cancelled) { setSourceUrl(null); setVivlioPayload(null); }
      }
    })();
    return () => { cancelled = true; try { client.cancelPending(); client.terminate(); } catch (e) {} };
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
    <div className="vivlio-simple-viewer" style={{ ['--vivlio-gutter' as any]: GUTTER_COLOR }}>
      {/* Information button */}
      <button
        onClick={() => setShowInfo(!showInfo)}
        title="Toggle info"
        aria-label="Toggle info"
        className={`vivlio-info-button ${showInfo ? 'active' : ''}`}
      >
        ℹ️
      </button>

      {/* Raw HTML button - opens the current generated HTML in a new tab for inspection */}
      <button
        onClick={openRawHtml}
        title="Open raw HTML"
        aria-label="Open raw HTML"
        className={`vivlio-raw-button ${showRawInline ? 'active' : ''}`}
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
            <pre className="vivlio-pre-small">{vivlioPayload ? (vivlioPayload.rawMarkdown || '(empty)') : '(not built yet)'}</pre>
          </Section>

          <Section title="Final HTML (passed to Vivliostyle)" collapsed={collapsed.html} onToggle={() => setCollapsed((s) => ({ ...s, html: !s.html }))} copy={() => doCopy('html', vivlioPayload?.html || '')} active={lastCopied === 'html'}>
            <pre className="vivlio-pre">{vivlioPayload ? (vivlioPayload.html || '(none)') : '(not built yet)'}</pre>
          </Section>
        </div>
      )}

      {/* Viewer (iframe-isolated). Buttons/panel use zIndex 10000 to remain above iframe. */}
  <div className="vivlio-viewer-wrapper">
        {vivlioPayload && (() => {
          // When showing raw HTML, use the full generated payload in srcDoc.
          // When using the React Renderer mounted into the iframe, use a minimal
          // shell that only contains the mount node to avoid double-initialization
          // by scripts present in the full payload.
          const minimalShell = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1" /><title>Vivlio Preview</title><style>
            :root{ --vivlio-bg: ${GUTTER_COLOR}; }
            html,body{height:100%;margin:0;padding:0;background:var(--vivlio-bg)}
            #vivlio-root{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}
            .page,[data-vivliostyle-page-container]{background:#fff}
            /* Prefer overflow visible on known viewer containers so shadows can escape */
            [data-vivliostyle-viewer-viewport],[data-vivliostyle-root],[data-vivliostyle-spread-container]{overflow:visible!important}
            /* Ancestor-transparency helper: applied temporarily to ancestors to allow shadow to show through */
            .vivlio--ancestor-transparent{ background: transparent !important; }
            /* Bleed shadow overlay */
            #vivlio-bleed-shadow{position:absolute;pointer-events:none;z-index:9999;box-shadow:0 32px 64px rgba(0,0,0,0.5);transition:opacity .22s;opacity:.98}
          </style></head><body><div id="vivlio-root"></div><script>
            (function(){
              try{
                function createOverlay(){
                  if(!document.getElementById('vivlio-bleed-shadow')){
                    var s=document.createElement('div');s.id='vivlio-bleed-shadow';document.body.appendChild(s);
                  }
                }

                function findSpread(){
                  return document.querySelector('[data-vivliostyle-spread-container]')||document.querySelector('[data-vivliostyle-page-container]')||document.querySelector('.page');
                }

                function getAncestors(el){
                  var list=[];while(el && el !== document.documentElement){ list.push(el); el = el.parentElement; } return list;
                }

                var transparentAncestors = [];
                function makeAncestorsTransparent(spread){
                  try{
                    if(!spread) return;
                    var ancestors = getAncestors(spread.parentElement || spread);
                    ancestors.forEach(function(a){
                      try{
                        // only modify if it has a non-transparent background or overflow hidden
                        var cs = window.getComputedStyle(a);
                        if((cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') || cs.overflow === 'hidden' || cs.transform && cs.transform !== 'none'){
                          a.classList.add('vivlio--ancestor-transparent');
                          transparentAncestors.push(a);
                        }
                      }catch(e){}
                    });
                    // expose restore helper
                    window.__vivlio_restoreAncestorTransparency = function(){ try{ transparentAncestors.forEach(function(a){ a.classList.remove('vivlio--ancestor-transparent'); }); transparentAncestors = []; delete window.__vivlio_restoreAncestorTransparency; }catch(e){} };
                  }catch(e){}
                }

                function restoreAncestors(){ try{ if(window.__vivlio_restoreAncestorTransparency) window.__vivlio_restoreAncestorTransparency(); }catch(e){} }

                function update(){
                  var spread=findSpread();
                  var s=document.getElementById('vivlio-bleed-shadow');
                  if(!spread||!s) return;
                  // ensure ancestors are temporarily transparent so shadow isn't clipped
                  // clear any previous modifications first
                  restoreAncestors(); makeAncestorsTransparent(spread);
                  var r=spread.getBoundingClientRect();
                  s.style.left=(r.left+window.scrollX)+'px';s.style.top=(r.top+window.scrollY)+'px';s.style.width=Math.max(0,r.width)+'px';s.style.height=Math.max(0,r.height)+'px';
                }

                createOverlay();update();
                var ro=new ResizeObserver(update);var mo=new MutationObserver(update);
                var found=findSpread();
                if(found){ try{ ro.observe(found); mo.observe(found,{childList:true,subtree:true,attributes:true}); }catch(e){} }
                var bodyObserver=new MutationObserver(function(){ var f=findSpread(); if(f){ try{ update(); ro.observe(f); mo.observe(f,{childList:true,subtree:true,attributes:true}); }catch(e){} bodyObserver.disconnect(); } });
                try{ bodyObserver.observe(document.body,{childList:true,subtree:true}); }catch(e){}
                window.addEventListener('resize',update);window.addEventListener('scroll',update,true);var poll=setInterval(update,500);
                window.addEventListener('unload',function(){ try{ clearInterval(poll); ro.disconnect(); mo.disconnect(); bodyObserver.disconnect(); restoreAncestors(); }catch(e){} });
              }catch(e){}
            })();
          </script></body></html>`;

          const iframeSrcDoc = showRawInline ? (vivlioPayload?.html || '') : minimalShell;

          return (
            <iframe
              ref={iframeRef}
              className="vivlio-iframe"
              key={(vivlioPayload?.html || '') + (showRawInline ? '_raw' : '_n')}
              srcDoc={iframeSrcDoc}
              title={showRawInline ? 'Vivliostyle Raw HTML' : 'Vivliostyle Preview'}
              onLoad={handleIframeLoad}
            />
          );
        })()}
        {/* Render React-based Renderer into the iframe using a portal when possible. */}
        {portalContainer && vivlioPayload && sourceUrl && !showRawInline && createPortal(
          <div className="vivlio-portal">
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
