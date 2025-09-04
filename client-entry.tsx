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
  if (
    typeof growiFacade === 'undefined' ||
    !growiFacade.markdownRenderer ||
    !growiFacade.markdownRenderer.optionsGenerators
  ) {
    return;
  }
  const { optionsGenerators } = growiFacade.markdownRenderer;
  originalCustomGenerateViewOptions = optionsGenerators.customGenerateViewOptions;
  originalCustomGeneratePreviewOptions = optionsGenerators.customGeneratePreviewOptions;
  optionsGenerators.customGenerateViewOptions = (...args: any[]) => {
    const state = ensureState();
    state.isEditPreview = false;
    state.lastMode = 'view';
    const base = originalCustomGenerateViewOptions ?? optionsGenerators.generateViewOptions;
    const viewOptions = base ? base(...args) : {};
    return viewOptions;
  };
  optionsGenerators.customGeneratePreviewOptions = (...args: any[]) => {
    const state = ensureState();
    state.isEditPreview = true;
    state.lastMode = 'preview';
    const base = originalCustomGeneratePreviewOptions ?? optionsGenerators.generatePreviewOptions;
    const previewOptions = base ? base(...args) : {};
    return previewOptions;
  };
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
  if (!previewContainer) {
  // eslint-disable-next-line no-console
    console.debug('[VivlioDBG][mount] previewContainer not found, will retry on navigation (hash/popstate) or DOMContentLoaded');
    // Avoid busy-loop retries. Retry once when navigation/hash changes or when DOMContentLoaded fires.
    const retryHandler = () => {
      try {
        if (!(window as any).__vivlio_root) mount();
      } finally {
        window.removeEventListener('hashchange', retryHandler as EventListener);
        window.removeEventListener('popstate', retryHandler as EventListener);
        document.removeEventListener('DOMContentLoaded', retryHandler as EventListener);
      }
    };
    window.addEventListener('hashchange', retryHandler as EventListener, { once: true });
    // popstate may be fired by SPA navigations; ensure we remove it after first invocation
    window.addEventListener('popstate', retryHandler as EventListener);
    // If document wasn't ready earlier, also retry on DOMContentLoaded
    document.addEventListener('DOMContentLoaded', retryHandler as EventListener, { once: true });
    // If the current URL already indicates editor mode, start a short bounded poll
    // because some UI frameworks create the preview container slightly later.
    try {
      const hasEditPath = (() => { 
        try { 
          if (location && (String(location.hash).indexOf('#edit') !== -1 || String(location.pathname).indexOf('/edit') !== -1)) return true;
          // GROWI の編集画面ではルート要素に "editing" クラスが追加される
          const rootEl = document.querySelector('.layout-root');
          if (rootEl && rootEl.classList.contains('editing')) return true;
          return false;
        } catch { return false; } 
      })();
      if (hasEditPath) {
        let pollAttempts = 0;
        const maxPollAttempts = 10;
        const pollIntervalMs = 200;
        const pollId = setInterval(() => {
          pollAttempts += 1;
          const fut = locatePreviewContainer();
          if (fut) {
            clearInterval(pollId);
            try { if (!(window as any).__vivlio_root) mount(); } catch {}
            // cleanup retry handlers just in case
            window.removeEventListener('hashchange', retryHandler as EventListener);
            window.removeEventListener('popstate', retryHandler as EventListener);
            document.removeEventListener('DOMContentLoaded', retryHandler as EventListener);
            return;
          }
          if (pollAttempts >= maxPollAttempts) {
            clearInterval(pollId);
          }
        }, pollIntervalMs);
      }
    } catch (e) {
      // ignore environment errors
    }
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
  console.debug('[VivlioDBG][mount] host container created and appended');
  // notify listeners that preview host/container is available
  try { window.dispatchEvent(new CustomEvent('vivlio:preview-ready', { detail: { container: host } })); } catch (e) {}
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
  try { window.dispatchEvent(new CustomEvent('vivlio:preview-mounted', { detail: { hostChildrenAfter: host.childElementCount } })); } catch (e) {}
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
  activateEditModeDetector();
  mount();
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
