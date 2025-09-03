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
const TOGGLE_CONTAINER_ID = 'vivlio-toggle-container';

function mount() {
  if (document.readyState === 'loading') {
    // GROWI の遅延ロードタイミングで body 未準備だと失敗することがあるため待機
    document.addEventListener('DOMContentLoaded', () => mount(), { once: true });
    return;
  }

  // --- プレビュー本体のマウント ---
  const previewContainer = document.querySelector('.page-editor-preview-container');
  if (!previewContainer) {
    setTimeout(mount, 200); // リトライ
    return;
  }
  let host = document.getElementById(CONTAINER_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = CONTAINER_ID;
    host.style.display = 'none'; // 初期は非表示
    previewContainer.appendChild(host);
  }

  const root = createRoot(host);
  root.render(
    <React.StrictMode>
      <AppProvider>
        <PreviewShell />
      </AppProvider>
    </React.StrictMode>
  );
  (window as any).__vivlio_root = root; // 後でunmount用に保持

  // --- トグルボタンのマウント ---
  const editorNavbar = document.querySelector('.page-editor-navbar-bottom');
  if (editorNavbar) {
    let toggleHost = document.getElementById(TOGGLE_CONTAINER_ID);
    if (!toggleHost) {
      toggleHost = document.createElement('div');
      toggleHost.id = TOGGLE_CONTAINER_ID;
      toggleHost.classList.add('ml-2'); // for margin
      editorNavbar.appendChild(toggleHost);
    }

    const toggleRoot = createRoot(toggleHost);
    toggleRoot.render(
      <React.StrictMode>
        <AppProvider>
          <ExternalToggle />
        </AppProvider>
      </React.StrictMode>
    );
    (window as any).__vivlio_toggle_root = toggleRoot;
  }
}

function unmount() {
  const root = (window as any).__vivlio_root;
  if (root) {
    root.unmount();
    delete (window as any).__vivlio_root;
  }
  const host = document.getElementById(CONTAINER_ID);
  if (host?.parentNode) host.parentNode.removeChild(host);

  const toggleRoot = (window as any).__vivlio_toggle_root;
  if (toggleRoot) {
    toggleRoot.unmount();
    delete (window as any).__vivlio_toggle_root;
  }
  const toggleHost = document.getElementById(TOGGLE_CONTAINER_ID);
  if (toggleHost?.parentNode) toggleHost.parentNode.removeChild(toggleHost);
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
