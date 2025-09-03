// ui/VivliostyleCDNTest.tsx
import React from 'react';

export const VivliostyleCDNTest: React.FC = () => {
  // 一時的なテスト用HTML (Data URL形式)
  const testHtmlDataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>CDN Test</title>
  <style>
    @page { size: A5; margin: 12mm; }
    body { font-family: system-ui, sans-serif; line-height: 1.5; margin: 2em; }
    h1 { color: #333; }
  </style>
</head>
<body>
  <h1>CDN Viewer Test</h1>
  <p>This is a test document to verify that the Vivliostyle viewer loads properly from CDN.</p>
  <p>Current time: ${new Date().toLocaleString()}</p>
  <ul>
    <li>CDN loading test</li>
    <li>Basic rendering test</li>
    <li>A5 page format test</li>
  </ul>
</body>
</html>
  `)}`;

  const cdnViewerUrl = `https://unpkg.com/@vivliostyle/viewer@2.34.1/dist/viewer/vivliostyle-viewer.html#x=${encodeURIComponent(testHtmlDataUrl)}`;

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
        🔍 CDN Viewer Test (右下常時表示)
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
