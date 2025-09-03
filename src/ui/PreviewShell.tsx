// ui/PreviewShell.tsx
import * as React from 'react';
import '../styles/preview.css';
import VivliostyleFrame from './VivliostyleFrame';
import { useAppContext } from '../context/AppContext';
import { useVivliostyleBridge } from '../hooks/useVivliostyleBridge';
import * as MarkdownIt from 'markdown-it';

const md = new MarkdownIt();

const PreviewShell: React.FC = () => {
  const { isOpen, markdown } = useAppContext();
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  // markdown-itでHTMLに変換
  const html = React.useMemo(() => md.render(markdown), [markdown]);

  // useVivliostyleBridgeフックでiframeと通信
  const { isReady } = useVivliostyleBridge(iframeRef.current, html);

  React.useEffect(() => {
    // 既存プレビュー本体 (中身) のみを消す
    const originalPreviewBody = document.querySelector('.page-editor-preview-body') as HTMLElement | null;
    const vivlioHost = document.getElementById('vivlio-preview-container');
    if (!vivlioHost) return;
    const originalBodyDisplay = originalPreviewBody?.style.display || '';

    if (isOpen) {
      if (originalPreviewBody) originalPreviewBody.style.display = 'none';
      vivlioHost.style.display = 'flex';
    } else {
      if (originalPreviewBody) originalPreviewBody.style.display = originalBodyDisplay || '';
      vivlioHost.style.display = 'none';
    }

    return () => {
      if (originalPreviewBody) originalPreviewBody.style.display = originalBodyDisplay || '';
      vivlioHost.style.display = 'none';
    };
  }, [isOpen]);

  if (!isOpen) return null;
  return (
    <div className="vivlio-preview" role="region" aria-label="Vivliostyle preview">
      <div className="vivlio-body">
        <VivliostyleFrame ref={iframeRef} />
        {!isReady && (
          <div className="vivlio-loading" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
            Loading Vivliostyle...
          </div>
        )}
      </div>
    </div>
  );
};

export default PreviewShell;
