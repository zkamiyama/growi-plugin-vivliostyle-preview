// ui/VivliostylePreview.tsx
// Vivliostyle React Renderer を使って Markdown を即時プレビュー表示する最終版コンポーネント
import React, { useState, useEffect } from 'react';
import { stringify } from '@vivliostyle/vfm';
import { Renderer } from '@vivliostyle/react';

interface VivliostylePreviewProps {
  markdown: string;
  isVisible: boolean;
}

export const VivliostylePreview: React.FC<VivliostylePreviewProps> = ({ markdown, isVisible }) => {
  const [dataUrl, setDataUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [htmlLen, setHtmlLen] = useState(0);
  const [encodedLen, setEncodedLen] = useState(0);
  const [fullHtml, setFullHtml] = useState('');
  const blobUrlRef = React.useRef<string | null>(null);
  const [editorMd, setEditorMd] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [pageInfo, setPageInfo] = useState<{ size?: string|null; margins?: string[]; pageRuleFound: boolean }>({ pageRuleFound: false });

  useEffect(() => {
    if (!isVisible) return;
    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG][Preview] effect start', { mdLen: markdown.length, time: Date.now() });
    if (!markdown) {
      setDataUrl('');
      setErrorMsg(null);
      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG][Preview] empty markdown');
      return;
    }
    try {
      const generated = stringify(markdown);
      setFullHtml(generated);
      setHtmlLen(generated.length);
      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG][Preview] html generated', { htmlLen: generated.length, sample: generated.slice(0, 120) });
      // 素朴な @page 解析 (size / margin キー抽出)
      try {
        const pageRuleMatch = generated.match(/@page[^}]*{[^}]*}/g);
        if (pageRuleMatch && pageRuleMatch.length) {
          const first = pageRuleMatch[0];
          const sizeMatch = first.match(/size:\s*([^;]+);?/);
          const marginMatches = Array.from(first.matchAll(/margin[a-z-]*:\s*[^;]+;?/g)).map(m => m[0]);
          setPageInfo({
            pageRuleFound: true,
            size: sizeMatch ? sizeMatch[1].trim() : null,
            margins: marginMatches,
          });
        } else {
          setPageInfo({ pageRuleFound: false });
        }
      } catch (e) {
        setPageInfo({ pageRuleFound: false });
      }
      // Use Blob URL instead of base64 data URL to avoid heavy base64 encoding on large HTML
      try {
        const blob = new Blob([generated], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        // revoke previous blob URL if any
        if (blobUrlRef.current) {
          try { URL.revokeObjectURL(blobUrlRef.current); } catch (e) { /* ignore */ }
        }
        blobUrlRef.current = url;
        setEncodedLen(generated.length);
        setDataUrl(url);
      } catch (e) {
        // fallback to data URL if Blob/URL.createObjectURL not available
        const base64 = btoa(unescape(encodeURIComponent(generated)));
        const url = `data:text/html;base64,${base64}`;
        setEncodedLen(url.length);
        setDataUrl(url);
      }
      setErrorMsg(null);
  // eslint-disable-next-line no-console
  console.debug('[VivlioDBG][Preview] dataUrl ready', { encodedLen: generated.length });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[VivlioDBG][Preview] stringify failed', e);
      setErrorMsg((e as Error).message);
      setDataUrl('');
    }
  }, [markdown, isVisible]);

  useEffect(() => {
    if (!isVisible) return;
    // 初回レンダー/アンマウントログ
    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG][Preview] mount', { time: Date.now() });
    return () => {
      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG][Preview] unmount', { time: Date.now() });
    };
  }, [isVisible]);

  if (!isVisible) return null;

  // Try to read raw markdown from CodeMirror 6 EditorView (state.doc) if available
  React.useEffect(() => {
    let pollId: number | null = null;
    try {
      const EditorView = (window as any).EditorView || (window as any).CodeMirror?.EditorView;
      if (!EditorView || typeof EditorView.findFromDOM !== 'function') return;
      const cmRoot = document.querySelector('.cm-editor');
      if (!cmRoot) return;
      const view = EditorView.findFromDOM(cmRoot as HTMLElement);
      if (!view) return;
      const read = () => {
        try {
          // Prefer view.state.doc.toString() (more robust across CM6 builds).
          // Fall back to sliceDoc() if doc.toString is not available.
          let txt = '';
          if (view.state && view.state.doc && typeof view.state.doc.toString === 'function') {
            txt = view.state.doc.toString();
          } else if (view.state && typeof view.state.sliceDoc === 'function') {
            txt = view.state.sliceDoc();
          }
          if (txt && txt !== editorMd) setEditorMd(txt);
        } catch (e) { /* ignore */ }
      };
      read();
      // Try to attach an updateListener if available, else fallback to light polling
      try {
        if (EditorView.updateListener && typeof EditorView.updateListener.of === 'function') {
          const listener = EditorView.updateListener.of((u: any) => { if (u.docChanged) read(); });
          // best-effort appendConfig
          try { view.dispatch?.({ effects: (window as any).StateEffect?.appendConfig?.of(listener) }); } catch (e) { /* ignore */ }
        } else {
          pollId = window.setInterval(read, 500);
        }
      } catch (e) {
        pollId = window.setInterval(read, 500);
      }
    } catch (e) {
      // ignore
    }
    return () => { if (pollId) clearInterval(pollId); };
  }, []);

  // If editorMd is present, regenerate fullHtml from it so renderer gets correct content.
  React.useEffect(() => {
    if (!editorMd) return;
    let to: number | null = null;
    const doGenerate = () => {
      try {
        const generated = stringify(editorMd);
        // quick validation: must contain <html and <body
        const looksLikeHtml = /<\s*!doctype|<html[\s>]/i.test(generated) && /<body[\s>]/i.test(generated);
        if (!looksLikeHtml) {
          // log full sample for diagnostics
          // eslint-disable-next-line no-console
          console.error('[VivlioDBG][Preview] stringify produced invalid HTML sample', { sample: generated.slice(0, 200) });
          setErrorMsg('Vivliostyle produced invalid HTML. Check input.');
          // don't update dataUrl/fullHtml to avoid feeding broken content to Renderer
          return;
        }
        setFullHtml(generated);
        setHtmlLen(generated.length);
        try {
          const blob = new Blob([generated], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          if (blobUrlRef.current) {
            try { URL.revokeObjectURL(blobUrlRef.current); } catch (e) { /* ignore */ }
          }
          blobUrlRef.current = url;
          setEncodedLen(generated.length);
          setDataUrl(url);
        } catch (e) {
          const base64 = btoa(unescape(encodeURIComponent(generated)));
          const url = `data:text/html;base64,${base64}`;
          setEncodedLen(url.length);
          setDataUrl(url);
        }
        setErrorMsg(null);
        // debug log
        // eslint-disable-next-line no-console
        console.debug('[VivlioDBG][Preview] stringify(editorMd) ok', { htmlLen: generated.length, sample: generated.slice(0, 120) });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[VivlioDBG][Preview] stringify failed (editorMd)', e);
        setErrorMsg((e as Error).message);
        setDataUrl('');
      }
    };
    // debounce to avoid partial intermediate state
    to = window.setTimeout(doGenerate, 120);
    return () => { if (to) clearTimeout(to); };
  }, [editorMd]);

  // Use data URL as the Renderer source so the viewer loads inline HTML and
  // does not attempt to fetch the string as a remote URL (which causes CORS/fetch errors).
  // rendererSource must be a URL string (prefer Blob/data URL stored in state). Do not recreate base64 inline here.
  const rendererSource = dataUrl || null;
  // Extract user CSS from markdown code block labeled ```vivliocss
  // Also support cases where the editor folds code and produces
  // <pre class="language-vivliocss…"> truncated forms in the generated HTML.
  const extractUserCss = (md: string) => {
    // 1) Prefer explicit markdown fenced block
    const m = md.match(/```vivliocss\s*([\s\S]*?)```/i);
    if (m) return m[1].trim();

    // 2) Fallback: try to extract from generated fullHtml <pre class="language-vivliocss..."> blocks
    if (fullHtml) {
      const preMatch = fullHtml.match(/<pre[^>]*class=(?:"|')([^"']*language-vivliocss[^"']*)(?:"|')[^>]*>([\s\S]*?)<\/pre>/i);
      if (preMatch) {
        let content = preMatch[2] || '';
        // If wrapped in <code>..</code>, strip tags
        content = content.replace(/^\s*<code[^>]*>/i, '').replace(/<\/code>\s*$/i, '');
        // Unescape basic HTML entities
        content = content.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
        // Remove trailing ellipsis characters that editors insert when folding (e.g. '…' or '...')
        content = content.replace(/[\u2026]+$|\.\.\.+$/m, '').trim();
        return content;
      }
    }
    return '';
  };

  const userCss = extractUserCss(markdown || '');

  // Determine page size: prefer @page in userCss, else fallback to A4 portrait no-margin
  const detectPageSizeFromCss = (css: string) => {
    // match @page{...size: <w> <h>;...}
    const pageMatch = css.match(/@page[^{]*{([\s\S]*?)}/i);
    if (pageMatch) {
      const inside = pageMatch[1];
      const sizeMatch = inside.match(/size:\s*([^;]+);?/i);
      if (sizeMatch) {
        const parts = sizeMatch[1].trim().split(/\s+/);
        if (parts.length >= 2) return { width: parts[0], height: parts[1], margin: null };
        return { width: parts[0], height: null, margin: null };
      }
      const marginMatch = inside.match(/margin:\s*([^;]+);?/i);
      return { width: null, height: null, margin: marginMatch ? marginMatch[1].trim() : null };
    }
    return { width: null, height: null, margin: null };
  };

  const pageSpec = detectPageSizeFromCss(userCss);
  const pageWidth = pageSpec.width || '210mm';
  const pageHeight = pageSpec.height || '297mm';
  const pageMargin = pageSpec.margin || '0mm';

  // Build final stylesheet to pass into Renderer. If user provided CSS, use it verbatim (user controls all CSS).
  // If none provided, provide fallback A4 portrait no-margin + vertical writing-mode.
  const finalUserStyleSheet = userCss
    ? userCss
    : `@page{size:${pageWidth} ${pageHeight}; margin:${pageMargin};} html,body{background:#fff !important;color:#222 !important;-webkit-font-smoothing:antialiased;font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Noto Sans JP','Hiragino Sans','Hiragino Kaku Gothic ProN','Meiryo',sans-serif; height:100%; overflow:hidden !important;} body{writing-mode:vertical-rl !important; text-orientation:upright !important;} h1,h2,h3,h4,h5{color:#111 !important;} p{color:#222 !important;} a{color:#0645ad !important;}`;

  // Refs for measuring and scaling
  const viewerRef = React.useRef<HTMLDivElement | null>(null);
  const sheetRef = React.useRef<HTMLDivElement | null>(null);
  const rendererWrapRef = React.useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = React.useState<number>(1);

  // Compute fit-to-container scale so the entire sheet is visible (never upscale beyond 1)
  React.useLayoutEffect(() => {
    function recompute() {
      const viewer = viewerRef.current;
      const sheet = sheetRef.current;
      if (!viewer || !sheet) return;
      const vRect = viewer.getBoundingClientRect();
      const sRect = sheet.getBoundingClientRect();
      // available space inside viewer (padding included)
      const availW = vRect.width - 0; // no extra padding
      const availH = vRect.height - 0;
      if (sRect.width <= 0 || sRect.height <= 0) return;
      const fit = Math.min(availW / sRect.width, availH / sRect.height, 1);
      setScale(Number(fit.toFixed(4)));
      // apply transform to renderer wrap if exists
      if (rendererWrapRef.current) {
        rendererWrapRef.current.style.transform = `scale(${fit})`;
        rendererWrapRef.current.style.transformOrigin = 'top left';
      }
    }
    recompute();
    window.addEventListener('resize', recompute);
    const ro = new ResizeObserver(recompute);
    if (viewerRef.current) ro.observe(viewerRef.current);
    if (sheetRef.current) ro.observe(sheetRef.current);
    return () => { window.removeEventListener('resize', recompute); ro.disconnect(); };
  }, [fullHtml, dataUrl, userCss, pageWidth, pageHeight]);

  // cleanup blob URL on unmount
  React.useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        try { URL.revokeObjectURL(blobUrlRef.current); } catch (e) { /* ignore */ }
        blobUrlRef.current = null;
      }
    };
  }, []);

  /**
   * A small draggable & 4-corner-resizable panel used for the info overlay.
   * Implemented inline to avoid adding new files. Uses pointer events and
   * positions itself relative to its offsetParent (the sheet container).
   */
  const DraggableInfoPanel: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
    const rootRef = React.useRef<HTMLDivElement | null>(null);
    const parentRef = React.useRef<HTMLElement | null>(null);
    const dragging = React.useRef(false);
    const resizing = React.useRef<null | { dir: string; startX: number; startY: number; startW: number; startH: number; startL: number; startT: number; }> (null);
    const dragStart = React.useRef<{ x: number; y: number; left: number; top: number }>({ x: 0, y: 0, left: 0, top: 0 });
    const [pos, setPos] = React.useState<{ left: number | null; top: number }>({ left: null, top: 8 });
    const [size, setSize] = React.useState<{ width: number; height: number }>({ width: 320, height: 240 });

    React.useEffect(() => {
      parentRef.current = (rootRef.current && (rootRef.current.offsetParent as HTMLElement)) || document.body;
    }, []);

    const onPointerMove = React.useCallback((ev: PointerEvent) => {
      const p = parentRef.current;
      const r = rootRef.current;
      if (!p || !r) return;
      const pRect = p.getBoundingClientRect();

      if (dragging.current) {
        const dx = ev.clientX - dragStart.current.x;
        const dy = ev.clientY - dragStart.current.y;
        let newLeft = dragStart.current.left + dx;
        let newTop = dragStart.current.top + dy;
        newLeft = Math.max(0, Math.min(newLeft, pRect.width - size.width));
        newTop = Math.max(0, Math.min(newTop, pRect.height - size.height));
        setPos({ left: newLeft, top: newTop });
        return;
      }

      if (resizing.current) {
        const s = resizing.current;
        const dx = ev.clientX - s.startX;
        const dy = ev.clientY - s.startY;
        let newW = s.startW;
        let newH = s.startH;
        let newL = s.startL;
        let newT = s.startT;
        const minW = 220; const minH = 120;
        if (s.dir.includes('e')) {
          newW = Math.max(minW, s.startW + dx);
        }
        if (s.dir.includes('s')) {
          newH = Math.max(minH, s.startH + dy);
        }
        if (s.dir.includes('w')) {
          newW = Math.max(minW, s.startW - dx);
          newL = Math.max(0, s.startL + dx);
        }
        if (s.dir.includes('n')) {
          newH = Math.max(minH, s.startH - dy);
          newT = Math.max(0, s.startT + dy);
        }
        // clamp into parent
        newW = Math.min(newW, pRect.width - newL);
        newH = Math.min(newH, pRect.height - newT);
        setSize({ width: newW, height: newH });
        setPos({ left: newL, top: newT });
      }
    }, [size.width, size.height]);

    const onPointerUp = React.useCallback(() => {
      dragging.current = false;
      resizing.current = null;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    }, [onPointerMove]);

    const startDrag = (ev: React.PointerEvent) => {
      ev.preventDefault();
      const p = parentRef.current;
      const r = rootRef.current;
      if (!p || !r) return;
      const pRect = p.getBoundingClientRect();
      const rect = r.getBoundingClientRect();
      const left = rect.left - pRect.left;
      const top = rect.top - pRect.top;
      dragStart.current = { x: ev.clientX, y: ev.clientY, left, top };
      dragging.current = true;
      // when user starts dragging, switch to explicit left positioning
      setPos(pv => ({ left: left, top: top }));
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    };

    const startResize = (dir: string) => (ev: React.PointerEvent) => {
      ev.stopPropagation(); ev.preventDefault();
      const p = parentRef.current;
      const r = rootRef.current;
      if (!p || !r) return;
      const pRect = p.getBoundingClientRect();
      const rect = r.getBoundingClientRect();
      const left = rect.left - pRect.left;
      const top = rect.top - pRect.top;
      resizing.current = { dir, startX: ev.clientX, startY: ev.clientY, startW: size.width, startH: size.height, startL: left, startT: top };
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    };

    return (
      <div
        ref={rootRef}
        style={{
          position: 'absolute',
          left: pos.left != null ? pos.left : undefined,
          right: pos.left == null ? 8 : undefined,
          top: pos.top,
          width: size.width,
          height: size.height,
          zIndex: 200,
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div
          onPointerDown={startDrag}
          style={{ cursor: 'move', padding: 6, display: 'flex', alignItems: 'center', gap: 8, userSelect: 'none', background: 'transparent' }}
        >
          {/* header area for dragging - children includes close button etc */}
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {children}
        </div>
        {/* corner handles */}
        <div onPointerDown={startResize('nw')} style={{ position: 'absolute', left: -6, top: -6, width: 12, height: 12, cursor: 'nwse-resize' }} />
        <div onPointerDown={startResize('ne')} style={{ position: 'absolute', right: -6, top: -6, width: 12, height: 12, cursor: 'nesw-resize' }} />
        <div onPointerDown={startResize('sw')} style={{ position: 'absolute', left: -6, bottom: -6, width: 12, height: 12, cursor: 'nesw-resize' }} />
        <div onPointerDown={startResize('se')} style={{ position: 'absolute', right: -6, bottom: -6, width: 12, height: 12, cursor: 'nwse-resize' }} />
      </div>
    );
  };

  return (
    <div style={{
      width: '100%',
      height: '100%',
      position: 'relative',
      zIndex: 10,
      background: '#e9ecef',
      overflow: 'auto',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
        <div ref={viewerRef} style={{ padding: 24, overflow: 'auto', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* Fixed-size preview sheet. Page size comes from user CSS @page if provided, else A4 fallback. */}
          <div ref={sheetRef} style={{ width: pageWidth, height: pageHeight, background: '#fff', boxShadow: '0 8px 24px rgba(0,0,0,0.25)', border: '1px solid #ddd', overflow: 'hidden', position: 'relative' }}>
            {/* Show an info button when panel is hidden */}
            {!showInfo && (
              <button
                type="button"
                aria-label="show vivliostyle preview info"
                onClick={() => setShowInfo(true)}
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 6,
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  border: '1px solid #999',
                  background: '#fff',
                  color: '#333',
                  fontSize: 14,
                  cursor: 'pointer',
                  lineHeight: '24px',
                  textAlign: 'center',
                  boxShadow: '0 1px 2px rgba(0,0,0,.15)'
                }}
                title="Preview info"
              >i</button>
            )}

            {/* When shown, render the draggable panel with the same content previously inline */}
            {showInfo && (
              <DraggableInfoPanel>
                <div style={{
                  position: 'absolute',
                  // top/right are initial hints; DraggableInfoPanel will manage absolute positioning
                  top: 8,
                  right: 8,
                  width: 320,
                  maxHeight: '80%',
                  overflow: 'auto',
                  minWidth: 220,
                  minHeight: 120,
                  // darker frosted glass / Aero-like
                  background: 'rgba(18,20,22,0.56)',
                  backdropFilter: 'blur(8px) saturate(120%)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 8,
                  padding: '10px 12px',
                  fontSize: 12,
                  lineHeight: 1.4,
                  color: '#e6e6e6',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <strong style={{ fontSize: 13, color: '#f3f4f6' }}>Vivliostyle Preview Info</strong>
                    <span style={{ marginLeft: 'auto' }}>
                      <button
                        type="button"
                        onClick={() => setShowInfo(false)}
                        style={{
                          border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0,
                          color: '#d0d4d8'
                        }}
                        aria-label="close info"
                      >×</button>
                    </span>
                  </div>
                  <ul style={{ listStyle: 'disc', paddingLeft: 16, margin: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <li>Markdown chars: {markdown.length}</li>
                    <li>Lines: {markdown.split(/\r?\n/).length}</li>
                    <li>Approx words: {markdown.trim() ? markdown.trim().split(/\s+/).length : 0}</li>
                    <li>HTML length: {htmlLen}</li>
                    <li>DataURL length: {encodedLen}</li>
                    <li>@page rule: {pageInfo.pageRuleFound ? 'found' : 'none'}</li>
                    {pageInfo.size && <li>page size: {pageInfo.size}</li>}
                    {pageInfo.margins && pageInfo.margins.map((m,i)=>(<li key={i}>{m}</li>))}
                  </ul>
                  {fullHtml && (
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ cursor: 'pointer' }}>Show HTML sample</summary>
                      <pre style={{ maxHeight: 200, overflow: 'auto', background: 'rgba(0,0,0,0.28)', padding: 8, border: '1px solid rgba(255,255,255,0.04)', color: '#e6e6e6' }}>{fullHtml.slice(0, 1200)}</pre>
                    </details>
                  )}
                </div>
              </DraggableInfoPanel>
            )}
          </div>
        </div>
    </div>
  );
};

export default VivliostylePreview;
