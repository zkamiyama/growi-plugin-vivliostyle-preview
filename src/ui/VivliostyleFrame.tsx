// ui/VivliostyleFrame.tsx
import React, { forwardRef } from 'react';
import hostHtml from '../../public/vivlio-host.html?raw';

interface Props {}

const VivliostyleFrame = forwardRef<HTMLIFrameElement, Props>((props, ref) => {
  return (
    <iframe
      ref={ref}
      id="vivlio-iframe"
      title="Vivliostyle Viewer"
      srcDoc={hostHtml} // srcの代わりにsrcdocを使用
      style={{ width: '100%', height: '100%', border: 0 }}
      sandbox="allow-scripts" // スクリプト実行のみ許可
    />
  );
});

VivliostyleFrame.displayName = 'VivliostyleFrame';

export default VivliostyleFrame;
