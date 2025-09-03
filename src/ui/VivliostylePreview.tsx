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
  const [html, setHtml] = useState('');

  useEffect(() => {
    if (!isVisible) return;
    if (!markdown) {
      setHtml('');
      return;
    }
    try {
      const fullHtml = stringify(markdown);
      setHtml(fullHtml);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[VivlioDBG] stringify failed', e);
      setHtml(`<html><body><pre style="color:#c00">VFM Error: ${(e as Error).message}</pre></body></html>`);
    }
  }, [markdown, isVisible]);

  if (!isVisible) return null;

  // Renderer には { html, entry } 形式で直接渡す（fetch を発生させない）
  const source = html ? { html, entry: window.location.href } : null;

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',background:'#d4edda',borderBottom:'1px solid #c3e6cb',fontSize:12}}>
        <strong style={{color:'#155724'}}>Vivliostyle Preview</strong>
        <span style={{color:'#155724',opacity:.7}}>(@vivliostyle/react)</span>
        <span style={{marginLeft:'auto',color:'#555'}}>len: {markdown.length}</span>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {source ? (
          <Renderer source={source as any} />
        ) : (
          <div style={{ padding: '2em', textAlign: 'center', color: '#666' }}>Markdownを入力してください...</div>
        )}
      </div>
    </div>
  );
};

export default VivliostylePreview;
