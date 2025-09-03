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

  return (
    <div style={{
      width: '100%',
      height: '100%',
      position: 'relative',
      zIndex: 10,
      background: '#fff',
      border: '1px solid #ddd',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div style={{ flex: 1, overflow: 'auto', position: 'relative', background: '#fafafa' }}>
        {errorMsg && (
          <div style={{ position: 'absolute', top: 8, right: 8, left: 8, padding: '8px 10px', background: '#ffeeee', border: '1px solid #e99', color: '#a00', fontSize: 12, borderRadius: 4 }}>
            VFM Error: {errorMsg}
          </div>
        )}
        {source ? (
          <Renderer
            /* key を固定し再マウントを避けパフォ改善 */
            source={source as string}
            bookMode={false}
            userStyleSheet={`html,body{background:#fff !important;color:#222 !important;-webkit-font-smoothing:antialiased;font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Noto Sans JP','Hiragino Sans','Hiragino Kaku Gothic ProN','Meiryo',sans-serif;}
              h1,h2,h3,h4,h5{color:#111 !important;}
              p{color:#222 !important;}
              a{color:#0645ad !important;}
            `}
          />
        ) : !errorMsg ? (
          <div style={{ padding: '2em', textAlign: 'center', color: '#666' }}>Markdownを入力してください...</div>
        ) : null}
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
          background: 'rgba(32,32,40,0.98)', // 濃いグレーでコントラストUP
          color: '#fff',
          backdropFilter: 'blur(2.5px)',
          border: '1px solid #222',
          borderRadius: 8,
          padding: '14px 16px',
          fontSize: 13,
          lineHeight: 1.5,
          boxShadow: '0 6px 24px rgba(0,0,0,.25)',
          zIndex: 40
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <strong style={{ fontSize: 15, color: '#fff', letterSpacing: 0.5 }}>Vivliostyle Preview Info</strong>
            <span style={{ marginLeft: 'auto' }}>
              <button
                type="button"
                onClick={() => setShowInfo(false)}
                style={{
                  border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0, color: '#fff', opacity: 0.7
                }}
                aria-label="close info"
                title="閉じる"
                onMouseOver={e => (e.currentTarget.style.opacity = '1')}
                onMouseOut={e => (e.currentTarget.style.opacity = '0.7')}
              >×</button>
            </span>
          </div>
          <ul style={{ listStyle: 'disc', paddingLeft: 18, margin: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
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
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: 'pointer', color: '#ffd700' }}>Show HTML sample</summary>
              <pre style={{ maxHeight: 200, overflow: 'auto', background: '#222', color: '#fff', padding: 10, border: '1px solid #444', borderRadius: 4 }}>{fullHtml.slice(0, 1200)}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
};

export default VivliostylePreview;
