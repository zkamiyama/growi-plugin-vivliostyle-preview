// ui/VivliostyleFrame.tsx
import React, { forwardRef } from 'react';

const VIEWER_URL = '/plugins/growi-plugin-vivliostyle-preview/vivlio-host.html';

interface Props {}

const VivliostyleFrame = forwardRef<HTMLIFrameElement, Props>((props, ref) => {
  return (
    <iframe
      ref={ref}
      id="vivlio-iframe"
      title="Vivliostyle Viewer"
      src={VIEWER_URL}
      style={{ width: '100%', height: '100%', border: 0 }}
      // allow-same-origin を削除し、postMessage通信を前提とする
      sandbox="allow-scripts allow-popups allow-downloads"
    />
  );
});

VivliostyleFrame.displayName = 'VivliostyleFrame';

export default VivliostyleFrame;
