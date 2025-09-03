// ui/PreviewShell.tsx
import * as React from 'react';
import { VivliostylePreview } from './VivliostylePreview';
import { useAppContext } from '../context/AppContext';

// 元の `.page-editor-preview-container` 内に生成した #vivlio-preview-container を
// トグルで表示/非表示し、従来の preview body (.page-editor-preview-body) を隠すだけの
// シンプルな差し替え方式。ポップアップは廃止。
const PreviewShell: React.FC = () => {
  const { isOpen, markdown } = useAppContext();

  // 初回マウントログ
  React.useEffect(() => {
    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG][PreviewShell] mount', { time: Date.now() });
    return () => {
      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG][PreviewShell] unmount', { time: Date.now() });
    };
  }, []);

  React.useEffect(() => {
    const host = document.getElementById('vivlio-preview-container');
    const originalPreviewBody = document.querySelector('.page-editor-preview-body') as HTMLElement | null;
    if (!host) {
      // eslint-disable-next-line no-console
      console.warn('[VivlioDBG][PreviewShell] host container missing when toggling', { isOpen });
      return;
    }
    host.dataset.vivlioMount = 'true';
    host.style.display = isOpen ? 'block' : 'none';
    if (isOpen) {
      host.style.position = 'relative';
      host.style.width = '100%';
      host.style.height = '100%';
      host.style.overflow = 'auto';
      if (!host.style.minHeight) host.style.minHeight = '400px';
    }
    if (originalPreviewBody) {
      originalPreviewBody.style.display = isOpen ? 'none' : 'block';
    }
    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG][PreviewShell] toggle effect', {
      isOpen,
      hasHost: !!host,
      hiddenOriginal: !!originalPreviewBody && originalPreviewBody.style.display === 'none',
      markdownLen: markdown.length,
      hostChildren: host.childElementCount,
    });
  }, [isOpen, markdown.length]);

  // Host (#vivlio-preview-container) 内にマウントされるのでラッパ不要
  if (!isOpen) {
    return null;
  }
  return (
    <div data-vivlio-shell-root>
      <VivliostylePreview markdown={markdown} isVisible={isOpen} />
    </div>
  );
};

export default PreviewShell;
