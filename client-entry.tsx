// client-entry.tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import PreviewShell from './src/ui/PreviewShell';
import config from './package.json';

// GROWIのスクリプトプラグイン規約：activate/deactivateのみ担当
const PLUGIN_ID = config.name;
const CONTAINER_ID = 'vivlio-preview-container';

function mount() {
  let host = document.getElementById(CONTAINER_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = CONTAINER_ID;
    document.body.appendChild(host);
  }
  const root = createRoot(host);
  root.render(<PreviewShell />);
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
  // 初期は非表示。ユーザー操作で開く（PreviewShell側で制御）
  mount();
};

const deactivate = () => {
  unmount();
};

// GROWIへ登録
if ((window as any).pluginActivators == null) (window as any).pluginActivators = {};
(window as any).pluginActivators[PLUGIN_ID] = { activate, deactivate };
