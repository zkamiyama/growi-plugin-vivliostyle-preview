// client-entry.tsx
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import PreviewShell from './src/ui/PreviewShell';
import ExternalToggle from './src/ui/ExternalToggle';
import { AppProvider } from './src/context/AppContext';
import config from './package.json';

// 早期ロード確認ログ (script が読み込まれているか最初に出る)
// eslint-disable-next-line no-console
console.debug('[VivlioDBG][entry] script file evaluated', { time: Date.now(), plugin: config.name });

// GROWIのスクリプトプラグイン規約：activate/deactivateのみ担当
const PLUGIN_ID = config.name;
const CONTAINER_ID = 'vivlio-preview-container';
const PREVIEW_CONTAINER_CANDIDATES = [
  '.page-editor-preview-container',
  '#page-editor-preview-container',
  '.page-editor-preview',
  '.page-editor-preview-body', // 最後の手段: body 自体をホストにしないが存在検知用
];

function locatePreviewContainer(): Element | null {
  for (const sel of PREVIEW_CONTAINER_CANDIDATES) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

function mount() {
  // eslint-disable-next-line no-console
  console.debug('[VivlioDBG] activate -> mount called, readyState=', document.readyState);
  if (document.readyState === 'loading') {
    // GROWI の遅延ロードタイミングで body 未準備だと失敗することがあるため待機
    document.addEventListener('DOMContentLoaded', () => mount(), { once: true });
    return;
  }

  // --- プレビュー & トグル単一ルートマウント ---
  const previewContainer = locatePreviewContainer();
  // eslint-disable-next-line no-console
  console.debug('[VivlioDBG][mount] query preview container', { found: !!previewContainer, candidates: PREVIEW_CONTAINER_CANDIDATES });

  // Previewコンテナが見つからなくてもマウントを続ける（ExternalToggleはDOMアンカーを探す）
  const targetContainer = previewContainer || document.body;

  let host = document.getElementById(CONTAINER_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = CONTAINER_ID;
    // ベーススタイル: 親と同幅/高さ (高さは後で補正)。display は PreviewShell が制御。
    host.style.width = '100%';
    host.style.height = '100%';
    host.style.position = 'relative';
    host.style.display = 'none';
    targetContainer.appendChild(host);
    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG][mount] host container created and appended', { target: targetContainer.tagName, id: targetContainer.id });
  }

  let root = (window as any).__vivlio_root;
  if (root) {
    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG][mount] root already exists - skipping re-create');
  } else {
    root = createRoot(host);
    (window as any).__vivlio_root = root; // 後でunmount用に保持
  }
  // eslint-disable-next-line no-console
  console.debug('[VivlioDBG][mount] rendering React tree', { hasHost: !!host, childrenBefore: host.childElementCount });
  root.render(
    <React.StrictMode>
      <AppProvider>
        <div style={{ display: 'contents' }}>
          <PreviewShell />
          <ExternalToggle />
        </div>
      </AppProvider>
    </React.StrictMode>
  );
  // eslint-disable-next-line no-console
  console.debug('[VivlioDBG][mount] mount finished', { hostChildrenAfter: host.childElementCount });
}

function unmount() {
  // eslint-disable-next-line no-console
  console.debug('[VivlioDBG][unmount] called');
  const root = (window as any).__vivlio_root;
  if (root) {
    root.unmount();
    delete (window as any).__vivlio_root;
    // eslint-disable-next-line no-console
  console.debug('[VivlioDBG][unmount] root unmounted');
  }
  const host = document.getElementById(CONTAINER_ID);
  if (host?.parentNode) host.parentNode.removeChild(host);
}

const activate = () => {
  // eslint-disable-next-line no-console
  console.debug('[VivlioDBG] activate() invoked', { time: Date.now() });
  mount();
};

const deactivate = () => {
  // eslint-disable-next-line no-console
  console.debug('[VivlioDBG] deactivate() invoked', { time: Date.now() });
  unmount();
};

// GROWIへ登録
if ((window as any).pluginActivators == null) (window as any).pluginActivators = {};
(window as any).pluginActivators[PLUGIN_ID] = { activate, deactivate };
// eslint-disable-next-line no-console
console.debug('[VivlioDBG][entry] pluginActivators registered', { id: PLUGIN_ID });

// デバッグ: 3秒後に自動起動 (本来 GROWI が activate を呼ぶが呼ばれないケース調査用)
if (!(window as any).__vivlio_autoActivateTimer) {
  (window as any).__vivlio_autoActivateTimer = setTimeout(() => {
    if (!(window as any).__vivlio_root) {
      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG][entry] auto activating (fallback)');
      activate();
    } else {
      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG][entry] skip auto activate root already present');
    }
  }, 3000);
}

// 手動強制呼び出し用フック
(window as any).__vivlio_forceActivate = activate;
(window as any).__vivlio_forceUnmount = unmount;
