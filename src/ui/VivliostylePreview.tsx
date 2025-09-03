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

  useEffect(() => {
    if (!isVisible) return;
    if (!markdown) {
      setDataUrl('');
      setErrorMsg(null);
      return;
    }
    try {
      const fullHtml = stringify(markdown);
      // data URL 経由で渡して fetch を 1 回だけにする (blob: は core の fetch 実装で失敗したため)
      const encoded = encodeURIComponent(fullHtml);
      const url = `data:text/html;charset=utf-8,${encoded}`;
      setDataUrl(url);
      setErrorMsg(null);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[VivlioDBG] stringify failed', e);
      setErrorMsg((e as Error).message);
      setDataUrl('');
    }
  }, [markdown, isVisible]);

  if (!isVisible) return null;

  const source = dataUrl || null; // bookMode=false で loadDocument() パスを使わせる

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',background:'#d4edda',borderBottom:'1px solid #c3e6cb',fontSize:12}}>
        <strong style={{color:'#155724'}}>Vivliostyle Preview</strong>
        <span style={{color:'#155724',opacity:.7}}>(@vivliostyle/react)</span>
        <span style={{marginLeft:'auto',color:'#555'}}>len: {markdown.length}</span>
      </div>
      <div style={{ flex: 1, overflow: 'auto', position: 'relative', background:'#fafafa' }}>
        {errorMsg && (
          <div style={{position:'absolute',top:8,right:8,left:8,padding:'8px 10px',background:'#ffeeee',border:'1px solid #e99',color:'#a00',fontSize:12,borderRadius:4}}>
            VFM Error: {errorMsg}
          </div>
        )}
        {source ? (
          <Renderer key={source} source={source as string} bookMode={false} />
        ) : !errorMsg ? (
          <div style={{ padding: '2em', textAlign: 'center', color: '#666' }}>Markdownを入力してください...</div>
        ) : null}
      </div>
    </div>
  );
};

export default VivliostylePreview;
