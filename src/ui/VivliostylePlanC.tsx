// ui/VivliostylePlanC.tsx
import React, { useEffect, useState, useRef } from 'react';
import { stringify } from '@vivliostyle/vfm';

interface VivliostylePlanCProps {
  markdown: string;
  isVisible: boolean;
}

export const VivliostylePlanC: React.FC<VivliostylePlanCProps> = ({ markdown, isVisible }) => {
  const [tempUrl, setTempUrl] = useState<string>('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // マークダウンをHTMLに変換してHTTPエンドポイント経由で配信
  useEffect(() => {
    if (!markdown || !isVisible) {
      setTempUrl('');
      return;
    }

    const generateTempUrl = async () => {
      try {
        // VFM stringify でHTMLを生成
        const html = stringify(markdown);
        
        // 開発サーバーの一時HTMLエンドポイントを使用
        const response = await fetch('/api/vivlio-temp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ markdown, html })
        });
        
        if (response.ok) {
          const { id } = await response.json();
          const newTempUrl = `/api/vivlio-temp/${id}`;
          setTempUrl(newTempUrl);
          console.log('[VivlioPlanC] Temp URL generated:', newTempUrl);
        } else {
          console.error('[VivlioPlanC] Failed to generate temp URL:', response.status);
        }
      } catch (error) {
        console.error('[VivlioPlanC] Error generating temp URL:', error);
      }
    };

    generateTempUrl();
  }, [markdown, isVisible]);

  // Vivliostyle公式CDNビューワーURL
  const viewerUrl = tempUrl 
    ? `https://vivliostyle.org/viewer/#x=${encodeURIComponent(window.location.origin + tempUrl)}`
    : '';

  if (!isVisible || !viewerUrl) {
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
      {/* コントロールバー */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          background: '#e6f7ff',
          borderBottom: '1px solid #91d5ff',
          fontSize: '14px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 'bold', color: '#1890ff' }}>� PLAN C</span>
          <span style={{ color: '#666' }}>Vivliostyle Official CDN + HTTP</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#666' }}>
          <span>Temp URL: {tempUrl}</span>
        </div>
      </div>

      {/* Vivliostyle公式ビューワー（iframe） */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <iframe
          ref={iframeRef}
          src={viewerUrl}
          style={{
            width: '100%',
            height: '100%',
            border: 0
          }}
          title="Vivliostyle PLAN C Viewer"
          sandbox="allow-scripts allow-same-origin allow-forms"
        />
      </div>
    </div>
  );
};
