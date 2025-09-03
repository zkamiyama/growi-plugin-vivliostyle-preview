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
    
    // 追加の候補セレクタで元プレビューを探索
    const originalPreviewCandidates = [
      '.page-editor-preview-body',
      '.page-editor-preview .preview-body',
      '.grw-editor-preview-body',
      '.preview-body',
      '.page-editor-preview > div',
    ];
    
    let originalElement = originalPreviewBody;
    if (!originalElement) {
      for (const sel of originalPreviewCandidates) {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (el) {
          originalElement = el;
          break;
        }
      }
    }
    
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
      host.style.zIndex = '10'; // 元プレビューより上に表示
      if (!host.style.minHeight) host.style.minHeight = '400px';
    }
    
    // 元プレビューの隠蔽をより確実にする
    if (originalElement) {
      const displayBefore = originalElement.style.display;
      const visibilityBefore = originalElement.style.visibility;

      if (isOpen) {
        originalElement.style.setProperty('display', 'none', 'important');
        originalElement.style.visibility = 'hidden';
        originalElement.setAttribute('aria-hidden', 'true');
      } else {
        originalElement.style.display = '';
        originalElement.style.visibility = '';
        originalElement.removeAttribute('aria-hidden');
      }

      const displayAfter = originalElement.style.display;
      const visibilityAfter = originalElement.style.visibility;
      const computedDisplay = window.getComputedStyle(originalElement).display;

      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG][PreviewShell] style change details', {
        displayBefore,
        visibilityBefore,
        displayAfter,
        visibilityAfter,
        computedDisplay,
      });
    }
    
    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG][PreviewShell] toggle effect', {
      isOpen,
      hasHost: !!host,
      originalElement: originalElement?.className || 'none',
      hiddenOriginal: !!originalElement && originalElement.style.display === 'none',
      markdownLen: markdown.length,
      hostChildren: host.childElementCount,
      hostDisplay: host.style.display,
      hostZIndex: host.style.zIndex,
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
