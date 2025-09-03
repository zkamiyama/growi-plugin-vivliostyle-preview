// ui/PreviewShell.tsx
import * as React from 'react';
import '../styles/preview.css';
import VivliostyleFrame from './VivliostyleFrame';
import { useAppContext } from '../context/AppContext';

const PreviewShell: React.FC = () => {
  const { isOpen } = useAppContext();
  // 最小構成: markdown 送信やロード状態管理を行わず単純表示のみ
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

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
      </div>
    </div>
  );
};

export default PreviewShell;
