// ui/VivliostyleFrame.tsx
import React from 'react';

const VIEWER_URL = '/plugins/growi-plugin-vivliostyle-preview/viewer/index.html';

const VivliostyleFrame: React.FC = () => {
  // 単なる描画境界。実際の更新は postMessage 等で子側が行う想定
  return (
    <iframe
      id="vivlio-iframe"
      title="Vivliostyle Viewer"
      src={VIEWER_URL}
      style={{ width: '100%', height: '100%', border: 0 }}
              sandbox="allow-scripts allow-popups allow-downloads"
    />
  );
};

export default VivliostyleFrame;
