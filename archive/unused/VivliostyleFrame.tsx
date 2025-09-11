// Archived: src/ui/VivliostyleFrame.tsx
// Copied for preservation before cleaning src/

import React from 'react';

const VIEWER_URL = '/plugins/growi-plugin-vivliostyle-preview/viewer/index.html';

const VivliostyleFrame: React.FC = () => {
  return (
    <iframe
      id="vivlio-iframe"
      title="Vivliostyle Viewer"
      src={VIEWER_URL}
      style={{ width: '100%', height: '100%', border: 0 }}
      sandbox="allow-scripts allow-same-origin"
    />
  );
};

export default VivliostyleFrame;
