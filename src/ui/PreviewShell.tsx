// ui/PreviewShell.tsx
import * as React from 'react';
import VivliostyleFrame from './VivliostyleFrame';
import { useAppContext } from '../context/AppContext';

// simple markdown -> html (temporary; will be replaced by VFM pipeline)
import MarkdownIt from 'markdown-it';
const md = new MarkdownIt();

const PreviewShell: React.FC = () => {
  const { isOpen, markdown } = useAppContext();

  React.useEffect(() => {
    const previewContainer = document.getElementById('vivlio-preview-container');
    const originalPreview = document.querySelector('.page-editor-preview-body');
    if (!previewContainer || !originalPreview) return;
    if (isOpen) {
      previewContainer.style.display = 'block';
      (originalPreview as HTMLElement).style.display = 'none';
    } else {
      previewContainer.style.display = 'none';
      (originalPreview as HTMLElement).style.display = 'block';
    }
  }, [isOpen]);

  // send rendered HTML to iframe
  React.useEffect(() => {
    const iframe = document.getElementById('vivlio-iframe') as HTMLIFrameElement | null;
    if (!iframe || !iframe.contentWindow) return;
    const html = md.render(markdown || '');
    iframe.contentWindow.postMessage({ type: 'markdown:update', html }, '*');
  }, [markdown]);

  if (!isOpen) return null; // 最低限: ボタン押下時のみ挿入
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <VivliostyleFrame />
    </div>
  );
};

export default PreviewShell;
