// ui/PreviewShell.tsx
import * as React from 'react';
import { createPortal } from 'react-dom';
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

  // isOpenの変更を監視
  React.useEffect(() => {
    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG][PreviewShell] isOpen changed', { isOpen, markdownLen: markdown.length });
  }, [isOpen, markdown]);

  const previewContainer = React.useMemo(() => {
    const candidates = [
      '.page-editor-preview-container',
      '#page-editor-preview-container',
      '.page-editor-preview',
      '.page-editor-preview-body',
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el) {
        // eslint-disable-next-line no-console
        console.debug('[VivlioDBG][PreviewShell] found previewContainer', { sel, el, className: el.className });
        return el;
      }
    }
    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG][PreviewShell] no previewContainer found', { candidates });
    return null;
  }, []);

  // eslint-disable-next-line no-console
  console.debug('[VivlioDBG][PreviewShell] render', { isOpen, hasPreviewContainer: !!previewContainer, markdownLen: markdown.length });

  if (!previewContainer) {
    return null;
  }

  const host = document.getElementById('vivlio-preview-container');
  if (!host) {
    const newHost = document.createElement('div');
    newHost.id = 'vivlio-preview-container';
    newHost.style.width = '100%';
    newHost.style.height = '100%';
    newHost.style.position = 'relative';
    newHost.style.display = 'none';
    if (previewContainer) {
      previewContainer.appendChild(newHost);
    }
  }

  const finalHost = document.getElementById('vivlio-preview-container');
  if (!finalHost) {
    return null;
  }

  React.useEffect(() => {
    const host = document.getElementById('vivlio-preview-container');
    const previewContainer = document.querySelector('.page-editor-preview-container') as HTMLElement | null;

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
      host.style.zIndex = '10';
      if (!host.style.minHeight) host.style.minHeight = '400px';
    }

    // プレビューコンテナの表示制御
    if (previewContainer) {
      if (isOpen) {
        // 保存
        if (!previewContainer.dataset.vivlioOriginalClass) {
          previewContainer.dataset.vivlioOriginalClass = previewContainer.className;
        }
        // d-none を削除して d-flex を追加
        previewContainer.classList.remove('d-none');
        previewContainer.classList.add('d-flex');
      } else {
        // 復帰
        if (previewContainer.dataset.vivlioOriginalClass) {
          previewContainer.className = previewContainer.dataset.vivlioOriginalClass;
          delete previewContainer.dataset.vivlioOriginalClass;
        }
      }
    }

    let hiddenCount = 0;
    let restoredCount = 0;
    const processed: string[] = [];

    if (previewContainer) {
      const children = Array.from(previewContainer.children) as HTMLElement[];
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
      hasHost: !!host,
      hasPreviewContainer: !!previewContainer,
      hostDisplay: host.style.display,
      previewContainerClass: previewContainer?.className,
      markdownLen: markdown.length,
      hiddenCount,
      restoredCount,
      processed,
      previewChildren: previewContainer ? previewContainer.children.length : -1,
    });
  }, [isOpen]);

  // Host (#vivlio-preview-container) 内にマウントされるのでラッパ不要
  if (!isOpen) {
    return null;
  }
  return createPortal(
    <div data-vivlio-shell-root>
      <VivliostylePreview markdown={markdown} isVisible={isOpen} />
    </div>,
    finalHost
  );
};

export default PreviewShell;
