// client-entry.tsx
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import PreviewShell from './src/ui/PreviewShell';
import ExternalToggle from './src/ui/ExternalToggle';
import { AppProvider } from './src/context/AppContext';
import config from './package.json';

// GROWIのスクリプトプラグイン規約：activate/deactivateのみ担当
const PLUGIN_ID = config.name;
const CONTAINER_ID = 'vivlio-preview-container';

function mount() {
  if (document.readyState === 'loading') {
    // GROWI の遅延ロードタイミングで body 未準備だと失敗することがあるため待機
    document.addEventListener('DOMContentLoaded', () => mount(), { once: true });
    return;
  }

  const previewContainer = document.querySelector('.page-editor-preview-container');
  if (!previewContainer) {
    setTimeout(mount, 200); // リトライ
    return;
  }
  const parent = previewContainer.parentElement;
  if (!parent) {
    console.warn('[vivlio] preview container has no parent');
    return;
  }
  let host = document.getElementById(CONTAINER_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = CONTAINER_ID;
    host.style.display = 'none'; // 初期は非表示
    // 既存プレビュー直後に挿入
    parent.insertBefore(host, previewContainer.nextSibling);
  }

  const root = createRoot(host);
  root.render(
    <React.StrictMode>
      <AppProvider>
        <PreviewShell />
        <ExternalToggle />
      </AppProvider>
    </React.StrictMode>
  );
  (window as any).__vivlio_root = root; // 後でunmount用に保持
}

function unmount() {
  const root = (window as any).__vivlio_root;
  if (root) {
    root.unmount();
    delete (window as any).__vivlio_root;
  }
  const host = document.getElementById(CONTAINER_ID);
  if (host?.parentNode) host.parentNode.removeChild(host);
}

const activate = () => {
  mount();
};

const deactivate = () => {
  unmount();
};

// GROWIへ登録
if ((window as any).pluginActivators == null) (window as any).pluginActivators = {};
(window as any).pluginActivators[PLUGIN_ID] = { activate, deactivate };
