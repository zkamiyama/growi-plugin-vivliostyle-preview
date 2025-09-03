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
  const { isOpen, markdown, forceUpdateMarkdown } = useAppContext();
  const [debugText, setDebugText] = React.useState<string>('# Debug\n\nSample paragraph.');

  // トグル変化時: 元プレビューの表示/非表示も復活
  React.useEffect(() => {
    const previewContainer = document.getElementById('vivlio-preview-container');
    const originalPreviewBody = document.querySelector('.page-editor-preview-body') as HTMLElement | null;
    if (previewContainer) {
      previewContainer.style.display = isOpen ? 'block' : 'none';
      // 高さが 0 の場合は親プレビュー領域高さをコピー
      if (isOpen) {
        const parent = previewContainer.parentElement as HTMLElement | null;
        const ph = parent?.getBoundingClientRect().height || 0;
        if (ph > 0 && previewContainer.getBoundingClientRect().height < ph * 0.5) {
          previewContainer.style.minHeight = ph + 'px';
        }
      }
    }
    if (originalPreviewBody) {
      originalPreviewBody.style.display = isOpen ? 'none' : 'block';
    }
    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG] isOpen effect fired', { isOpen, hasContainer: !!previewContainer, hiddenOriginal: !!originalPreviewBody });
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
  // markdown-it は空文字で空HTMLになるので簡易プレースホルダ
  const html = md.render(markdown && markdown.trim().length > 0 ? markdown : '*_(empty)_*');
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
      style={{ width: '100%', height: '100%', position: 'relative', display: isOpen ? 'flex' : 'none', flexDirection: 'column', border: '1px solid #ddd' }}
      aria-hidden={!isOpen}
    >
      {isOpen && (
        <>
          <div style={{ display: 'flex', gap: 8, padding: '4px 6px', background: '#f5f5f5', borderBottom: '1px solid #ccc', alignItems: 'center' }}>
            <strong style={{ fontSize: 12 }}>Vivliostyle Preview Debug</strong>
            <span style={{ fontSize: 11, color: '#555' }}>live md len: {markdown.length}</span>
            <textarea
              value={debugText}
              onChange={(e) => setDebugText(e.target.value)}
              style={{ fontFamily: 'monospace', fontSize: 11, height: 54, flex: 1, resize: 'vertical' }}
            />
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => forceUpdateMarkdown(debugText)}>Force Inject</button>
          </div>
          <div style={{ flex: 1 }}>
            <VivliostyleFrame />
          </div>
        </>
      )}
    </div>
  );
};

export default PreviewShell;
