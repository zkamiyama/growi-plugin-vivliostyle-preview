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

  const [previewContainer, setPreviewContainer] = React.useState<HTMLElement | null>(() => {
    // page-editor-preview-containerを優先的に探す
    const primarySelector = '.page-editor-preview-container';
    const el = document.querySelector(primarySelector) as HTMLElement | null;
    if (el) {
      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG][PreviewShell] found primary previewContainer', { selector: primarySelector, el, className: el.className });
      return el;
    }

    // フォールバック候補
    const fallbackCandidates = [
      '#page-editor-preview-container',
      '.page-editor-preview',
      '.page-editor-preview-body',
    ];
    for (const sel of fallbackCandidates) {
      const fallbackEl = document.querySelector(sel) as HTMLElement | null;
      if (fallbackEl) {
        // eslint-disable-next-line no-console
        console.debug('[VivlioDBG][PreviewShell] found fallback previewContainer', { sel, el: fallbackEl, className: fallbackEl.className });
        return fallbackEl;
      }
    }

    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG][PreviewShell] no previewContainer found', { primarySelector, fallbackCandidates });
    return null;
  });

  // previewContainerが見つからない場合、定期的に探す
  React.useEffect(() => {
    if (previewContainer) return; // 既にみつかっている場合は何もしない

    const findContainer = () => {
      // page-editor-preview-containerを優先的に探す
      const primarySelector = '.page-editor-preview-container';
      const el = document.querySelector(primarySelector) as HTMLElement | null;
      if (el) {
        // eslint-disable-next-line no-console
        console.debug('[VivlioDBG][PreviewShell] found primary previewContainer (delayed)', { selector: primarySelector, el, className: el.className });
        setPreviewContainer(el);
        return true;
      }

      // フォールバック候補
      const fallbackCandidates = [
        '#page-editor-preview-container',
        '.page-editor-preview',
        '.page-editor-preview-body',
      ];
      for (const sel of fallbackCandidates) {
        const fallbackEl = document.querySelector(sel) as HTMLElement | null;
        if (fallbackEl) {
          // eslint-disable-next-line no-console
          console.debug('[VivlioDBG][PreviewShell] found fallback previewContainer (delayed)', { sel, el: fallbackEl, className: fallbackEl.className });
          setPreviewContainer(fallbackEl);
          return true;
        }
      }
      return false;
    };

    // 即時実行
    if (findContainer()) return;

    // 見つからない場合、定期的に探す
    const interval = setInterval(() => {
      if (findContainer()) {
        clearInterval(interval);
      }
    }, 500); // 500msごとにチェック

    // 最大10秒でタイムアウト
    const timeout = setTimeout(() => {
      clearInterval(interval);
      // eslint-disable-next-line no-console
      console.warn('[VivlioDBG][PreviewShell] previewContainer not found after 10 seconds - giving up search');
      // タイムアウト時はpreviewContainerをnullに設定してローディング状態を終了
      setPreviewContainer(null);
    }, 10000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [previewContainer]);

  // eslint-disable-next-line no-console
  console.debug('[VivlioDBG][PreviewShell] render', {
    isOpen,
    hasPreviewContainer: !!previewContainer,
    previewContainerClass: previewContainer?.className,
    markdownLen: markdown.length
  });

  // previewContainerが見つからない場合でも、isOpenがtrueなら適切なフィードバックを表示
  if (!previewContainer) {
    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG][PreviewShell] previewContainer not found', { isOpen });

    if (!isOpen) {
      return null;
    }

    // ローディング状態を表示（タイムアウト後も表示）
    return (
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'rgba(0, 0, 0, 0.8)',
        color: 'white',
        padding: '20px',
        borderRadius: '8px',
        zIndex: 9999,
        fontSize: '14px',
        textAlign: 'center',
        maxWidth: '300px'
      }}>
        <div style={{ marginBottom: '10px' }}>⚠️ Vivliostyle Preview</div>
        <div>プレビューコンテナが見つかりません</div>
        <div style={{ fontSize: '12px', opacity: 0.7, marginTop: '8px' }}>
          ページの構造が変更された可能性があります。<br />
          ページを再読み込みするか、開発者に連絡してください。
        </div>
      </div>
    );
  }

  // previewContainerが見つかった場合のみホストを作成
  const host = document.getElementById('vivlio-preview-container');
  if (!host) {
    const newHost = document.createElement('div');
    newHost.id = 'vivlio-preview-container';
    newHost.style.width = '100%';
    newHost.style.height = '100%';
    newHost.style.position = 'relative';
    newHost.style.display = 'none';
    // previewContainer内に確実に追加
    previewContainer.appendChild(newHost);
    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG][PreviewShell] host created and appended to previewContainer', {
      previewContainer: previewContainer.className,
      hostId: newHost.id
    });
  }

  const finalHost = document.getElementById('vivlio-preview-container');
  if (!finalHost) {
    // eslint-disable-next-line no-console
    console.warn('[VivlioDBG][PreviewShell] failed to create or find host container');
    return null;
  }

  React.useEffect(() => {
    const host = document.getElementById('vivlio-preview-container');
    const currentPreviewContainer = document.querySelector('.page-editor-preview-container') as HTMLElement | null;

    if (!host) {
      // eslint-disable-next-line no-console
      console.warn('[VivlioDBG][PreviewShell] host container missing when toggling', { isOpen });
      return;
    }

    if (!currentPreviewContainer) {
      // eslint-disable-next-line no-console
      console.warn('[VivlioDBG][PreviewShell] page-editor-preview-container not found during toggle', { isOpen });
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

      // プレビュー準備完了を通知
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('vivlio:preview-mounted'));
        // eslint-disable-next-line no-console
        console.debug('[VivlioDBG][PreviewShell] preview mounted notification sent');
      }, 100);
    }

    // プレビューコンテナの表示制御
    if (isOpen) {
      // 保存
      if (!currentPreviewContainer.dataset.vivlioOriginalClass) {
        currentPreviewContainer.dataset.vivlioOriginalClass = currentPreviewContainer.className;
      }
      // d-none を削除して d-flex を追加
      currentPreviewContainer.classList.remove('d-none');
      currentPreviewContainer.classList.add('d-flex');
    } else {
      // 復帰
      if (currentPreviewContainer.dataset.vivlioOriginalClass) {
        currentPreviewContainer.className = currentPreviewContainer.dataset.vivlioOriginalClass;
        delete currentPreviewContainer.dataset.vivlioOriginalClass;
      }
    }

    let hiddenCount = 0;
    let restoredCount = 0;
    const processed: string[] = [];

    const children = Array.from(currentPreviewContainer.children) as HTMLElement[];
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

    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG][PreviewShell] toggle siblings', {
      isOpen,
      hasHost: !!host,
      hasPreviewContainer: !!currentPreviewContainer,
      hostDisplay: host.style.display,
      previewContainerClass: currentPreviewContainer?.className,
      markdownLen: markdown.length,
      hiddenCount,
      restoredCount,
      processed,
      previewChildren: currentPreviewContainer ? currentPreviewContainer.children.length : -1,
    });
  }, [isOpen, previewContainer]);

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
