// ui/PreviewShell.tsx
import * as React from 'react';
import { VivliostylePreview } from './VivliostylePreview';
import { useAppContext } from '../context/AppContext';

// 元の `.page-editor-preview-container` 内に生成した #vivlio-preview-container を
// トグルで表示/非表示し、従来の preview body (.page-editor-preview-body) を隠すだけの
// シンプルな差し替え方式。ポップアップは廃止。
const PreviewShell: React.FC = () => {
  const { isOpen, markdown } = useAppContext();

  React.useEffect(() => {
    const host = document.getElementById('vivlio-preview-container');
    const originalPreviewBody = document.querySelector('.page-editor-preview-body') as HTMLElement | null;
    if (host) {
      host.style.display = isOpen ? 'block' : 'none';
      if (isOpen) {
        host.style.position = 'relative';
        host.style.width = '100%';
        host.style.height = '100%';
        host.style.overflow = 'auto';
        // 高さが親で管理されない場合のフォールバック
        if (!host.style.minHeight) host.style.minHeight = '400px';
      }
    }
    if (originalPreviewBody) {
      originalPreviewBody.style.display = isOpen ? 'none' : 'block';
    }
    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG] inline replace effect', { isOpen, hasHost: !!host, hiddenOriginal: !!originalPreviewBody });
  }, [isOpen]);

  // Host (#vivlio-preview-container) 内にマウントされるのでラッパ不要
  return isOpen ? <VivliostylePreview markdown={markdown} isVisible={isOpen} /> : null;
};

export default PreviewShell;
