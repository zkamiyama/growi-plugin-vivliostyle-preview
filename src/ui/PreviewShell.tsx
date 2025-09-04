// ui/PreviewShell.tsx
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { VivliostylePreview } from './VivliostylePreview';
import { useAppContext } from '../context/AppContext';

// シンプルなトグルボタン - Editor previewの上部に配置
const PreviewShell: React.FC = () => {
  const { markdown, activeTab, setActiveTabWithOpen } = useAppContext();

  // トグルボタンの配置（シンプルなHTML挿入）
  React.useEffect(() => {
    const placeToggle = () => {
      const previewContainer = document.querySelector('.page-editor-preview-container') as HTMLElement;
      if (!previewContainer) {
        // eslint-disable-next-line no-console
        console.debug('[VivlioDBG] preview container not found, retrying...');
        return false;
      }

      // 既存のトグルを削除
      const existingToggle = previewContainer.querySelector('.vivlio-toggle-container');
      if (existingToggle) {
        existingToggle.remove();
      }

      // シンプルなHTMLでトグルボタンを作成
      const toggleHtml = `
        <div class="vivlio-toggle-container" style="
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
          padding: 8px 12px;
          background: #f8f9fa;
          border-radius: 6px;
          border: 1px solid #dee2e6;
          font-size: 13px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        ">
          <span style="color: #6c757d; font-weight: 600;">Preview:</span>
          <button class="vivlio-btn-markdown" style="
            padding: 6px 12px;
            border: 1px solid #dee2e6;
            background: ${activeTab === 'markdown' ? '#007bff' : 'white'};
            color: ${activeTab === 'markdown' ? 'white' : '#495057'};
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 600;
            transition: all 0.2s;
          ">Markdown</button>
          <button class="vivlio-btn-vivliostyle" style="
            padding: 6px 12px;
            border: 1px solid #dee2e6;
            background: ${activeTab === 'vivliostyle' ? '#007bff' : 'white'};
            color: ${activeTab === 'vivliostyle' ? 'white' : '#495057'};
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 600;
            transition: all 0.2s;
          ">Vivliostyle</button>
        </div>
      `;

      // previewContainerの先頭に挿入
      previewContainer.insertAdjacentHTML('afterbegin', toggleHtml);

      // イベントリスナーを追加
      const markdownBtn = previewContainer.querySelector('.vivlio-btn-markdown') as HTMLButtonElement;
      const vivliostyleBtn = previewContainer.querySelector('.vivlio-btn-vivliostyle') as HTMLButtonElement;

      if (markdownBtn) {
        markdownBtn.addEventListener('click', () => {
          setActiveTabWithOpen('markdown');
        });
      }
      if (vivliostyleBtn) {
        vivliostyleBtn.addEventListener('click', () => {
          setActiveTabWithOpen('vivliostyle');
        });
      }

      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG] toggle button placed successfully');
      return true;
    };

    // 即時実行
    if (placeToggle()) return;

    // プレビューコンテナがまだない場合、監視
    const observer = new MutationObserver(() => {
      if (placeToggle()) {
        observer.disconnect();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });

    // タイムアウト
    const timeout = setTimeout(() => {
      observer.disconnect();
      // eslint-disable-next-line no-console
      console.warn('[VivlioDBG] toggle button placement timed out');
    }, 10000);

    return () => {
      observer.disconnect();
      clearTimeout(timeout);
    };
  }, [activeTab, setActiveTabWithOpen]);

  // コンテンツの表示制御（Markdown/Vivliostyle切り替え）
  React.useEffect(() => {
    const previewContainer = document.querySelector('.page-editor-preview-container') as HTMLElement;
    if (!previewContainer) return;

    // 標準のプレビュー本文を探す
    const previewBody = previewContainer.querySelector('.page-editor-preview-body') as HTMLElement;
    const tabContent = previewContainer.querySelector('.tab-content') as HTMLElement;

    if (activeTab === 'vivliostyle') {
      // Vivliostyleの場合、標準コンテンツを隠す
      if (previewBody) previewBody.style.display = 'none';
      if (tabContent) tabContent.style.display = 'none';
    } else {
      // Markdownの場合、標準コンテンツを表示
      if (previewBody) previewBody.style.display = '';
      if (tabContent) tabContent.style.display = '';
    }
  }, [activeTab]);

  // Vivliostyleコンテンツの配置（シンプルなHTML挿入）
  React.useEffect(() => {
    if (activeTab !== 'vivliostyle') {
      // Vivliostyleでない場合はコンテンツを削除
      const existingVivlio = document.querySelector('.vivlio-content-container');
      if (existingVivlio) {
        existingVivlio.remove();
      }
      return;
    }

    const previewContainer = document.querySelector('.page-editor-preview-container') as HTMLElement;
    if (!previewContainer) return;

    // 既存のVivliostyleコンテナを削除
    const existingVivlio = previewContainer.querySelector('.vivlio-content-container');
    if (existingVivlio) {
      existingVivlio.remove();
    }

    // Vivliostyleコンテナを作成
    const vivlioContainer = document.createElement('div');
    vivlioContainer.className = 'vivlio-content-container';
    vivlioContainer.style.cssText = `
      position: relative;
      width: 100%;
      min-height: 400px;
      margin-top: 8px;
      border: 1px solid #dee2e6;
      border-radius: 4px;
      background: white;
    `;

    // Reactコンポーネントをレンダリング
    const root = createRoot(vivlioContainer);
    root.render(<VivliostylePreview markdown={markdown} isVisible={true} />);

    // previewContainerに追加
    previewContainer.appendChild(vivlioContainer);

    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG] Vivliostyle content placed');

    return () => {
      // クリーンアップ
      const existing = document.querySelector('.vivlio-content-container');
      if (existing) {
        existing.remove();
      }
    };
  }, [activeTab, markdown]);

  // このコンポーネント自体は表示しない（直接DOM操作）
  return null;
};

export default PreviewShell;
