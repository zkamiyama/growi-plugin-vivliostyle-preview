// hooks/useVivliostyleBridge.ts
import { useEffect, useState } from 'react';

// メッセージの型定義
export interface VivliostyleMessage {
  type: 'update' | 'ready';
  markdown?: string;
}

export function useVivliostyleBridge(
  iframe: HTMLIFrameElement | null,
  markdown: string,
) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!iframe?.contentWindow) return;

    const target = iframe.contentWindow;

    // iframeの準備完了を待ってから最初のデータを送る
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
      const message: VivliostyleMessage = { type: 'update', markdown };
      // '*' はデモ用。本番では targetOrigin を指定すべき
      iframe.contentWindow.postMessage(message, '*');
    }
  }, [iframe, markdown, isReady]);

  return { isReady };
}
