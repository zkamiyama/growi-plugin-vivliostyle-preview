// ui/VivliostylePlanB.tsx
import React, { useEffect, useRef, useState } from 'react';

interface Props {
  markdown: string;
  isOpen: boolean;
}

export const VivliostylePlanB: React.FC<Props> = ({ markdown, isOpen }) => {
  const [tempUrl, setTempUrl] = useState<string>('');
  const [status, setStatus] = useState<string>('idle');
  const debounceRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!isOpen || !markdown.trim()) {
      setTempUrl('');
      return;
    }

    // デバウンス処理
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setStatus('uploading');
      
      try {
        const response = await fetch('/api/vivlio-temp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ markdown })
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const result = await response.json();
        const viewerUrl = `/vivlio-viewer/index.html#x=${encodeURIComponent(result.url)}`;
        setTempUrl(viewerUrl);
        setStatus('ready');
        
        console.log('[PLAN-B] Generated viewer URL:', viewerUrl);
      } catch (error) {
        console.error('[PLAN-B] Upload failed:', error);
        setStatus('error');
      }
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [markdown, isOpen]);

  if (!isOpen) return null;

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ 
        padding: '4px 8px', 
        background: '#e3f2fd', 
        borderBottom: '1px solid #90caf9',
        fontSize: '12px',
        color: '#1565c0'
      }}>
        PLAN B: Official Viewer | Status: {status} | MD: {markdown.length}chars
      </div>
      
      <div style={{ flex: 1, position: 'relative' }}>
        {tempUrl ? (
          <iframe
            src={tempUrl}
            style={{ width: '100%', height: '100%', border: 0 }}
            title="Vivliostyle PLAN B"
          />
        ) : (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            height: '100%',
            color: '#666'
          }}>
            {status === 'uploading' ? 'Generating preview...' : 
             status === 'error' ? '❌ Preview generation failed' :
             'Enter markdown to see preview'}
          </div>
        )}
      </div>
    </div>
  );
};
