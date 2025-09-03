// hooks/useVivliostyleBridge.ts
import * as React from 'react';

export function useVivliostyleBridge() {
  const [html, setHtml] = React.useState<string>('');

  const updateViewer = React.useCallback((nextHtml: string) => {
    setHtml(nextHtml);

    // iframeへpostMessage（同一オリジンのviewer/index.html側で受信し、Blob化して#srcを更新）
    const iframe = document.querySelector<HTMLIFrameElement>('#vivlio-iframe');
    iframe?.contentWindow?.postMessage({ type: 'vivlio:update', html: nextHtml }, '*');
  }, []);

  return { html, updateViewer };
}
