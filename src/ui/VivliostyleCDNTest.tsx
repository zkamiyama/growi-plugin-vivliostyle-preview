// ui/VivliostyleCDNTest.tsx
import React from 'react';

export const VivliostyleCDNTest: React.FC = () => {
  // CDNビューワーはdata URLの直接フェッチを許可しない（403エラー）
  // 代わりに公開されているサンプルHTMLを使用してテスト
  const testUrl = 'https://vivliostyle.github.io/vivliostyle_doc/samples/wood/index.html';
  
  const cdnViewerUrl = `https://unpkg.com/@vivliostyle/viewer@2.34.1/lib/index.html#x=${encodeURIComponent(testUrl)}`;
  
  // 403エラー回避: HTTPアクセス可能な実際のHTML文書を使用

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        right: 0,
        width: '400px',
        height: '300px',
        zIndex: 1000,
        border: '2px solid #ff6b6b',
        backgroundColor: '#fff',
        borderRadius: '8px 0 0 0',
        boxShadow: '0 -4px 8px rgba(0,0,0,0.1)',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <div
        style={{
          padding: '8px',
          background: '#ff6b6b',
          color: 'white',
          fontSize: '12px',
          fontWeight: 'bold',
          borderRadius: '6px 0 0 0'
        }}
      >
        🔍 CDN Viewer Test - Wood Sample (右下常時表示)
      </div>
      <iframe
        src={cdnViewerUrl}
        style={{
          flex: 1,
          border: 0,
          width: '100%'
        }}
        title="Vivliostyle CDN Test"
      />
    </div>
  );
};
