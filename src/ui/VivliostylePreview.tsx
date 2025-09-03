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
      const fullHtml = stringify(markdown);
      setHtmlLen(fullHtml.length);
      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG][Preview] html generated', { htmlLen: fullHtml.length, sample: fullHtml.slice(0, 120) });
      const base64 = btoa(unescape(encodeURIComponent(fullHtml)));
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
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',background:'#d4edda',borderBottom:'1px solid #c3e6cb',fontSize:12}}>
        <strong style={{color:'#155724'}}>Vivliostyle Preview</strong>
        <span style={{color:'#155724',opacity:.7}}>(@vivliostyle/react)</span>
        <span style={{marginLeft:'auto',color:'#555'}} title={`HTML: ${htmlLen} / dataURL: ${encodedLen}`}>md:{markdown.length}</span>
      </div>
      <div style={{ flex: 1, overflow: 'auto', position: 'relative', background:'#fafafa' }}>
        {errorMsg && (
          <div style={{position:'absolute',top:8,right:8,left:8,padding:'8px 10px',background:'#ffeeee',border:'1px solid #e99',color:'#a00',fontSize:12,borderRadius:4}}>
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
    </div>
  );
};

export default VivliostylePreview;
