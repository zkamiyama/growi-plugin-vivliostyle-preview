// ui/PreviewShell.tsx
import * as React from 'react';
import { VivliostylePreview } from './VivliostylePreview';
import { useAppContext } from '../context/AppContext';

// 編集モードに応じてPreviewコンテナまたはWikiコンテナを操作
// トグルでVivliostyleプレビューを表示/非表示し、元のコンテンツを隠す
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

    if (!host) {
      // eslint-disable-next-line no-console
      console.warn('[VivlioDBG][PreviewShell] host container missing when toggling', { isOpen });
      return;
    }

    // 編集モードかどうかを判定
    const isEditMode = window.location.hash.includes('#edit') ||
                      !!document.querySelector('[data-testid="editor-button"]') ||
                      !!document.querySelector('.page-editor');

    // 編集モードに応じて操作対象のコンテナを選択
    let targetContainer: HTMLElement | null = null;
    if (isEditMode) {
      // 編集モード: Previewコンテナを操作
      targetContainer = document.querySelector('.page-editor-preview-container') as HTMLElement | null;
    } else {
      // 通常画面: Wikiコンテナを操作
      targetContainer = document.querySelector('.wiki') as HTMLElement | null;
    }

    host.dataset.vivlioMount = 'true';
    host.style.display = isOpen ? 'block' : 'none';
    if (isOpen) {
      host.style.position = 'relative';
      host.style.width = '100%';
      host.style.height = '100%';
      host.style.overflow = 'auto';
      host.style.zIndex = '10';
      if (!host.style.minHeight) host.style.minHeight = '400px';
    }

    let hiddenCount = 0;
    let restoredCount = 0;
    const processed: string[] = [];

    if (targetContainer) {
      const children = Array.from(targetContainer.children) as HTMLElement[];
      children.forEach((el, idx) => {
        if (el === host) return; // 自分は対象外
        processed.push(`${idx}:${el.className || el.id || el.tagName}`);
        if (isOpen) {
          // 既に保存していなければ元displayを保存
            if (!el.dataset.vivlioPrevDisplay) {
              el.dataset.vivlioPrevDisplay = el.style.display || '';
            }
            el.style.setProperty('display', 'none', 'important');
            el.setAttribute('aria-hidden', 'true');
            hiddenCount += 1;
        } else {
          if (el.dataset.vivlioPrevDisplay !== undefined) {
            el.style.display = el.dataset.vivlioPrevDisplay;
            delete el.dataset.vivlioPrevDisplay; // 復帰後クリア
          } else {
            el.style.display = '';
          }
          el.removeAttribute('aria-hidden');
          restoredCount += 1;
        }
      });
    }

    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG][PreviewShell] toggle siblings', {
      isOpen,
      isEditMode,
      hasHost: !!host,
      hasTargetContainer: !!targetContainer,
      targetContainerClass: targetContainer?.className,
      hostDisplay: host.style.display,
      markdownLen: markdown.length,
      hiddenCount,
      restoredCount,
      processed,
      targetChildren: targetContainer ? targetContainer.children.length : -1,
    });
  }, [isOpen]);

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
