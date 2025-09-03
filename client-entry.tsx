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
  // eslint-disable-next-line no-console
  console.debug('[VivlioDBG] activate -> mount called, readyState=', document.readyState);
  if (document.readyState === 'loading') {
    // GROWI の遅延ロードタイミングで body 未準備だと失敗することがあるため待機
    document.addEventListener('DOMContentLoaded', () => mount(), { once: true });
    return;
  }

  // --- プレビュー & トグル単一ルートマウント ---
  const previewContainer = document.querySelector('.page-editor-preview-container');
  if (!previewContainer) {
    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG] previewContainer not found, retry scheduling');
    setTimeout(mount, 200); // リトライ
    return;
  }
  let host = document.getElementById(CONTAINER_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = CONTAINER_ID;
  // ベーススタイル: 親と同幅/高さ (高さは後で補正)。display は PreviewShell が制御。
  host.style.width = '100%';
  host.style.height = '100%';
  host.style.position = 'relative';
  host.style.display = 'none';
    previewContainer.appendChild(host);
    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG] host container created and appended');
  }

  const root = createRoot(host);
  // eslint-disable-next-line no-console
  console.debug('[VivlioDBG] React root created, rendering...');
  root.render(
    <React.StrictMode>
      <AppProvider>
        <PreviewShell />
        <ExternalToggle />
      </AppProvider>
    </React.StrictMode>
  );
  (window as any).__vivlio_root = root; // 後でunmount用に保持

  // eslint-disable-next-line no-console
  console.debug('[VivlioDBG] mount finished');
}

function unmount() {
  // eslint-disable-next-line no-console
  console.debug('[VivlioDBG] unmount called');
  const root = (window as any).__vivlio_root;
  if (root) {
    root.unmount();
    delete (window as any).__vivlio_root;
    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG] root unmounted');
  }
  const host = document.getElementById(CONTAINER_ID);
  if (host?.parentNode) host.parentNode.removeChild(host);
}

const activate = () => {
  // eslint-disable-next-line no-console
  console.debug('[VivlioDBG] activate() invoked');
  mount();
};

const deactivate = () => {
  // eslint-disable-next-line no-console
  console.debug('[VivlioDBG] deactivate() invoked');
  unmount();
};

// GROWIへ登録
if ((window as any).pluginActivators == null) (window as any).pluginActivators = {};
(window as any).pluginActivators[PLUGIN_ID] = { activate, deactivate };
