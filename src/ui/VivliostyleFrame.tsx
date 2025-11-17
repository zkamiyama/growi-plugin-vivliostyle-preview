// ui/VivliostyleFrame.tsx
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

// This file has been archived to `archive/unused` because static analysis found no references.
// If you need to restore it, copy from `archive/unused/VivliostyleFrame.tsx`.

export default null;
