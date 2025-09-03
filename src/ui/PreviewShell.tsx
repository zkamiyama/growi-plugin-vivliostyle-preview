// ui/PreviewShell.tsx
import * as React from 'react';
import VivliostyleFrame from './VivliostyleFrame';
import { useAppContext } from '../context/AppContext';

// simple markdown -> html (temporary; will be replaced by VFM pipeline)
// NOTE: Jest (CJS) と ESM の相互運用の差異で default が存在しないケースに対応
// eslint-disable-next-line import/no-namespace
import * as MarkdownIt from 'markdown-it';
// markdown-it の型は default export 前提だが * as で受け取るためコンストラクタを取り出す
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MDCtor: any = (MarkdownIt as any).default || (MarkdownIt as any);
const md = new MDCtor();

const PreviewShell: React.FC = () => {
  const { isOpen, markdown } = useAppContext();

  // デバッグ: トグル変化を記録 (既存プレビューは触らず)  
  React.useEffect(() => {
    const previewContainer = document.getElementById('vivlio-preview-container');
    if (previewContainer) {
      // 単純化: isOpen のときだけ自分を表示、閉じたら非表示
      previewContainer.style.display = isOpen ? 'block' : 'none';
    }
    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG] isOpen effect fired', { isOpen, hasContainer: !!previewContainer });
  }, [isOpen]);

  // markdown 更新時 iframe へ反映 (開いている時のみ送れば十分だが単純化)
  // iframe ready 管理
  const readyRef = React.useRef(false);
  const pendingHtmlRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    function handleMessage(ev: MessageEvent) {
      if (!ev?.data) return;
      if (ev.data.type === 'vivlio:ready') {
        // eslint-disable-next-line no-console
        console.debug('[VivlioDBG] iframe reported ready');
        readyRef.current = true;
        if (pendingHtmlRef.current) {
          const iframe = document.getElementById('vivlio-iframe') as HTMLIFrameElement | null;
          if (iframe?.contentWindow) {
            iframe.contentWindow.postMessage({ type: 'markdown:update', html: pendingHtmlRef.current }, '*');
            // eslint-disable-next-line no-console
            console.debug('[VivlioDBG] flushed pending html (on ready)');
          }
          pendingHtmlRef.current = null;
        }
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  React.useEffect(() => {
    const iframe = document.getElementById('vivlio-iframe') as HTMLIFrameElement | null;
    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG] markdown effect', { length: markdown?.length, isOpen, hasIframe: !!iframe, ready: readyRef.current });
    if (!isOpen) return;
    const html = md.render(markdown || '<p><em>(empty)</em></p>');
    if (!iframe || !iframe.contentWindow) {
      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG] iframe not ready yet (no element or no contentWindow)');
      return;
    }
    if (!readyRef.current) {
      pendingHtmlRef.current = html;
      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG] queued html until ready');
      return;
    }
    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG] posting message to iframe', { htmlPreview: html.slice(0, 60) });
    iframe.contentWindow.postMessage({ type: 'markdown:update', html }, '*');
  }, [markdown, isOpen]);

  return (
    <div
      data-vivlio-shell
      style={{ width: '100%', height: '100%', position: 'relative' }}
      aria-hidden={!isOpen}
    >
      {isOpen && (
        <VivliostyleFrame />
      )}
    </div>
  );
};

export default PreviewShell;
