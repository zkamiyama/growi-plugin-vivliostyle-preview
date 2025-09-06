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
  const infoRef = React.useRef<HTMLDivElement | null>(null);
  const draggingRef = React.useRef(false);
  const dragStartRef = React.useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const currentControllerRef = React.useRef<AbortController | null>(null);

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
    // Cancel previous generation
    if (currentControllerRef.current) {
      currentControllerRef.current.abort();
    }
    const controller = new AbortController();
    currentControllerRef.current = controller;
    const signal = controller.signal;

    // Async generation to allow cancellation
    const generate = async () => {
      if (signal.aborted) return;
      try {
        const generated = stringify(markdown);
        if (signal.aborted) return;
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
          if (signal.aborted) return;
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
          if (signal.aborted) return;
          setEncodedLen(url.length);
          setDataUrl(url);
        }
        setErrorMsg(null);
  // eslint-disable-next-line no-console
  console.debug('[VivlioDBG][Preview] dataUrl ready', { encodedLen: generated.length });
      } catch (e) {
        if (signal.aborted) return;
        // eslint-disable-next-line no-console
        console.error('[VivlioDBG][Preview] stringify failed', e);
        setErrorMsg((e as Error).message);
        setDataUrl('');
      }
    };

    // Use setTimeout to make it async and allow cancellation
    setTimeout(generate, 0);
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
    // Cancel previous generation
    if (currentControllerRef.current) {
      currentControllerRef.current.abort();
    }
    const controller = new AbortController();
    currentControllerRef.current = controller;
    const signal = controller.signal;

    let to: number | null = null;
    const doGenerate = () => {
      if (signal.aborted) return;
      try {
        const generated = stringify(editorMd);
        if (signal.aborted) return;
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
          if (signal.aborted) return;
          if (blobUrlRef.current) {
            try { URL.revokeObjectURL(blobUrlRef.current); } catch (e) { /* ignore */ }
          }
          blobUrlRef.current = url;
          setEncodedLen(generated.length);
          setDataUrl(url);
        } catch (e) {
          const base64 = btoa(unescape(encodeURIComponent(generated)));
          const url = `data:text/html;base64,${base64}`;
          if (signal.aborted) return;
          setEncodedLen(url.length);
          setDataUrl(url);
        }
        setErrorMsg(null);
        // debug log
        // eslint-disable-next-line no-console
        console.debug('[VivlioDBG][Preview] stringify(editorMd) ok', { htmlLen: generated.length, sample: generated.slice(0, 120) });
      } catch (e) {
        if (signal.aborted) return;
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
      if (currentControllerRef.current) {
        currentControllerRef.current.abort();
        currentControllerRef.current = null;
      }
    };
  }, []);

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
          {errorMsg && (
            <div style={{ position: 'absolute', top: 8, right: 8, left: 8, padding: '8px 10px', background: '#ffeeee', border: '1px solid #e99', color: '#a00', fontSize: 12, borderRadius: 4 }}>
              VFM Error: {errorMsg}
            </div>
          )}
          {rendererSource ? (
            <div style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
              {/* rendererWrapRef is scaled to fit the sheet into viewer */}
              <div ref={rendererWrapRef} style={{ width: '100%', height: '100%', overflow: 'hidden', willChange: 'transform' }}>
                <Renderer
                  /* keep stable mounting */
                  source={rendererSource as string}
                  bookMode={false}
                  userStyleSheet={finalUserStyleSheet}
                />
              </div>
            </div>
          ) : !errorMsg ? (
            <div style={{ padding: '2em', textAlign: 'center', color: '#666' }}>Markdownを入力してください...</div>
          ) : null}
        </div>
      </div>
      {/* Info button */}
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
      {showInfo && (
        <div
          ref={infoRef}
          onPointerDown={(ev) => {
            // ignore if target is interactive element
            const t = ev.target as HTMLElement | null;
            if (t && t.closest && t.closest('button,a,input,textarea,select')) return;
            const el = infoRef.current;
            if (!el) return;
            ev.preventDefault();
            const parent = el.offsetParent as HTMLElement | null;
            const pRect = parent ? parent.getBoundingClientRect() : { left: 0, top: 0 } as DOMRect;
            const rect = el.getBoundingClientRect();
            // switch from right to explicit left if using 'right' initially
            const left = rect.left - pRect.left;
            const top = rect.top - pRect.top;
            el.style.left = `${left}px`;
            el.style.right = 'auto';
            el.style.top = `${top}px`;
            draggingRef.current = true;
            dragStartRef.current = { x: ev.clientX, y: ev.clientY, left, top };
            const onMove = (e: PointerEvent) => {
              if (!draggingRef.current || !dragStartRef.current || !el) return;
              const dx = e.clientX - dragStartRef.current.x;
              const dy = e.clientY - dragStartRef.current.y;
              const newLeft = Math.max(0, dragStartRef.current.left + dx);
              const newTop = Math.max(0, dragStartRef.current.top + dy);
              el.style.left = `${newLeft}px`;
              el.style.top = `${newTop}px`;
            };
            const onUp = () => {
              draggingRef.current = false;
              dragStartRef.current = null;
              window.removeEventListener('pointermove', onMove);
              window.removeEventListener('pointerup', onUp);
            };
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
          }}
          style={{
          position: 'absolute',
          top: 8,
          right: 8,
          width: 320,
          maxHeight: '80%',
          overflow: 'auto',
          resize: 'both',
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
          zIndex: 20
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
      )}
    </div>
  );
};

export default VivliostylePreview;
