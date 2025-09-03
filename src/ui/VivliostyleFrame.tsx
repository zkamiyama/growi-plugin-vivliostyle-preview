// ui/VivliostyleFrame.tsx
import React, { forwardRef, useMemo } from 'react';
import hostHtml from '../../public/vivlio-host.html?raw';

interface Props {}

const VivliostyleFrame = forwardRef<HTMLIFrameElement, Props>((props, ref) => {
  // 再レンダリングで iframe 再生成されないよう srcDoc をメモ化
  const memoSrcDoc = useMemo(() => hostHtml, []);
  return (
    <iframe
      ref={ref}
      id="vivlio-iframe"
      title="Vivliostyle Viewer"
      srcDoc={memoSrcDoc}
      style={{ width: '100%', height: '100%', border: 0 }}
      sandbox="allow-scripts"
    />
  );
});

VivliostyleFrame.displayName = 'VivliostyleFrame';

export default VivliostyleFrame;
