// ui/VivliostylePlanD.tsx
import React, { useState, useEffect } from 'react';
import { stringify } from '@vivliostyle/vfm';
import { Renderer } from '@vivliostyle/react';

interface VivliostylePlanDProps {
  markdown: string;
  isVisible: boolean;
}

export const VivliostylePlanD: React.FC<VivliostylePlanDProps> = ({ markdown, isVisible }) => {
  const [html, setHtml] = useState('');

  useEffect(() => {
    if (markdown && isVisible) {
      const fullHtml = stringify(markdown);
      // <base> タグを追加して相対パスを解決
      const baseHref = window.location.origin + '/';
      const finalHtml = fullHtml.replace('<head>', `<head><base href="${baseHref}">`);
      setHtml(finalHtml);
    }
  }, [markdown, isVisible]);

  if (!isVisible) {
    return null;
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid #ddd',
        borderRadius: '4px',
        overflow: 'hidden'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          background: '#d4edda',
          borderBottom: '1px solid #c3e6cb',
          fontSize: '14px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 'bold', color: '#155724' }}>🚀 PLAN D</span>
          <span style={{ color: '#666' }}>@vivliostyle/react</span>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {html ? (
          <Renderer source={html} />
        ) : (
          <div style={{ padding: '2em', textAlign: 'center', color: '#666' }}>
            Markdownコンテンツを待っています...
          </div>
        )}
      </div>
    </div>
  );
};
