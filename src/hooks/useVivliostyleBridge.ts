// hooks/useVivliostyleBridge.ts
import { useEffect, useState } from 'react';

// メッセージの型定義
export interface VivliostyleMessage {
  type: 'update' | 'ready' | 'error';
  html?: string;
  message?: string;
}

export function useVivliostyleBridge(
  iframe: HTMLIFrameElement | null,
  html: string,
) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!iframe?.contentWindow) return;

    const target = iframe.contentWindow;

    const handleReady = (event: MessageEvent<VivliostyleMessage>) => {
      if (event.source === target && event.data.type === 'ready') {
        setIsReady(true);
      }
    };

    window.addEventListener('message', handleReady);

    return () => {
      window.removeEventListener('message', handleReady);
    };
  }, [iframe]);

  useEffect(() => {
    if (isReady && iframe?.contentWindow) {
      const message: VivliostyleMessage = { type: 'update', html };
      iframe.contentWindow.postMessage(message, '*');
    }
  }, [iframe, html, isReady]);

  return { isReady };
}
