// ui/PreviewShell.tsx
import * as React from 'react';
import { VivliostylePreview } from './VivliostylePreview';
import { useAppContext } from '../context/AppContext';

// シンプルなトグルボタン - Editor previewの上部に配置
const PreviewShell: React.FC = () => {
  const { isOpen, markdown, activeTab, setActiveTabWithOpen } = useAppContext();

  // トグルボタンコンポーネント
  const ToggleButton = () => (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      marginBottom: '8px',
      padding: '4px 8px',
      background: '#f8f9fa',
      borderRadius: '4px',
      border: '1px solid #dee2e6'
    }}>
      <span style={{ fontSize: '12px', color: '#6c757d', fontWeight: 'bold' }}>
        Preview:
      </span>
      <button
        onClick={() => setActiveTabWithOpen('markdown')}
        style={{
          padding: '4px 8px',
          border: '1px solid #dee2e6',
          background: activeTab === 'markdown' ? '#007bff' : 'white',
          color: activeTab === 'markdown' ? 'white' : '#495057',
          borderRadius: '3px',
          cursor: 'pointer',
          fontSize: '11px',
          fontWeight: 'bold'
        }}
      >
        Markdown
      </button>
      <button
        onClick={() => setActiveTabWithOpen('vivliostyle')}
        style={{
          padding: '4px 8px',
          border: '1px solid #dee2e6',
          background: activeTab === 'vivliostyle' ? '#007bff' : 'white',
          color: activeTab === 'vivliostyle' ? 'white' : '#495057',
          borderRadius: '3px',
          cursor: 'pointer',
          fontSize: '11px',
          fontWeight: 'bold'
        }}
      >
        Vivliostyle
      </button>
    </div>
  );

  // 初期マウント時とisOpen変更時にトグルボタンを配置
  React.useEffect(() => {
    const placeToggle = () => {
      // Editor previewコンテナを探す
      const previewContainer = document.querySelector('.page-editor-preview-container') as HTMLElement;
      if (!previewContainer) {
        // eslint-disable-next-line no-console
        console.debug('[VivlioDBG][PreviewShell] preview container not found');
        return;
      }

      // 既存のトグルボタンを削除
      const existingToggle = previewContainer.querySelector('.vivlio-toggle-container');
      if (existingToggle) {
        existingToggle.remove();
      }

      // 新しいトグルボタンコンテナを作成
      const toggleContainer = document.createElement('div');
      toggleContainer.className = 'vivlio-toggle-container';
      toggleContainer.style.cssText = `
        position: relative;
        z-index: 10;
        margin-bottom: 8px;
      `;

      // Reactコンポーネントをレンダリング
      const root = (window as any).__vivlio_toggle_root || ((window as any).__vivlio_toggle_root = (window as any).ReactDOM.createRoot(toggleContainer));
      root.render(<ToggleButton />);

      // previewContainerの先頭に挿入
      if (previewContainer.firstChild) {
        previewContainer.insertBefore(toggleContainer, previewContainer.firstChild);
      } else {
        previewContainer.appendChild(toggleContainer);
      }

      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG][PreviewShell] toggle button placed');
    };

    if (isOpen) {
      // 少し遅延してDOMが安定してから配置
      setTimeout(placeToggle, 100);
    }

    return () => {
      // クリーンアップ
      const existingToggle = document.querySelector('.vivlio-toggle-container');
      if (existingToggle) {
        existingToggle.remove();
      }
    };
  }, [isOpen, activeTab]);

  // コンテンツの表示制御
  React.useEffect(() => {
    const previewContainer = document.querySelector('.page-editor-preview-container') as HTMLElement;
    if (!previewContainer) return;

    // 標準のプレビュー本文を探す
    const previewBody = previewContainer.querySelector('.page-editor-preview-body') as HTMLElement;
    const tabContent = previewContainer.querySelector('.tab-content') as HTMLElement;

    if (isOpen) {
      // Vivliostyleの場合、標準コンテンツを隠す
      if (activeTab === 'vivliostyle') {
        if (previewBody) previewBody.style.display = 'none';
        if (tabContent) tabContent.style.display = 'none';
      } else {
        // Markdownの場合、標準コンテンツを表示
        if (previewBody) previewBody.style.display = '';
        if (tabContent) tabContent.style.display = '';
      }
    } else {
      // プレビューが閉じている場合、標準コンテンツを表示
      if (previewBody) previewBody.style.display = '';
      if (tabContent) tabContent.style.display = '';
    }
  }, [isOpen, activeTab]);

  // Vivliostyleコンテンツの配置
  React.useEffect(() => {
    if (!isOpen || activeTab !== 'vivliostyle') return;

    const previewContainer = document.querySelector('.page-editor-preview-container') as HTMLElement;
    if (!previewContainer) return;

    // 既存のVivliostyleコンテナを削除
    const existingVivlio = previewContainer.querySelector('.vivlio-content-container');
    if (existingVivlio) {
      existingVivlio.remove();
    }

    // 新しいVivliostyleコンテナを作成
    const vivlioContainer = document.createElement('div');
    vivlioContainer.className = 'vivlio-content-container';
    vivlioContainer.style.cssText = `
      position: relative;
      width: 100%;
      min-height: 400px;
      margin-top: 8px;
    `;

    // Reactコンポーネントをレンダリング
    const root = (window as any).__vivlio_content_root || ((window as any).__vivlio_content_root = (window as any).ReactDOM.createRoot(vivlioContainer));
    root.render(<VivliostylePreview markdown={markdown} isVisible={true} />);

    // previewContainerに追加
    previewContainer.appendChild(vivlioContainer);

    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG][PreviewShell] Vivliostyle content placed');

    return () => {
      // クリーンアップ
      const existingVivlio = document.querySelector('.vivlio-content-container');
      if (existingVivlio) {
        existingVivlio.remove();
      }
    };
  }, [isOpen, activeTab, markdown]);

  // このコンポーネント自体は表示しない（Portalで配置するため）
  return null;
};

export default PreviewShell;
