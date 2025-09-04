// === GROWI公式推奨: 編集画面判定フック ===
type AnyFn = (...args: any[]) => any;
type GrowiFacade = {
  markdownRenderer?: {
    optionsGenerators?: {
      generateViewOptions?: AnyFn;
      generatePreviewOptions?: AnyFn;
      customGenerateViewOptions?: AnyFn;
      customGeneratePreviewOptions?: AnyFn;
    };
  };
  react?: any;
};
declare const growiFacade: GrowiFacade;
declare global {
  interface Window {
    __MY_PLUGIN_STATE__?: {
      isEditPreview: boolean;
      lastMode: 'view' | 'preview' | null;
    };
  }
}
const PLUGIN_EDIT_FLAG = '__MY_PLUGIN_STATE__';
let originalCustomGenerateViewOptions: AnyFn | undefined;
let originalCustomGeneratePreviewOptions: AnyFn | undefined;
function ensureState() {
  if (!window[PLUGIN_EDIT_FLAG]) {
    window[PLUGIN_EDIT_FLAG] = { isEditPreview: false, lastMode: null };
  }
  return window[PLUGIN_EDIT_FLAG]!;
}
function activateEditModeDetector() {
  const tryActivate = () => {
    if (
      typeof growiFacade === 'undefined' ||
      !growiFacade.markdownRenderer ||
      !growiFacade.markdownRenderer.optionsGenerators
    ) {
      return false; // 未準備
    }
    const { optionsGenerators } = growiFacade.markdownRenderer;
    // 多重差し込み防止: 既に差し込まれていたらスキップ
    if (optionsGenerators.customGenerateViewOptions === originalCustomGenerateViewOptions &&
        optionsGenerators.customGeneratePreviewOptions === originalCustomGeneratePreviewOptions) {
      return true; // 既に正しい
    }
    originalCustomGenerateViewOptions = optionsGenerators.customGenerateViewOptions;
    originalCustomGeneratePreviewOptions = optionsGenerators.customGeneratePreviewOptions;
    optionsGenerators.customGenerateViewOptions = (...args: any[]) => {
      const state = ensureState();
      state.isEditPreview = false;
      state.lastMode = 'view';
      const base = originalCustomGenerateViewOptions ?? optionsGenerators.generateViewOptions;
      const viewOptions = base ? base(...args) : {};
      // 状態変更を通知
      try { window.dispatchEvent(new CustomEvent('vivlio:edit-mode-changed', { detail: { isEditPreview: state.isEditPreview } })); } catch (e) {}
      // Reactツリーは常時マウント済みなので何もしない
      return viewOptions;
    };
    optionsGenerators.customGeneratePreviewOptions = (...args: any[]) => {
      const state = ensureState();
      state.isEditPreview = true;
      state.lastMode = 'preview';
      const base = originalCustomGeneratePreviewOptions ?? optionsGenerators.generatePreviewOptions;
      const previewOptions = base ? base(...args) : {};
      // 状態変更を通知
      try { window.dispatchEvent(new CustomEvent('vivlio:edit-mode-changed', { detail: { isEditPreview: state.isEditPreview } })); } catch (e) {}
      // Reactツリーは常時マウント済みなので何もしない
      return previewOptions;
    };
    return true; // 成功
  };

  // 即時試行
  if (tryActivate()) return;

  // 遅延試行: 数秒で停止
  let attempts = 0;
  const maxAttempts = 50; // 5秒 (100ms * 50)
  const intervalId = setInterval(() => {
    attempts++;
    if (tryActivate() || attempts >= maxAttempts) {
      clearInterval(intervalId);
    }
  }, 100);

  // DOMイベントでも試行
  const retryOnEvent = () => {
    if (tryActivate()) {
      window.removeEventListener('hashchange', retryOnEvent);
      window.removeEventListener('popstate', retryOnEvent);
      document.removeEventListener('DOMContentLoaded', retryOnEvent);
    }
  };
  window.addEventListener('hashchange', retryOnEvent);
  window.addEventListener('popstate', retryOnEvent);
  document.addEventListener('DOMContentLoaded', retryOnEvent);

  // Fix3: 自己修復（定期チェック）
  setInterval(() => {
    tryActivate();
  }, 5000); // 5秒ごとにチェック
}
function deactivateEditModeDetector() {
  if (
    typeof growiFacade === 'undefined' ||
    !growiFacade.markdownRenderer ||
    !growiFacade.markdownRenderer.optionsGenerators
  ) {
    return;
  }
  const { optionsGenerators } = growiFacade.markdownRenderer;
  if (originalCustomGenerateViewOptions) {
    optionsGenerators.customGenerateViewOptions = originalCustomGenerateViewOptions;
  }
  if (originalCustomGeneratePreviewOptions) {
    optionsGenerators.customGeneratePreviewOptions = originalCustomGeneratePreviewOptions;
  }
}
// client-entry.tsx
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import PreviewShell from './src/ui/PreviewShell';
import { AppProvider } from './src/context/AppContext';
import config from './package.json';

// 早期ロード確認ログ (script が読み込まれているか最初に出る)
// eslint-disable-next-line no-console
console.debug('[VivlioDBG][entry] script file evaluated', { time: Date.now(), plugin: config.name });

// GROWIのスクリプトプラグイン規約：activate/deactivateのみ担当
const PLUGIN_ID = config.name;
const CONTAINER_ID = 'vivlio-plugin-root';
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

  // Reactツリーを常時マウント（bodyにホストを作成）
  let host = document.getElementById(CONTAINER_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = CONTAINER_ID;
    host.style.display = 'none'; // 常時非表示（Portalで制御）
    document.body.appendChild(host);
    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG][mount] host container created and appended to body');
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
  console.debug('[VivlioDBG][mount] rendering React tree', { hasHost: !!host });
  root.render(
    <React.StrictMode>
      <AppProvider>
        <div style={{ display: 'contents' }}>
          <PreviewShell />
        </div>
      </AppProvider>
    </React.StrictMode>
  );
  // eslint-disable-next-line no-console
  console.debug('[VivlioDBG][mount] mount finished');
}function unmount() {
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
  activateEditModeDetector();
  mount(); // Reactツリーを常時マウント
};

const deactivate = () => {
  // eslint-disable-next-line no-console
  console.debug('[VivlioDBG] deactivate() invoked', { time: Date.now() });
  deactivateEditModeDetector();
  unmount();
};

// GROWIへ登録
if ((window as any).pluginActivators == null) (window as any).pluginActivators = {};
(window as any).pluginActivators[PLUGIN_ID] = { activate, deactivate };
// eslint-disable-next-line no-console
console.debug('[VivlioDBG][entry] pluginActivators registered', { id: PLUGIN_ID });

// (removed automatic 3s auto-activate fallback to avoid unsolicited activation/log spam)

// 手動強制呼び出し用フック
(window as any).__vivlio_forceActivate = activate;
(window as any).__vivlio_forceUnmount = unmount;
