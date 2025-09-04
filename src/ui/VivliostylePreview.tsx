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
      const base64 = btoa(unescape(encodeURIComponent(generated)));
      const url = `data:text/html;base64,${base64}`;
      setEncodedLen(url.length);
      setDataUrl(url);
      setErrorMsg(null);
      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG][Preview] dataUrl ready', { encodedLen: url.length });
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

  const source = dataUrl || null; // bookMode=false で loadDocument() を利用
  // Extract user CSS from markdown code block labeled ```vivliocss
  const extractUserCss = (md: string) => {
    const m = md.match(/```vivliocss\s*([\s\S]*?)```/i);
    return m ? m[1].trim() : '';
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
  }, [source, userCss, pageWidth, pageHeight]);

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
          {source ? (
            <div style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
              {/* rendererWrapRef is scaled to fit the sheet into viewer */}
              <div ref={rendererWrapRef} style={{ width: '100%', height: '100%', overflow: 'hidden', willChange: 'transform' }}>
                <Renderer
                  /* keep stable mounting */
                  source={source as string}
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
      <button
        type="button"
        aria-label="show vivliostyle preview info"
        onClick={() => setShowInfo(s => !s)}
        style={{
          position: 'absolute',
          top: 6,
          right: 6,
          width: 26,
          height: 26,
          borderRadius: '50%',
          border: '1px solid #999',
          background: showInfo ? '#0d6efd' : '#fff',
          color: showInfo ? '#fff' : '#333',
          fontSize: 14,
          cursor: 'pointer',
          lineHeight: '24px',
          textAlign: 'center',
          boxShadow: '0 1px 2px rgba(0,0,0,.15)'
        }}
        title="Preview info"
      >i</button>
      {showInfo && (
        <div style={{
          position: 'absolute',
          top: 40,
          right: 8,
          width: 320,
          maxHeight: '60%',
          overflow: 'auto',
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
