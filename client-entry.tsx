// client-entry.tsx
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import PreviewShell from './src/ui/PreviewShell';
import { AppProvider } from './src/context/AppContext';
import config from './package.json';

// 早期ロード確認ログ
// eslint-disable-next-line no-console
console.debug('[VivlioDBG][entry] script file evaluated', { time: Date.now(), plugin: config.name });

// Reactルートをbodyに作成（シンプルに）
const CONTAINER_ID = 'vivlio-plugin-root';

function mount() {
  // eslint-disable-next-line no-console
  console.debug('[VivlioDBG] mount called');

  let host = document.getElementById(CONTAINER_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = CONTAINER_ID;
    host.style.display = 'none'; // 非表示（PreviewShellが直接DOM操作）
    document.body.appendChild(host);
  }

  const root = createRoot(host);
  root.render(
    <React.StrictMode>
      <AppProvider>
        <PreviewShell />
      </AppProvider>
    </React.StrictMode>
  );

  // eslint-disable-next-line no-console
  console.debug('[VivlioDBG] mount finished');
}

function unmount() {
  // eslint-disable-next-line no-console
  console.debug('[VivlioDBG] unmount called');
  const host = document.getElementById(CONTAINER_ID);
  if (host?.parentNode) {
    host.parentNode.removeChild(host);
  }
}

// GROWIプラグインとして登録
const PLUGIN_ID = config.name;
if ((window as any).pluginActivators == null) (window as any).pluginActivators = {};
(window as any).pluginActivators[PLUGIN_ID] = { activate: mount, deactivate: unmount };

// eslint-disable-next-line no-console
console.debug('[VivlioDBG][entry] plugin registered', { id: PLUGIN_ID });
